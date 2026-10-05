const {test,expect}=require('@playwright/test');
const path=require('node:path');
const fs=require('node:fs/promises');
const fixture=name=>path.join(__dirname,'fixtures',name);
const open=async page=>{await page.goto('');await expect(page.locator('#dbInfo')).toContainText('100 % local');};
const add=async(page,name)=>{await page.getByRole('button',{name:'＋ Nouvel exercice',exact:true}).click();await page.locator('#exName').fill(name);};
const save=async page=>{await page.locator('#exSaveBtn').click();await expect(page.locator('#exoSheet')).not.toHaveClass(/on/);};
test('create, edit and persist; workout duration includes preparation; delete cleans references',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await open(page);await add(page,'Coupes de sabre');await page.locator('#exDur').fill('5');await page.locator('#exCat').fill('Technique');await save(page);
  await page.reload();await expect(page.locator('#libList')).toContainText('Coupes de sabre');await page.screenshot({path:test.info().outputPath('library.png')});
  await page.locator('nav [data-p=train]').click();await page.getByRole('button',{name:'＋ Nouvel entraînement'}).click();await page.locator('#wName').fill('Matin');await page.getByRole('button',{name:'Ajouter',exact:true}).click();await page.locator('#buildSheet').getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.locator('#trainList')).toContainText('0:15');
  await page.locator('nav [data-p=lib]').click();await page.locator('.exname').first().click();await page.locator('#exDelBtn').click();
  await expect(page.locator('#libList')).toContainText('Aucun exercice');
  await page.locator('nav [data-p=train]').click();await expect(page.locator('#trainList')).toContainText('0 exercices');expect(errors).toEqual([]);
});
for(const extension of ['mp4','mkv','webm'])test(`${extension}: import, real decoding, persisted playback after reload`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{console.log('App dialog:',d.message());await d.accept();});
  await open(page);await add(page,`Vidéo ${extension}`);await page.locator('#exVid').setInputFiles(fixture('sample.'+extension));
  await expect(page.locator('#exVidInfo')).toContainText(/(MP4 prêt|Vidéo prête)/,{timeout:60000});
  await expect(page.locator('#exSaveBtn')).toBeEnabled();await save(page);await page.reload();
  await page.locator('#libList button').click();
  await expect.poll(()=>page.locator('#pVideo').evaluate(v=>v.videoWidth>0&&!v.paused&&v.currentTime>0),{timeout:15000}).toBe(true);
  if(extension==='mkv')await page.screenshot({path:test.info().outputPath('player.png')});
  await page.locator('#pPauseBtn').click();await expect.poll(()=>page.locator('#pVideo').evaluate(v=>v.paused)).toBe(true);
  await page.locator('#pPauseBtn').click();await expect.poll(()=>page.locator('#pVideo').evaluate(v=>!v.paused)).toBe(true);
  await page.locator('#pClose').click();expect(errors).toEqual([]);
});
test('backup round trip includes video; invalid replace preserves current library',async({page})=>{
  page.on('dialog',d=>d.accept());await open(page);await add(page,'Sauvegardé');await page.locator('#exVid').setInputFiles(fixture('sample.mp4'));await expect(page.locator('#exVidInfo')).toContainText('Vidéo prête');await save(page);
  await page.locator('nav [data-p=data]').click();const downloadPromise=page.waitForEvent('download');await page.locator('#expFullBtn').click();const download=await downloadPromise;const file=await download.path();const data=JSON.parse(await fs.readFile(file,'utf8'));expect(data.exercises[0].videoB64.length).toBeGreaterThan(100);
  await page.locator('#impFile').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...data,exercises:[{...data.exercises[0],id:"bad');alert(1)//"}]}))});await page.getByRole('button',{name:'Remplacer tout'}).click();await expect(page.locator('#impStatus')).toContainText('Aucune donnée n’a été modifiée');
  await page.locator('#impFile').setInputFiles(file);await page.getByRole('button',{name:'Remplacer tout'}).click();await expect(page.locator('#impStatus')).toContainText('Import terminé');
  await page.locator('nav [data-p=lib]').click();await expect(page.locator('#libList')).toContainText('Sauvegardé');await page.reload();await page.locator('#libList button').click();await expect.poll(()=>page.locator('#pVideo').evaluate(v=>v.videoWidth>0&&!v.paused)).toBe(true);
});
test('PWA starts offline and plays diagnostic plus saved videos',async({page,browser})=>{
  const server=await require('./offline-server.cjs')();
  try{
    await page.goto(server.url);await expect(page.locator('#dbInfo')).toContainText('100 % local');
    await add(page,'Hors ligne');await page.locator('#exVid').setInputFiles(fixture('sample.mp4'));await expect(page.locator('#exVidInfo')).toContainText('Vidéo prête');await save(page);
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
    await page.locator('nav [data-p=data]').click();await expect(page.locator('#pwaStatus')).toContainText('prête hors ligne');
    await server.close();
    const control=await browser.newContext();
    try{const noCache=await control.newPage();await expect(noCache.goto(server.url)).rejects.toThrow();}finally{await control.close();}
    await page.reload();await expect(page.locator('#libList')).toContainText('Hors ligne');await page.locator('#libList button').click();await expect.poll(()=>page.locator('#pVideo').evaluate(v=>v.videoWidth>0&&!v.paused)).toBe(true);await page.locator('#pClose').click();
    await page.locator('nav [data-p=data]').click();await page.getByRole('button',{name:'Tester',exact:true}).click();await expect(page.locator('#diagRes')).toContainText('lecture effective');
  }finally{await server.close();}
});
test.describe('conversion cancellation',()=>{
  test.use({serviceWorkers:'block'});
  test('cancel import never attaches its video to a different exercise',async({page,context})=>{
  let heldRequest;await context.route('**/vendor/ffmpeg/index.js',route=>{heldRequest=route;});
  await open(page);await add(page,'Annulé');await page.locator('#exVid').setInputFiles(fixture('sample.webm'));await page.locator('#cancelConvBtn').click();await expect(page.locator('#exVidInfo')).toContainText('annulé');if(heldRequest)await heldRequest.abort();await page.locator('#exoSheet').getByRole('button',{name:'Annuler',exact:true}).click();
  await add(page,'Sans vidéo');await save(page);await page.waitForTimeout(500);await page.reload();await expect(page.locator('#dbInfo')).toContainText('0 vidéos');
});
});
