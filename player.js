'use strict';
/* =====================================================================
   AUDIO — gong, bips, tic, encouragements
   ===================================================================== */
let AC=null, master=null;
function audio(){
  loadVoices();
  try{
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    if(!AudioContext)return null;
    if(!AC){AC=new AudioContext();master=AC.createGain();master.gain.value=voiceOn?.9:0;master.connect(AC.destination)}
    if(AC.state==='suspended'||AC.state==='interrupted')Promise.resolve(AC.resume()).catch(()=>{});
    return AC;
  }catch(e){return null}
}
function gong(base=105,dur=3){
  const ctx=audio();if(!ctx||!voiceOn)return;const t=ctx.currentTime;
  const g=ctx.createGain();
  g.gain.setValueAtTime(.001,t);
  g.gain.exponentialRampToValueAtTime(.85,t+.02);
  g.gain.exponentialRampToValueAtTime(.0008,t+dur);
  g.connect(master);
  [1,2.05,2.76,4.1,5.43].forEach((m,i)=>{
    const o=ctx.createOscillator();o.type='sine';o.frequency.value=base*m;
    const og=ctx.createGain();og.gain.value=1/(i+1.2);
    o.connect(og);og.connect(g);o.start(t);o.stop(t+dur);
  });
}
function bip(freq=880,len=.12,vol=.4){
  const ctx=audio();if(!ctx||!voiceOn)return;const t=ctx.currentTime;
  const o=ctx.createOscillator();o.type='square';o.frequency.value=freq;
  const g=ctx.createGain();
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+len);
  o.connect(g);g.connect(master);o.start(t);o.stop(t+len);
}
/* claves / bloc de bois pour le métronome */
function tic(accent){
  const ctx=audio();if(!ctx||!voiceOn)return;const t=ctx.currentTime;
  const o=ctx.createOscillator();o.type='sine';
  o.frequency.setValueAtTime(accent?1650:1100,t);
  o.frequency.exponentialRampToValueAtTime(accent?900:600,t+.06);
  const g=ctx.createGain();
  g.gain.setValueAtTime(accent?.6:.4,t);
  g.gain.exponentialRampToValueAtTime(.001,t+(accent?.11:.07));
  o.connect(g);g.connect(master);o.start(t);o.stop(t+.12);
}
let voiceOn=true;
/* --- voix système : sélection explicite par langue --- */
let VOICES=[];
function loadVoices(){try{VOICES=window.speechSynthesis?.getVoices()||[]}catch(e){VOICES=[]}}
function cancelSpeech(){try{window.speechSynthesis?.cancel()}catch(e){}}
if(window.speechSynthesis){loadVoices();window.speechSynthesis.onvoiceschanged=loadVoices}
function pickVoice(lang){
  const p=(lang||'fr').slice(0,2).toLowerCase();
  const cands=VOICES.filter(v=>v.lang && v.lang.toLowerCase().startsWith(p));
  if(!cands.length)return null;
  // privilégie une voix locale (hors-ligne), sinon la première trouvée
  return cands.find(v=>v.localService)||cands[0];
}
const voiceAvailable=code=>!!pickVoice(COUNT_LANG[code]||code||'fr-FR');
function say(txt,lang){
  if(!voiceOn||!window.speechSynthesis||!window.SpeechSynthesisUtterance)return;
  try{
    cancelSpeech();
    const u=new window.SpeechSynthesisUtterance(txt);
    u.lang=lang||'fr-FR';u.rate=1.05;u.pitch=1;
    const v=pickVoice(u.lang);if(v)u.voice=v;
    window.speechSynthesis.speak(u);
  }catch(e){}
}
function toggleVoice(){
  voiceOn=!voiceOn;
  $('pVoiceBtn').textContent=voiceOn?'🔊':'🔇';
  if(!voiceOn)cancelSpeech();
  if(master)master.gain.value=voiceOn?.9:0;
}
const MID_MSGS=['Mi-parcours, tiens bon !','La moitié est faite !','Tu es à la moitié, continue !'];
const END_MSGS=['Dernière ligne droite !','Encore un effort !','Finis en beauté !','Presque fini, donne tout !'];
const pick=a=>a[Math.floor(Math.random()*a.length)];

/* ---------- nombres parlés (comptage de dojo) ---------- */
const COUNT_LANG={fr:'fr-FR',en:'en-US',ja:'ja-JP',ko:'ko-KR'};
const JA_U=['','いち','に','さん','し','ご','ろく','しち','はち','きゅう'];
const JA_T={1:'じゅう',2:'にじゅう',3:'さんじゅう',4:'よんじゅう',5:'ごじゅう',6:'ろくじゅう',7:'ななじゅう',8:'はちじゅう',9:'きゅうじゅう'};
const JA_H={1:'ひゃく',2:'にひゃく',3:'さんびゃく',4:'よんひゃく',5:'ごひゃく',6:'ろっぴゃく',7:'ななひゃく',8:'はっぴゃく',9:'きゅうひゃく'};
const KO_U=['','일','이','삼','사','오','육','칠','팔','구'];
function numWord(n,lang){
  if(n===10000)return lang==='ja'?'いちまん':lang==='ko'?'만':String(n);
  if(!Number.isInteger(n)||n<1||n>10000)return String(n);
  if(lang==='ja'){
    if(n<10)return JA_U[n];
    if(n>=1000){const k=Math.floor(n/1000);return (k===3?'さんぜん':k===8?'はっせん':(k>1?JA_U[k]:'')+'せん')+numTail(n%1000,'ja')}
    return numTail(n,'ja');
  }
  if(lang==='ko'){
    if(n<10)return KO_U[n];
    if(n>=1000){const k=Math.floor(n/1000);return (k>1?KO_U[k]:'')+'천'+numTail(n%1000,'ko')}
    return numTail(n,'ko');
  }
  return String(n); // fr / en : le TTS lit le nombre
}
function numTail(n,lang){
  let s='';
  const h=Math.floor(n/100), t=Math.floor((n%100)/10), u=n%10;
  if(lang==='ja'){
    if(h)s+=JA_H[h];
    if(t)s+=JA_T[t];
    if(u)s+=JA_U[u];
  }else{
    if(h)s+=(h>1?KO_U[h]:'')+'백';
    if(t)s+=(t>1?KO_U[t]:'')+'십';
    if(u)s+=KO_U[u];
  }
  return s;
}
/* comptage de dojo : 1..9 puis annonce de la dizaine (10, 20, 30…) */
function speakRep(n,lang){
  const spoken = (n%10===0) ? n : n%10;
  say(numWord(spoken,lang),COUNT_LANG[lang]);
}
const LANG_NAMES={fr:'française',en:'anglaise',ja:'japonaise',ko:'coréenne'};
function updateCountInfo(){
  const l=$('exCount').value, info=$('exCountInfo');
  if(l==='metro'){info.textContent='Tic à chaque répétition, accent aux dizaines.';info.style.color='';return}
  loadVoices();
  if(voiceAvailable(l)){
    const v=pickVoice(COUNT_LANG[l]);
    info.textContent=`Voix ${LANG_NAMES[l]} détectée : ${v.name} ✓`;
    info.style.color='';
  }else{
    info.textContent=`⚠️ Aucune voix ${LANG_NAMES[l]} installée sur cet appareil — le comptage basculera sur le métronome. iPhone : Réglages → Accessibilité → Contenu énoncé → Voix.`;
    info.style.color='var(--obi)';
  }
}
let countTestTimers=[];
function clearCountTest(){countTestTimers.forEach(clearTimeout);countTestTimers=[]}
function testCount(){
  clearCountTest();cancelSpeech();
  const l=$('exCount').value;
  audio();if(master)master.gain.value=voiceOn?.9:0;
  if(l==='metro'){tic(false);countTestTimers=[setTimeout(()=>tic(false),450),setTimeout(()=>tic(true),900)];return}
  loadVoices();
  if(!voiceAvailable(l)){ updateCountInfo(); tic(false); return; }
  if(!window.speechSynthesis||!window.SpeechSynthesisUtterance)return;
  [1,2,3].forEach(n=>{
    const u=new window.SpeechSynthesisUtterance(numWord(n,l));
    u.lang=COUNT_LANG[l]; u.rate=1.05;
    const v=pickVoice(u.lang); if(v)u.voice=v;
    try{window.speechSynthesis.speak(u)}catch(e){}
  });
}

/* =====================================================================
   LECTEUR
   ===================================================================== */
const RING_C = 2*Math.PI*88;
$('ring').style.strokeDasharray=RING_C;

let P=null;
let wakeLock=null, wakeRequest=null, wakeRequestSerial=0;
const playerRunning=p=>!!p&&P===p&&p.status==='running';
const isExercise=st=>st&&(st.kind==='timer'||st.kind==='reps');
const playerNumber=(value,fallback,min,max)=>{
  const n=Number(value);
  return Math.min(max,Math.max(min,Number.isFinite(n)?n:fallback));
};
function releaseWakeLock(){
  wakeRequestSerial++;wakeRequest=null;
  const lock=wakeLock;wakeLock=null;
  try{if(lock)Promise.resolve(lock.release()).catch(()=>{})}catch(e){}
}
async function grabWakeLock(){
  const p=P;
  if(!playerRunning(p)||p.paused||document.visibilityState==='hidden'||!navigator.wakeLock)return;
  if((wakeLock&&!wakeLock.released)||wakeRequest===p)return;
  const serial=++wakeRequestSerial;wakeRequest=p;
  try{
    const lock=await navigator.wakeLock.request('screen');
    if(serial!==wakeRequestSerial||!playerRunning(p)||p.paused||document.visibilityState==='hidden'){
      await lock.release();return;
    }
    wakeLock=lock;
    lock.addEventListener?.('release',()=>{if(wakeLock===lock)wakeLock=null});
  }catch(e){}
  finally{if(serial===wakeRequestSerial)wakeRequest=null}
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'&&playerRunning(P)&&!P.paused){
    pauseSession();
    flashMsg('Séance en pause. Touche ▶ pour reprendre.');clearTimeout($('pMsg')._t);
  }
});

function playWorkout(id){
  const w=workouts.find(x=>x.id===id);
  if(w)playSeq(w);
}
const stepBudget=s=>s.kind==='reps'?s.reps*s.tempo:s.duration;
function playSeq(src){
  if(!src||!Array.isArray(src.items))return;
  const prep=playerNumber(src.prep??10,10,0,60);
  const rest=playerNumber(src.rest??0,0,0,180);
  const available=src.items.map(it=>({it,ex:exercises.find(e=>e.id===it.exId)})).filter(x=>x.ex);
  const steps=[];
  available.forEach(({it,ex},i)=>{
    if(i>0&&rest>0)steps.push({kind:'rest',name:'Repos',duration:rest});
    if(prep>0)steps.push({kind:'prep',name:'Prépare-toi',duration:prep,ex,forName:ex.name});
    if(isReps(ex))steps.push({kind:'reps',name:ex.name,cat:ex.cat,
      reps:Math.round(playerNumber(it.reps??ex.reps,100,1,10000)),
      tempo:playerNumber(ex.tempo,1.5,.4,20),count:ex.count||'metro',ex});
    else steps.push({kind:'timer',name:ex.name,cat:ex.cat,duration:playerNumber(it.duration??ex.duration,60,5,7200),ex});
  });
  if(!steps.length){alert('Séquence vide (exercices supprimés ?).');return}
  stopPlayer();clearCountTest();audio();
  const budgets=steps.map(stepBudget),now=performance.now();
  const p=P={steps,budgets,total:budgets.reduce((a,b)=>a+b,0),idx:-1,status:'running',
    paused:false,raf:null,repTimer:null,vidWatch:null,delay:null,stepToken:0,timers:new Set(),
    name:src.name||'Séance libre',startedAt:Date.now(),activeMs:0,activeSince:now,repsTotal:0,completedExos:0};
  if(master)master.gain.value=voiceOn?.9:0;
  $('player').classList.add('on');
  $('pPauseBtn').textContent='⏸';$('pPauseBtn').disabled=false;
  $('pVoiceBtn').textContent=voiceOn?'🔊':'🔇';
  $('pProg').style.width='0%';
  grabWakeLock();
  try{
    if(document.documentElement.requestFullscreen)Promise.resolve(document.documentElement.requestFullscreen()).then(()=>{
      if(!P&&document.fullscreenElement)Promise.resolve(document.exitFullscreen()).catch(()=>{});
    }).catch(()=>{});
  }catch(e){}
  nextStep();
  if(document.visibilityState==='hidden'&&P===p)pauseSession();
}
function sessProgress(withinSecs){
  if(!P||!P.total)return;
  const before=P.budgets.slice(0,P.idx).reduce((a,b)=>a+b,0);
  const frac=Math.min(1,(before+Math.max(0,withinSecs))/P.total);
  $('pProg').style.width=(frac*100).toFixed(1)+'%';
}
function clearStepEngines(p=P){
  if(!p)return;
  p.stepToken++;
  if(p.raf!==null)cancelAnimationFrame(p.raf);
  if(p.repTimer!==null)clearTimeout(p.repTimer);
  if(p.vidWatch!==null)clearTimeout(p.vidWatch);
  p.raf=p.repTimer=p.vidWatch=p.delay=null;p.playVideo=null;
  const v=$('pVideo');
  v.onerror=v.onplaying=v.oncanplay=v.onloadedmetadata=null;
}
// A single pausable timeout owns each repetition beat and its final transition.
function setStepDelay(fn,ms){
  const p=P;
  if(!playerRunning(p))return;
  if(p.repTimer!==null)clearTimeout(p.repTimer);
  p.delay={fn,remaining:Math.max(0,ms),due:0,token:p.stepToken};
  armStepDelay(p);
}
function armStepDelay(p){
  if(!playerRunning(p)||p.paused||!p.delay)return;
  const delay=p.delay;
  delay.due=performance.now()+delay.remaining;
  p.repTimer=setTimeout(()=>{
    if(!playerRunning(p)||p.paused||p.delay!==delay||p.stepToken!==delay.token)return;
    p.repTimer=null;p.delay=null;delay.fn();
  },delay.remaining);
}
function sessionTimeout(p,fn,ms){
  const id=setTimeout(()=>{p.timers.delete(id);if(P===p)fn()},ms);
  p.timers.add(id);return id;
}
function nextStep(){
  const p=P;
  if(!playerRunning(p))return;
  clearStepEngines();cancelSpeech();
  clearTimeout($('pMsg')._t);$('pMsg').classList.remove('show');
  p.idx++;
  if(p.idx>=p.steps.length){finishSession();return}
  const st=p.steps[p.idx];
  p.stepCompleted=false;p.midDone=false;p.endDone=false;
  $('player').classList.toggle('rest',st.kind==='rest');
  $('player').classList.toggle('reps',st.kind==='reps');
  $('player').classList.toggle('prep',st.kind==='prep');
  $('pPauseBtn').textContent=p.paused?'▶':'⏸';
  const exSteps=p.steps.filter(isExercise);
  const exNum=p.steps.slice(0,p.idx+1).filter(isExercise).length;
  $('pStep').textContent=st.kind==='rest'?'Repos':st.kind==='prep'?'Préparation':
    `Exercice ${exNum} / ${exSteps.length}${st.cat?' · '+st.cat:''}`;
  $('pName').textContent=st.kind==='prep'?st.forName:st.name;
  const nxt=p.steps.slice(p.idx+1).find(isExercise);
  $('pNext').textContent=st.kind==='prep'?'Mets-toi en place…':
    nxt?'À suivre : '+nxt.name:'Dernier exercice — après, c’est fini !';
  setupPlayerVideo(st);
  if(!p.paused){
    if(st.kind==='rest'){bip(520,.2,.3);say('Repos.')}
    else if(st.kind==='prep'){bip(520,.2,.35);say('Prépare-toi : '+st.forName)}
    else{
      gong(105,3);
      $('pFlash').classList.remove('go');void $('pFlash').offsetWidth;$('pFlash').classList.add('go');
      if(!prevWasPrep())say(st.name+(p.idx===0?'. C’est parti !':''));
    }
  }
  if(st.kind==='reps')startRepStep(st);
  else startTimerStep(st);
}
const prevWasPrep=()=>P&&P.idx>0&&P.steps[P.idx-1].kind==='prep';
function videoRetryButton(){
  let button=$('pVideoRetry');
  if(!button){
    button=document.createElement('button');button.id='pVideoRetry';button.type='button';
    button.className='btn ghost';button.textContent='▶ Lire la vidéo';
    button.style.cssText='display:none;margin:12px auto 0;pointer-events:auto';
    $('pNoVid').appendChild(button);
  }
  button.onclick=()=>{
    if(!playerRunning(P))return;
    audio();
    if(P.paused)togglePause();else P.playVideo?.(true);
  };
  return button;
}
function videoMessage(message,retry=false){
  $('pNoVidTxt').textContent=message;
  $('pNoVid').style.display='block';
  videoRetryButton().style.display=retry?'block':'none';
}
function setupPlayerVideo(st){
  const p=P,token=p.stepToken,v=$('pVideo'),retry=videoRetryButton();
  const current=()=>playerRunning(p)&&p.stepToken===token;
  $('pNoVid').style.display='none';retry.style.display='none';
  v.pause();v.muted=true;
  if(!st.ex?.video){
    v.removeAttribute('src');v.load();v.style.display='none';return;
  }
  v.style.display='block';
  let pending=false,playing=false;
  const failed=err=>{
    if(!current()||p.paused||err?.name==='AbortError')return;
    if(v.error||err?.name==='NotSupportedError'){showNoVid(st.ex);return}
    videoMessage('Touche le bouton pour lancer la vidéo.',true);
  };
  const tryPlay=(force=false)=>{
    if(!current()||p.paused||(pending&&force!==true))return;
    pending=true;
    try{Promise.resolve(v.play()).catch(failed).finally(()=>{pending=false})}
    catch(err){pending=false;failed(err)}
  };
  p.playVideo=tryPlay;
  v.onerror=()=>{if(current())showNoVid(st.ex)};
  v.onplaying=()=>{
    if(!current())return;
    if(p.paused){v.pause();return}
    playing=true;$('pNoVid').style.display='none';retry.style.display='none';
  };
  v.oncanplay=()=>tryPlay();v.onloadedmetadata=()=>tryPlay();
  try{v.src=vidURL(st.ex);v.load();tryPlay()}catch(err){failed(err)}
  p.vidWatch=setTimeout(()=>{
    p.vidWatch=null;
    if(current()&&!p.paused&&!playing&&!v.error)videoMessage('La vidéo attend de démarrer. Touche ▶ pour réessayer.',true);
  },8000);
}
function showNoVid(ex){
  videoMessage('Vidéo illisible : '+mediaErr($('pVideo').error)+'. Ouvre la fiche de cet exercice pour convertir ou remplacer sa vidéo.');
}

/* ---------- moteur chrono ---------- */
function stepElapsed(p=P){
  return p.stepElapsedMs+(p.paused?0:performance.now()-p.stepStartedAt);
}
function startTimerStep(st){
  P.stepElapsedMs=0;P.stepStartedAt=performance.now();P.bipsDone=new Set();
  $('pSub').textContent='';tickTimer();
}
function tickTimer(p=P,token=p?.stepToken){
  if(!playerRunning(p)||p.stepToken!==token)return;
  const st=p.steps[p.idx];
  if(!st||st.kind==='reps')return;
  p.raf=null;
  const elapsed=stepElapsed(p)/1000,remain=Math.max(0,st.duration-elapsed);
  $('ring').style.strokeDashoffset=RING_C*(1-Math.min(1,remain/st.duration));
  $('pClock').textContent=fmt(Math.ceil(remain));
  $('pPhase').textContent=p.paused?'pause':st.kind==='rest'?'repos':st.kind==='prep'?'préparation':'en cours';
  sessProgress(elapsed);
  if(p.paused)return;
  if(remain<=0){
    markStepComplete();
    if(st.kind==='timer')gong(78,3.5);
    nextStep();return;
  }
  if(st.kind==='timer'){
    if(!p.midDone&&st.duration>=40&&elapsed>=st.duration/2){
      p.midDone=true;const m=pick(MID_MSGS);bip(660,.15,.3);flashMsg(m);say(m);
    }
    if(!p.endDone&&st.duration>=30&&remain<=10){p.endDone=true;const m=pick(END_MSGS);flashMsg(m);say(m)}
  }
  const second=Math.ceil(remain);
  if(second>=1&&second<=3&&!p.bipsDone.has(second)){p.bipsDone.add(second);bip(880,.12,.45)}
  p.raf=requestAnimationFrame(()=>tickTimer(p,token));
}
function markStepComplete(){
  if(!playerRunning(P)||P.stepCompleted)return;
  P.stepCompleted=true;
  if(isExercise(P.steps[P.idx]))P.completedExos++;
}

/* ---------- moteur répétitions ---------- */
function startRepStep(st){
  loadVoices();
  if(st.count!=='metro'&&!voiceAvailable(st.count)){
    flashMsg('Voix '+(LANG_NAMES[st.count]||'demandée')+' non installée → métronome');st.count='metro';
  }
  P.rep=0;
  $('pClock').textContent='0';$('pSub').textContent='/ '+st.reps;
  $('pPhase').textContent=P.paused?'pause':'répétitions';
  $('ring').style.strokeDashoffset=RING_C;sessProgress(0);
  scheduleRep(st);
}
function scheduleRep(st){setStepDelay(()=>repBeat(st),st.tempo*1000)}
function repBeat(st){
  const p=P;
  if(!playerRunning(p)||p.paused||p.steps[p.idx]!==st||p.stepCompleted)return;
  const n=++p.rep;p.repsTotal++;
  $('pClock').textContent=n;
  $('pClock').classList.remove('pop');void $('pClock').offsetWidth;$('pClock').classList.add('pop');
  $('ring').style.strokeDashoffset=RING_C*(1-Math.min(1,n/st.reps));sessProgress(n*st.tempo);
  const milestone=n%10===0;
  if(st.count==='metro'){tic(milestone);if(milestone)bip(392,.25,.3)}
  else{speakRep(n,st.count);if(milestone)tic(true)}
  if(!p.midDone&&st.reps>=30&&n>=Math.floor(st.reps/2)){
    p.midDone=true;const m=pick(MID_MSGS);flashMsg(m);if(st.count==='metro')say(m);
  }
  if(!p.endDone&&st.reps>=20&&n===st.reps-Math.min(9,Math.floor(st.reps*.1))){
    p.endDone=true;const m=pick(END_MSGS);flashMsg(m);if(st.count==='metro')say(m);
  }
  if(n>=st.reps){markStepComplete();setStepDelay(()=>{gong(78,3.5);nextStep()},500)}
  else scheduleRep(st);
}

/* ---------- contrôles ---------- */
function flashMsg(t){
  const m=$('pMsg');m.textContent=t;m.classList.add('show');
  clearTimeout(m._t);m._t=setTimeout(()=>m.classList.remove('show'),3500);
}
function pauseSession(){
  const p=P;
  if(!playerRunning(p)||p.paused)return;
  const now=performance.now(),st=p.steps[p.idx];
  if(st.kind!=='reps')p.stepElapsedMs=stepElapsed(p);
  p.activeMs+=now-p.activeSince;p.activeSince=null;
  if(p.delay){p.delay.remaining=Math.max(0,p.delay.due-now);clearTimeout(p.repTimer);p.repTimer=null}
  if(p.raf!==null){cancelAnimationFrame(p.raf);p.raf=null}
  p.paused=true;$('pVideo').pause();$('pPauseBtn').textContent='▶';$('pPhase').textContent='pause';
  if(master)master.gain.value=0;
  cancelSpeech();releaseWakeLock();
}
function togglePause(){
  const p=P;
  if(!playerRunning(p))return;
  if(!p.paused){pauseSession();return}
  if(document.visibilityState==='hidden')return;
  const st=p.steps[p.idx];
  p.paused=false;p.activeSince=performance.now();p.stepStartedAt=p.activeSince;
  $('pPauseBtn').textContent='⏸';$('pPhase').textContent=st.kind==='reps'?'répétitions':'en cours';
  clearTimeout($('pMsg')._t);$('pMsg').classList.remove('show');
  audio();if(master)master.gain.value=voiceOn?.9:0;
  if(st.kind==='reps')armStepDelay(p);else tickTimer();
  p.playVideo?.();grabWakeLock();
}
function skipStep(){if(playerRunning(P))nextStep()}
function restartStep(){
  if(!playerRunning(P))return;
  P.idx--;nextStep();
}
async function finishSession(){
  const p=P;
  if(!playerRunning(p))return;
  const activeMs=p.activeMs+(p.paused?0:performance.now()-p.activeSince);
  p.status='finished';clearStepEngines();releaseWakeLock();
  $('pVideo').pause();$('pPauseBtn').disabled=true;
  $('pProg').style.width='100%';$('pPhase').textContent='terminé';
  $('pStep').textContent='Séance terminée';
  $('pNext').textContent=`${p.completedExos} exercice${p.completedExos===1?'':'s'} terminé${p.completedExos===1?'':'s'} · ${fmt(activeMs/1000)} actives`;
  const entry={id:uid(),at:Date.now(),name:p.name,secs:Math.round(activeMs/1000),exos:p.completedExos,reps:p.repsTotal};
  gong(78,4);sessionTimeout(p,()=>gong(105,3),450);
  say('Séance terminée. Bien joué !');flashMsg('Séance terminée 🥋');
  sessionTimeout(p,stopPlayer,2600);
  try{await idbPut('journal',entry);journal.unshift(entry);renderJournal()}
  catch(err){alert('La séance est terminée, mais son journal n’a pas pu être enregistré : '+err.message)}
}
function stopPlayer(){
  const p=P;
  clearStepEngines(p);
  if(p){p.status='stopped';p.timers.forEach(clearTimeout);p.timers.clear()}
  P=null;clearCountTest();cancelSpeech();releaseWakeLock();
  if(master)master.gain.value=0;
  clearTimeout($('pMsg')._t);$('pMsg').classList.remove('show');
  const v=$('pVideo');v.pause();v.removeAttribute('src');v.load();
  $('pNoVid').style.display='none';
  $('player').classList.remove('on','rest','reps','prep');$('pPauseBtn').disabled=false;
  try{if(document.fullscreenElement)Promise.resolve(document.exitFullscreen()).catch(()=>{})}catch(e){}
}
