'use strict';

// An import belongs to a single editor opening. Old asynchronous work never
// updates a different exercise, and no File-picker reference is persisted.
let pendingVideo=null, videoRemoved=false, mediaBusy=false, mediaFailed=false;
let mediaGeneration=0, previewURL=null, conversionJob=null;
const MAX_CONVERT_BYTES=200*1024*1024;
function videoMime(file){
  const extension=(file.name||'').toLowerCase().split('.').pop();
  const known={mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm',mkv:'video/x-matroska'};
  return known[extension] || (file.type?.startsWith('video/')?file.type:'application/octet-stream');
}
function mediaErr(error){
  return ({1:'chargement interrompu',2:'erreur de lecture',3:'codec non décodable',4:'format non pris en charge'})[error?.code]||'lecture indisponible';
}
function mediaStatus(text,error=false){$('exVidInfo').textContent=text;$('exVidInfo').style.color=error?'var(--obi)':'';}
function mediaControls(busy){
  mediaBusy=busy;
  $('exSaveBtn').disabled=busy;
  $('exVid').disabled=busy;
  $('convBtn').disabled=busy;
  $('exDelBtn').disabled=busy;
  $('removeVideoBtn').disabled=busy;
  $('cancelConvBtn').hidden=!busy;
  $('cancelConvBtn').textContent=conversionJob?'Annuler la conversion':'Annuler l’import';
}
function showVideoPreview(blob){
  const video=$('exVidPrev');video.pause();video.removeAttribute('src');video.load();
  if(previewURL)URL.revokeObjectURL(previewURL);
  previewURL=null;
  video.style.display=blob?'block':'none';$('removeVideoBtn').hidden=!blob;
  if(blob){previewURL=URL.createObjectURL(blob);video.src=previewURL;video.load();}
}
function cancelMediaWork(){
  mediaGeneration++;
  if(conversionJob){conversionJob.ff?.terminate();conversionJob=null;}
  mediaControls(false);showVideoPreview(null);pendingVideo=null;mediaFailed=false;
}
function cancelConversion(){
  const previous=editingExo?.video||null;
  cancelMediaWork();$('exVid').value='';videoRemoved=false;
  showVideoPreview(previous);
  $('convBtn').style.display=previous?'block':'none';
  mediaStatus(previous?'Import annulé. La vidéo enregistrée est conservée.':'Import annulé. Aucune vidéo ajoutée.');
}
function removeVideo(){
  cancelMediaWork();$('exVid').value='';videoRemoved=true;
  $('convBtn').style.display='none';mediaStatus('Vidéo retirée. Enregistre pour confirmer.');
}
function resetVideoEditor(exercise){
  cancelMediaWork();videoRemoved=false;$('exVid').value='';
  const blob=exercise?.video;
  $('convBtn').style.display=blob?'block':'none';
  showVideoPreview(blob);
  mediaStatus(blob?`Vidéo enregistrée (${fmtMo(blob.size)}). Tu peux la remplacer ou la convertir pour iPhone.`:'Aucune vidéo pour l’instant.');
  if(blob){
    const generation=mediaGeneration;
    probeVideo(blob).then(verdict=>{
      if(generation!==mediaGeneration)return;
      if(verdict==='ko')mediaStatus('Cette vidéo ne se lit pas ici. Convertis-la en MP4 pour cet appareil.',true);
    });
  }
}

// Metadata alone does not prove that a video frame can be decoded.
function probeVideo(blob){
  return new Promise(resolve=>{
    const video=document.createElement('video'),url=URL.createObjectURL(blob);
    let done=false,metadata=false;
    video.muted=true;video.playsInline=true;video.preload='auto';
    video.style.cssText='position:fixed;bottom:0;left:0;width:2px;height:2px;opacity:.01;pointer-events:none';
    document.body.appendChild(video);
    const finish=result=>{
      if(done)return;done=true;clearTimeout(timeout);
      video.onloadedmetadata=video.onloadeddata=video.onplaying=video.onerror=null;
      video.pause();video.removeAttribute('src');video.load();video.remove();URL.revokeObjectURL(url);resolve(result);
    };
    const timeout=setTimeout(()=>finish(metadata?'unknown':'ko'),8000);
    video.onloadedmetadata=()=>{metadata=video.videoWidth>0;};
    video.onloadeddata=()=>{if(video.videoWidth>0&&video.readyState>=2)finish('ok');};
    video.onplaying=()=>{if(video.videoWidth>0)finish('ok');};
    video.onerror=()=>finish('ko');
    video.src=url;video.load();video.play().catch(()=>{});
  });
}

$('exVid').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  cancelMediaWork();videoRemoved=false;
  const generation=mediaGeneration;
  mediaControls(true);mediaStatus(`Lecture du fichier (${fmtMo(file.size)})…`);
  try{
    if(!file.size)throw new Error('Le fichier est vide.');
    if(file.size>MAX_CONVERT_BYTES&&/matroska|webm/.test(videoMime(file)))throw new Error('Ce MKV/WebM dépasse 200 Mo : convertis-le en MP4 H.264/AAC sur ordinateur avant de l’importer.');
    const blob=new Blob([await file.arrayBuffer()],{type:videoMime(file)});
    if(generation!==mediaGeneration)return;
    pendingVideo=blob;showVideoPreview(blob);
    $('convBtn').style.display='block';
    // Normalize container types with inconsistent iPhone support at import time.
    const portable=/matroska|webm/.test(blob.type);
    const verdict=portable?'ko':await probeVideo(blob);
    if(generation!==mediaGeneration)return;
    mediaControls(false);
    if(verdict==='ko'){mediaFailed=true;await convertToMp4();}
    else mediaStatus(verdict==='ok'?`Vidéo prête (${fmtMo(blob.size)}) — image décodée sur cet appareil. Enregistre pour la garder.`:'Format reconnu, lecture à vérifier dans l’aperçu. Une conversion MP4 reste disponible.');
  }catch(error){
    if(generation===mediaGeneration){mediaFailed=true;mediaStatus('Import impossible : '+error.message,true);}
  }finally{if(generation===mediaGeneration)mediaControls(false);}
});

async function convertToMp4(){
  if(mediaBusy)return;
  const source=pendingVideo||(!videoRemoved&&editingExo?.video);
  if(!source)return;
  if(source.size>MAX_CONVERT_BYTES){
    mediaStatus('Cette vidéo dépasse 200 Mo. Pour éviter de saturer le téléphone, convertis-la sur ordinateur en MP4 H.264/AAC, puis importe le MP4.',true);return;
  }
  const generation=++mediaGeneration;
  const job={ff:null};conversionJob=job;mediaControls(true);
  const status=text=>{if(generation===mediaGeneration)mediaStatus(text);};
  let watchdog;
  try{
    status('Chargement du convertisseur (~32 Mo au premier usage)… Garde l’app ouverte.');
    // All scripts and the worker share this app’s origin, including on GitHub Pages.
    const {FFmpeg}=await import('./vendor/ffmpeg/index.js');
    if(generation!==mediaGeneration)return;
    const ff=new FFmpeg();job.ff=ff;
    const timedOut=new Promise((_,reject)=>{watchdog=setTimeout(()=>{ff.terminate();reject(new Error('Chargement trop long. Vérifie la connexion puis réessaie.'));},60000);});
    await Promise.race([ff.load({coreURL:new URL('vendor/core/ffmpeg-core.js',location.href).href,wasmURL:new URL('vendor/core/ffmpeg-core.wasm',location.href).href}),timedOut]);
    clearTimeout(watchdog);
    if(generation!==mediaGeneration)return;
    ff.on('progress',({progress})=>{if(progress>0&&progress<=1)status(`Conversion : ${Math.round(progress*100)} %. Garde l’app ouverte.`);});
    status('Préparation de la vidéo…');
    await ff.writeFile('input',new Uint8Array(await source.arrayBuffer()));
    status('Conversion en MP4 H.264… Garde l’app ouverte.');
    const result=await ff.exec(['-i','input','-map','0:v:0','-map','0:a:0?','-sn','-dn',
      '-vf',"scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
      '-c:v','libx264','-preset','ultrafast','-crf','24','-pix_fmt','yuv420p','-threads','1',
      '-c:a','aac','-b:a','128k','-ac','2','-movflags','+faststart','output.mp4'],10*60*1000);
    if(result!==0)throw new Error('Le fichier est endommagé, son codec est indisponible ou la conversion a dépassé 10 minutes.');
    const output=await ff.readFile('output.mp4');
    const blob=new Blob([output],{type:'video/mp4'});
    if(blob.size<100)throw new Error('Le convertisseur n’a pas produit de vidéo.');
    status('Vérification du MP4…');
    const verdict=await probeVideo(blob);
    if(generation!==mediaGeneration)return;
    if(verdict==='ko')throw new Error('Le MP4 converti ne peut pas être décodé sur cet appareil.');
    pendingVideo=blob;videoRemoved=false;mediaFailed=false;showVideoPreview(blob);$('convBtn').style.display='none';
    status(`MP4 prêt (${fmtMo(blob.size)})${verdict==='ok'?' — image décodée':''}. Enregistre pour le garder.`);
  }catch(error){
    if(generation===mediaGeneration)mediaStatus('Conversion impossible : '+(error.message||error)+' Tu peux réessayer avec une vidéo plus courte ou un MP4 préparé sur ordinateur.',true);
  }finally{
    clearTimeout(watchdog);job.ff?.terminate();
    if(conversionJob===job)conversionJob=null;
    if(generation===mediaGeneration)mediaControls(false);
  }
}
function envLabel(){
  const standalone=navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
  return (standalone?'App sur l’écran d’accueil':'Navigateur')+' · '+(location.protocol==='file:'?'fichier local — ouvre la version hébergée pour installer l’app':location.protocol.replace(':',''));
}
async function runDiag(){
  const video=$('diagVid'),result=$('diagRes');
  video.onplaying=()=>result.textContent='MP4 H.264 : lecture effective ✓';
  video.onerror=()=>result.textContent='Échec : '+mediaErr(video.error)+'. Ouvre l’app dans Safari via son adresse HTTPS.';
  result.textContent='Test de lecture…';video.muted=true;video.src='test-video.mp4';video.load();
  try{await video.play();}catch(error){result.textContent='Lecture non démarrée : '+error.message;video.controls=true;}
}
async function migrateVideos(){
  const all=await idbAll('exercises');
  for(const exercise of all){
    if(exercise.video instanceof File){
      try{exercise.video=new Blob([await exercise.video.arrayBuffer()],{type:videoMime(exercise.video)});await idbPut('exercises',exercise);}
      catch{ /* Keep legacy data available for export or replacing its video. */ }
    }
  }
}
async function init(){
  document.body.classList.add('loading');
  try{await openDB();await migrateVideos();await reload();}
  catch(error){
    $('appError').hidden=false;
    $('appError').textContent='Impossible d’ouvrir les données locales : '+(error.message||error)+'. Réessaie dans Safari avec du stockage disponible. Aucune donnée n’a été effacée.';
  }finally{document.body.classList.remove('loading');}
}
init();
