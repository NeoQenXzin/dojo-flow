
/* =====================================================================
   DojoFlow v2 — appli d'entraînement locale (IndexedDB, aucune donnée cloud)
   Modes chrono & répétitions, comptage multilingue, sauvegarde JSON.
   ===================================================================== */
'use strict';

const DEFAULT_CATS = ['Échauffement','Étirement','Technique','Kata','Gumbop','Renfo'];
const DEFAULT_ARTS = ['Sabre','Arts martiaux','Capoeira','Muscu'];
const APP_VERSION = 2;

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

let exercises=[], workouts=[], journal=[];
async function reload(){
  exercises = (await idbAll('exercises')).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  workouts  = (await idbAll('workouts')).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  journal   = (await idbAll('journal')).sort((a,b)=>b.at-a.at);
  const nVid = exercises.filter(e=>e.video).length;
  document.getElementById('dbInfo').textContent = `${exercises.length} exos · ${nVid} vidéos · 100 % local`;
  refreshSelectors(); renderLib(); renderTrains(); renderJournal(); refreshStorage();
}

/* ---------- utilitaires ---------- */
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=s=>{s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const fmtMo=b=>b>1073741824?(b/1073741824).toFixed(2)+' Go':(b/1048576).toFixed(1)+' Mo';
const allCats=()=>[...new Set([...DEFAULT_CATS,...exercises.map(e=>e.cat).filter(Boolean)])];
const allArts=()=>[...new Set([...DEFAULT_ARTS,...exercises.map(e=>e.art).filter(Boolean)])];
const isReps=ex=>ex && ex.mode==='reps';
/* durée estimée d'un item de séquence */
function itemSecs(it,ex){
  if(!ex)return 0;
  if(isReps(ex)) return (it.reps||ex.reps||100)*(ex.tempo||1.5);
  return it.duration||ex.duration||60;
}
function itemLabel(it,ex){
  if(!ex)return '—';
  return isReps(ex) ? `×${it.reps||ex.reps} rép.` : fmt(it.duration||ex.duration);
}

const vidURLs=Object.create(null);
function vidURL(ex){
  if(!(ex.video instanceof Blob)) return null;
  if(!vidURLs[ex.id]) vidURLs[ex.id]=URL.createObjectURL(ex.video);
  return vidURLs[ex.id];
}
function dropVidURL(id){
  if(vidURLs[id]){URL.revokeObjectURL(vidURLs[id]);delete vidURLs[id]}
}

/* ---------- navigation ---------- */
function go(p){
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('on'));
  $('page-'+p).classList.add('on');
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.p===p));
  if(p==='data'){refreshStorage();document.getElementById('envInfo').textContent=envLabel()}
}

/* ---------- sélecteurs / datalists ---------- */
function refreshSelectors(){
  const arts=allArts(), cats=allCats();
  $('artsDl').innerHTML = arts.map(a=>`<option value="${esc(a)}">`).join('');
  $('catsDl').innerHTML = cats.map(c=>`<option value="${esc(c)}">`).join('');
  const artOpts='<option value="">Tous les arts</option>'+arts.map(a=>`<option>${esc(a)}</option>`).join('');
  const keep1=$('filtArt').value, keep2=$('randArt').value;
  $('filtArt').innerHTML=artOpts; $('filtArt').value=arts.includes(keep1)?keep1:'';
  $('randArt').innerHTML=artOpts; $('randArt').value=arts.includes(keep2)?keep2:'';
  const keep3=$('filtCat').value;
  $('filtCat').innerHTML='<option value="">Toutes catégories</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('');
  $('filtCat').value=cats.includes(keep3)?keep3:'';
  if(!$('recipeRows').children.length) defaultRecipe();
  else document.querySelectorAll('.recipe-cat').forEach(sel=>{
    const v=sel.value; sel.innerHTML=cats.map(c=>`<option>${esc(c)}</option>`).join(''); if(cats.includes(v))sel.value=v;
  });
}

/* =====================================================================
   BIBLIOTHÈQUE
   ===================================================================== */
function renderLib(){
  const fa=$('filtArt').value, fc=$('filtCat').value;
  const list=exercises.filter(e=>(!fa||e.art===fa)&&(!fc||e.cat===fc));
  if(!list.length){
    $('libList').innerHTML=`<div class="empty"><span class="kanji">技</span>Aucun exercice ici pour l'instant.<br>Crée ton premier exercice avec le bouton ci-dessus.</div>`;
    return;
  }
  $('libList').innerHTML=list.map(e=>`
    <div class="card row">
      <div class="thumb" onclick="openExoSheet('${e.id}')">${e.video?`<span aria-label="Vidéo disponible">▶</span>`:(isReps(e)?'数':'技')}</div>
      <div class="grow" onclick="openExoSheet('${e.id}')" style="cursor:pointer">
        <div class="exname">${esc(e.name)}</div>
        <div><span class="tag cat">${esc(e.cat||'—')}</span><span class="tag art">${esc(e.art||'—')}</span><span class="tag">${isReps(e)?'×'+e.reps+' · '+countLabel(e.count):fmt(e.duration)}</span></div>
      </div>
      <button class="btn small aka" onclick="playSolo('${e.id}')" title="Tester cet exercice">▶</button>
    </div>`).join('');
}
/* lance un exercice seul (test rapide depuis la bibliothèque) */
function playSolo(id){
  const ex=exercises.find(e=>e.id===id);
  if(!ex)return;
  playSeq({name:ex.name,items:[isReps(ex)?{exId:id,reps:ex.reps}:{exId:id,duration:ex.duration}],rest:0,prep:10});
}
const countLabel=c=>({metro:'métronome',fr:'voix FR',en:'voix EN',ja:'voix JA',ko:'voix KO'}[c]||'métronome');

let editingExo=null, exoMode='timer';
function setMode(m){
  exoMode=m;
  document.querySelectorAll('#modeSeg button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
  $('timerFields').style.display = m==='timer'?'block':'none';
  $('repsFields').style.display  = m==='reps'?'block':'none';
}
function openExoSheet(id){
  editingExo = id ? exercises.find(e=>e.id===id) : null;
  $('exoTitle').textContent = editingExo?'Modifier l\u2019exercice':'Nouvel exercice';
  $('exName').value = editingExo?.name||'';
  $('exArt').value  = editingExo?.art||'';
  $('exCat').value  = editingExo?.cat||'';
  $('exDur').value  = editingExo?.duration||60;
  $('exReps').value = editingExo?.reps||100;
  $('exTempo').value= editingExo?.tempo||1.5;
  $('exCount').value= editingExo?.count||'metro';
  $('exNotes').value= editingExo?.notes||'';
  $('exVid').value  = '';
  setMode(editingExo?.mode==='reps'?'reps':'timer');
  updateCountInfo();
  resetVideoEditor(editingExo);
  $('exDelBtn').style.display = editingExo?'block':'none';
  showSheet('exoSheet');
}
let savingForm=false;
const bounded=(value,min,max,fallback,integer=true)=>{
  const n=Number(value);
  return Number.isFinite(n)&&String(value).trim()!=='' ? Math.max(min,Math.min(max,integer?Math.trunc(n):n)) : fallback;
};
function readNumber(id,min,max,fallback,integer=true){
  const result=bounded($(id).value,min,max,fallback,integer);$(id).value=result;return result;
}
function saveError(err){alert('Enregistrement impossible. Tes données précédentes sont conservées. '+(err?.name==='QuotaExceededError'?'Le stockage est plein : libère de la place ou exporte tes données.':(err?.message||err)));}
function resetRandom(){randSeq=null;$('randResult').textContent='';}
async function saveExo(){
  if(savingForm||mediaBusy)return;
  const name=$('exName').value.trim();
  if(!name){alert('Donne un nom à l’exercice.');return}
  if(mediaFailed){alert('Convertis ou retire cette vidéo avant d’enregistrer.');return}
  savingForm=true;$('exSaveBtn').disabled=true;
  try{
    const ex={...(editingExo||{id:uid(),created:Date.now()}),name:name.slice(0,200),
      art:$('exArt').value.trim().slice(0,100),cat:$('exCat').value.trim().slice(0,100),mode:exoMode,
      duration:readNumber('exDur',5,7200,60),reps:readNumber('exReps',1,10000,100),
      tempo:readNumber('exTempo',.4,20,1.5,false),count:$('exCount').value,
      notes:$('exNotes').value.trim().slice(0,10000),video:videoRemoved?null:(pendingVideo||editingExo?.video||null)};
    await idbPut('exercises',ex);
    dropVidURL(ex.id);savingForm=false;closeSheets();resetRandom();await reload();
  }catch(err){saveError(err)}
  finally{savingForm=false;$('exSaveBtn').disabled=false;}
}
async function deleteExo(){
  if(!editingExo||savingForm||mediaBusy)return;
  const id=editingExo.id;
  const affected=workouts.filter(w=>w.items.some(i=>i.exId===id));
  if(!confirm(`Supprimer « ${editingExo.name} » ?${affected.length?' Il sera aussi retiré de '+affected.length+' entraînement(s).':''}`))return;
  savingForm=true;
  try{
    await idbBatch(['exercises','workouts'],transaction=>{
      transaction.objectStore('exercises').delete(id);
      affected.forEach(w=>transaction.objectStore('workouts').put({...w,items:w.items.filter(i=>i.exId!==id)}));
    });
    dropVidURL(id);savingForm=false;closeSheets();resetRandom();await reload();
  }catch(err){saveError(err)}finally{savingForm=false}
}
function sequenceSeconds(w){
  const items=w.items.filter(i=>exercises.some(e=>e.id===i.exId));
  return items.reduce((sum,i)=>sum+itemSecs(i,exercises.find(e=>e.id===i.exId)),0)+Math.max(0,items.length-1)*(w.rest||0)+items.length*(w.prep??10);
}

/* =====================================================================
   ENTRAÎNEMENTS (constructeur)
   ===================================================================== */
function renderTrains(){
  if(!workouts.length){
    $('trainList').innerHTML=`<div class="empty"><span class="kanji">形</span>Aucun entraînement enregistré.<br>Construis une séquence, ou génère-la au hasard.</div>`;
    return;
  }
  $('trainList').innerHTML=workouts.map(w=>{
    const tot=sequenceSeconds(w);
    return `<div class="card">
      <div class="row">
        <div class="grow">
          <div class="exname">${esc(w.name)}</div>
          <div class="muted">${w.items.filter(i=>exercises.some(e=>e.id===i.exId)).length} exercices · ≈ ${fmt(tot)} · repos ${w.rest||0}s</div>
        </div>
        <button class="btn small ghost" onclick="openBuilder('${w.id}')">✎</button>
        <button class="btn small aka" onclick="playWorkout('${w.id}')">▶</button>
      </div>
    </div>`}).join('');
}

let editingW=null, wItems=[];
function openBuilder(id){
  editingW = id ? workouts.find(w=>w.id===id) : null;
  wItems = editingW ? editingW.items.map(i=>({...i})) : [];
  $('buildTitle').textContent = editingW?'Modifier l\u2019entraînement':'Nouvel entraînement';
  $('wName').value = editingW?.name||'';
  $('wRest').value = editingW?.rest??15;
  $('wPrep').value = editingW?.prep??10;
  $('wDelBtn').style.display = editingW?'block':'none';
  $('wPick').innerHTML = exercises.length
    ? exercises.map(e=>`<option value="${e.id}">${esc(e.name)} (${esc(e.cat||'—')})</option>`).join('')
    : '<option value="">Bibliothèque vide</option>';
  renderWSeq();
  showSheet('buildSheet');
}
function renderWSeq(){
  $('wSeq').innerHTML = wItems.length ? wItems.map((it,i)=>{
    const ex=exercises.find(e=>e.id===it.exId);
    const rep=isReps(ex);
    const val=rep?(it.reps||ex.reps):(it.duration||ex?.duration||60);
    return `<div class="seq-item">
      <div class="idx">${i+1}</div>
      <div class="grow">
        <div style="font-weight:600;font-size:14px">${esc(ex?ex.name:'(supprimé)')}</div>
        <div class="dur"><input type="number" value="${val}" min="${rep?1:5}" max="${rep?10000:7200}" aria-label="${rep?'Répétitions':'Durée en secondes'}" style="width:72px;padding:4px 6px;font-size:13px" onchange="setWVal(${i},this)"> ${rep?'rép.':'sec'}</div>
      </div>
      <button class="icobtn" aria-label="Monter" onclick="moveW(${i},-1)">↑</button>
      <button class="icobtn" aria-label="Descendre" onclick="moveW(${i},1)">↓</button>
      <button class="icobtn" style="color:var(--aka)" aria-label="Retirer" onclick="wItems.splice(${i},1);renderWSeq()">✕</button>
    </div>`}).join('') : '<div class="muted" style="margin-bottom:8px">Séquence vide.</div>';
}
function setWVal(i,input){
  const v=input.value;
  const ex=exercises.find(e=>e.id===wItems[i].exId);
  if(isReps(ex)) wItems[i].reps=bounded(v,1,10000,ex.reps);
  else wItems[i].duration=bounded(v,5,7200,60);
  input.value=isReps(ex)?wItems[i].reps:wItems[i].duration;
}
function moveW(i,d){
  const j=i+d; if(j<0||j>=wItems.length)return;
  [wItems[i],wItems[j]]=[wItems[j],wItems[i]]; renderWSeq();
}
function builderAdd(){
  const id=$('wPick').value; if(!id||wItems.length>=1000)return;
  const ex=exercises.find(e=>e.id===id);
  wItems.push(isReps(ex)?{exId:id,reps:ex.reps}:{exId:id,duration:ex.duration});
  renderWSeq();
}
async function saveWorkout(){
  if(savingForm)return;
  const name=$('wName').value.trim();
  if(!name){alert('Donne un nom à l’entraînement.');return}
  const items=wItems.filter(i=>exercises.some(e=>e.id===i.exId)).map(i=>({...i}));
  if(!items.length){alert('Ajoute au moins un exercice.');return}
  savingForm=true;
  try{
    await idbPut('workouts',{...(editingW||{id:uid()}),name:name.slice(0,200),rest:readNumber('wRest',0,180,15),prep:readNumber('wPrep',0,60,10),items});
    savingForm=false;closeSheets();await reload();go('train');
  }catch(err){saveError(err)}finally{savingForm=false}
}
async function deleteWorkout(){
  if(!editingW||savingForm)return;
  if(!confirm(`Supprimer « ${editingW.name} » ?`))return;
  savingForm=true;
  try{await idbDel('workouts',editingW.id);savingForm=false;closeSheets();await reload();}
  catch(err){saveError(err)}finally{savingForm=false}
}

/* =====================================================================
   GÉNÉRATEUR ALÉATOIRE
   ===================================================================== */
function defaultRecipe(){
  $('recipeRows').innerHTML='';
  [['Échauffement',1],['Technique',2],['Kata',1],['Étirement',1]].forEach(([c,n])=>addRecipeRow(c,n));
}
function addRecipeRow(cat,n){
  if($('recipeRows').children.length>=100)return;
  const cats=allCats();
  const div=document.createElement('div');
  div.className='recipe-row';
  div.innerHTML=`<select class="recipe-cat">${cats.map(c=>`<option${c===cat?' selected':''}>${esc(c)}</option>`).join('')}</select>
    <input type="number" class="recipe-n" value="${n||1}" min="1" max="10">
    <button class="icobtn" style="color:var(--aka)" onclick="this.parentNode.remove()">✕</button>`;
  $('recipeRows').appendChild(div);
}
let randSeq=null;
function generateRandom(){
  const art=$('randArt').value;
  const pool=exercises.filter(e=>!art||e.art===art);
  const seq=[]; const missing=[];
  document.querySelectorAll('.recipe-row').forEach(r=>{
    const cat=r.querySelector('.recipe-cat').value;
    const input=r.querySelector('.recipe-n');
    const n=bounded(input.value,1,10,1);input.value=n;
    const cand=pool.filter(e=>e.cat===cat);
    if(!cand.length){missing.push(cat);return}
    const bag=[...cand];
    for(let i=0;i<n;i++){
      if(!bag.length)bag.push(...cand);
      const k=Math.floor(Math.random()*bag.length);
      const ex=bag.splice(k,1)[0];
      seq.push(isReps(ex)?{exId:ex.id,reps:ex.reps}:{exId:ex.id,duration:ex.duration});
    }
  });
  if(!seq.length){
    $('randResult').innerHTML=`<div class="empty" style="margin-top:12px">Rien à piocher : ajoute des exercices dans ces catégories${art?` pour « ${esc(art)} »`:''}.</div>`;
    randSeq=null; return;
  }
  randSeq={name:'Séance aléatoire',items:seq,rest:readNumber('randRest',0,180,15),prep:readNumber('randPrep',0,60,10)};
  const warn=missing.length?`<div class="muted" style="margin-bottom:8px">⚠️ Aucun exercice trouvé pour : ${missing.map(esc).join(', ')}</div>`:'';
  const tot=sequenceSeconds(randSeq);
  $('randResult').innerHTML=`<h2>Séance proposée · ≈ ${fmt(tot)}</h2>${warn}`+
    seq.map((it,i)=>{
      const ex=exercises.find(e=>e.id===it.exId);
      return `<div class="seq-item"><div class="idx">${i+1}</div>
        <div class="grow"><div style="font-weight:600;font-size:14px">${esc(ex.name)}</div>
        <div class="dur">${esc(ex.cat||'—')} · ${itemLabel(it,ex)}</div></div>
        ${ex.video?'<span class="tag">🎬</span>':''}</div>`;
    }).join('')+
    `<div class="row" style="margin-top:10px">
      <button class="btn ghost grow" onclick="generateRandom()">↻ Re-tirer</button>
      <button class="btn ghost grow" onclick="saveRandom()">💾 Garder</button>
      <button class="btn aka grow" onclick="playSeq(randSeq)">▶ Lancer</button>
    </div>`;
}
async function saveRandom(){
  if(!randSeq)return;
  const name=prompt('Nom de cet entraînement ?','Séance aléatoire du '+new Date().toLocaleDateString('fr-FR'));
  if(!name?.trim())return;
  try{await idbPut('workouts',{id:uid(),name:name.trim().slice(0,200),rest:randSeq.rest,prep:randSeq.prep,items:randSeq.items});
  await reload(); go('train');}catch(err){saveError(err)}
}

let sheetFocus=null;
function showSheet(id){
  sheetFocus=document.activeElement;
  $('sheetBg').classList.add('on');$(id).classList.add('on');
  $(id).setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
  $(id).focus({preventScroll:true});
}
function closeSheets(){
  if(savingForm)return;
  cancelMediaWork();
  $('sheetBg').classList.remove('on');
  document.querySelectorAll('.sheet').forEach(s=>{s.classList.remove('on');s.setAttribute('aria-hidden','true')});
  document.body.classList.remove('modal-open');
  clearCountTest();window.speechSynthesis?.cancel();
  sheetFocus?.focus({preventScroll:true});
}
document.addEventListener('keydown',event=>{
  const sheet=document.querySelector('.sheet.on');
  if(!sheet)return;
  if(event.key==='Escape')closeSheets();
  if(event.key==='Tab'){
    const focusable=[...sheet.querySelectorAll('button,input,select,textarea')].filter(e=>!e.disabled&&e.offsetParent!==null);
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===sheet)){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
  }
});
