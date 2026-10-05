'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../player.js'),'utf8');

function harness({videoPlay,wakeRequest}={}){
  let now=10000,id=0;
  const jobs=new Map(),nodes=new Map(),listeners=new Map(),saved=[];
  class Element{
    constructor(name=''){this.id=name;this.style={};this.className='';this.textContent='';this.value='';this.disabled=false;this.paused=true;this.children=[];
      const classes=new Set();this.classList={add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)};
    }
    appendChild(el){this.children.push(el);nodes.set(el.id,el)}
    pause(){this.paused=true}
    load(){}
    play(){return videoPlay?videoPlay(this):Promise.resolve()}
    removeAttribute(attr){delete this[attr]}
  }
  const names=['ring','pVideo','pVoiceBtn','pPauseBtn','player','pProg','pMsg','pStep','pName','pNext','pFlash','pClock','pSub','pPhase','pNoVid','pNoVidTxt','exCount','exCountInfo'];
  names.forEach(name=>nodes.set(name,new Element(name)));
  const schedule=(fn,ms,kind)=>{const key=++id;jobs.set(key,{fn,at:now+ms,kind});return key};
  const document={visibilityState:'visible',documentElement:{},fullscreenElement:null,
    getElementById:name=>nodes.get(name)||null,createElement:()=>new Element(),
    addEventListener:(name,fn)=>listeners.set(name,fn)};
  const context={console,document,window:{},navigator:wakeRequest?{wakeLock:{request:wakeRequest}}:{},
    performance:{now:()=>now},Date,Set,Map,Promise,Number,
    setTimeout:(fn,ms)=>schedule(fn,ms,'timeout'),clearTimeout:key=>jobs.delete(key),
    requestAnimationFrame:fn=>schedule(fn,16,'raf'),cancelAnimationFrame:key=>jobs.delete(key),
    exercises:[],workouts:[],journal:[],
    $:name=>document.getElementById(name),isReps:ex=>ex?.mode==='reps',
    fmt:s=>`${Math.floor(Math.max(0,Math.round(s))/60)}:${String(Math.max(0,Math.round(s))%60).padStart(2,'0')}`,
    uid:()=>String(++id),vidURL:()=> 'blob:exercise-video',mediaErr:()=> 'format non supporté',
    alert:message=>{context.lastAlert=message},
    idbPut:async(store,entry)=>{saved.push(entry)},renderJournal(){}};
  vm.createContext(context);vm.runInContext(source,context);
  return {context,nodes,jobs,saved,document,
    run:code=>vm.runInContext(code,context),
    advance(ms){const end=now+ms;let attempts=0;while(true){const next=[...jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;assert.ok(++attempts<50000,'scheduler stalled');now=next[1].at;jobs.delete(next[0]);next[1].fn()}now=end},
    visible(value){document.visibilityState=value;listeners.get('visibilitychange')()},
    start(exercises,items=exercises.map(ex=>({exId:ex.id})),options={}){context.exercises=exercises;context.source={items,prep:0,rest:0,...options};vm.runInContext('playSeq(source)',context)}};
}
const timer=(id,duration=60)=>({id,name:id,mode:'timer',duration});
const reps=(id,count=2)=>({id,name:id,mode:'reps',reps:count,tempo:1,count:'metro'});
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()};

test('pause, skip and restart retain correct timer values and manual resume',()=>{
  const h=harness();h.start([timer('A'),timer('B')]);h.advance(5000);h.run('togglePause();skipStep()');
  assert.equal(h.run('P.paused'),true);assert.equal(h.nodes.get('pClock').textContent,'1:00');
  h.advance(10000);assert.equal(h.nodes.get('pClock').textContent,'1:00');
  h.run('togglePause()');h.advance(5016);assert.equal(h.nodes.get('pClock').textContent,'0:55');
  h.run('togglePause();restartStep()');assert.equal(h.nodes.get('pClock').textContent,'1:00');
  h.run('togglePause()');h.advance(1016);assert.equal(h.nodes.get('pClock').textContent,'0:59');
});

test('repetition pause preserves the remaining fraction of a beat',()=>{
  const h=harness();h.start([reps('A')]);h.advance(400);h.run('togglePause()');h.advance(5000);
  assert.equal(h.run('P.rep'),0);h.run('togglePause()');h.advance(599);assert.equal(h.run('P.rep'),0);
  h.advance(1);assert.equal(h.run('P.rep'),1);
});

test('completed-repetition transition cannot skip the following exercise',()=>{
  const h=harness();h.start([reps('A',1),timer('B'),timer('C')]);h.advance(1000);
  const obsolete=h.jobs.get(h.run('P.repTimer')).fn;
  h.run('skipStep()');obsolete();h.advance(600);
  assert.equal(h.run('P.steps[P.idx].name'),'B');assert.equal(h.run('P.completedExos'),1);
});

test('pause at the last repetition freezes its transition and does not add reps',()=>{
  const h=harness();h.start([reps('A',1),timer('B')]);h.advance(1200);h.run('togglePause()');
  h.advance(8000);assert.equal(h.run('P.idx'),0);h.run('togglePause()');h.advance(299);
  assert.equal(h.run('P.idx'),0);h.advance(1);assert.equal(h.run('P.idx'),1);assert.equal(h.run('P.repsTotal'),1);
});

test('journal excludes pauses, counts only completed exercises and is written once',async()=>{
  const h=harness();h.start([timer('A',5),timer('B',5)]);h.advance(2000);h.run('togglePause()');
  h.advance(10000);h.run('togglePause()');h.advance(3016);h.run('skipStep();skipStep();togglePause();restartStep()');
  await flush();assert.equal(h.saved.length,1);assert.equal(h.saved[0].secs,5);assert.equal(h.saved[0].exos,1);
  assert.equal(h.run('journal.length'),1);assert.equal(h.run('P.status'),'finished');
});

test('a finished session never closes or advances a newly started one',()=>{
  const h=harness();h.start([reps('A',1)]);h.advance(1500);
  const oldCallbacks=[...h.jobs.values()].filter(j=>j.kind==='timeout').map(j=>j.fn);
  h.start([timer('B')]);oldCallbacks.forEach(fn=>fn());h.advance(3000);
  assert.equal(h.run('P.name'),'Séance libre');assert.equal(h.run('P.steps[P.idx].name'),'B');assert.equal(h.run('P.status'),'running');
});

test('backgrounding pauses automatically and foregrounding requires manual resume',()=>{
  const h=harness();h.start([timer('A')]);h.advance(2016);h.visible('hidden');h.advance(120000);
  assert.equal(h.run('P.paused'),true);h.visible('visible');assert.equal(h.run('P.paused'),true);
  h.run('togglePause()');h.advance(1016);assert.equal(h.nodes.get('pClock').textContent,'0:57');
});

test('unavailable audio and speech APIs do not prevent sessions or controls',()=>{
  const h=harness();assert.doesNotThrow(()=>{h.start([timer('A')]);h.run('toggleVoice();togglePause();togglePause();stopPlayer()')});
  assert.equal(h.run('P'),null);
});

test('autoplay refusal exposes a retry; canplay alone never confirms playback',async()=>{
  const h=harness({videoPlay:()=>Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}))});
  h.start([{...timer('A'),video:{type:'video/mp4'}}]);await flush();
  assert.equal(h.nodes.get('pNoVid').style.display,'block');assert.equal(h.nodes.get('pVideoRetry').style.display,'block');
  h.nodes.get('pVideo').oncanplay();await flush();assert.equal(h.nodes.get('pNoVid').style.display,'block');
  h.nodes.get('pVideo').onplaying();assert.equal(h.nodes.get('pNoVid').style.display,'none');
});

test('late video rejection from an old step cannot affect the current step',async()=>{
  let reject;
  const h=harness({videoPlay:()=>new Promise((resolve,no)=>{reject=no})});
  h.start([{...timer('A'),video:{}},timer('B')]);h.run('skipStep()');
  reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));await flush();
  assert.equal(h.nodes.get('pNoVid').style.display,'none');
});

test('a wake lock arriving after closing is released instead of leaking',async()=>{
  let resolve,releases=0;
  const h=harness({wakeRequest:()=>new Promise(r=>{resolve=r})});h.start([timer('A')]);h.run('stopPlayer()');
  resolve({release:async()=>{releases++},addEventListener(){}});await flush();
  assert.equal(releases,1);assert.equal(h.run('wakeLock'),null);
});

test('obsolete wake lock requests cannot overwrite a new session lock',async()=>{
  const resolvers=[],released=[];
  const h=harness({wakeRequest:()=>new Promise(r=>resolvers.push(r))});h.start([timer('A')]);h.start([timer('B')]);
  const old={release:async()=>released.push('old'),addEventListener(){}},current={release:async()=>released.push('current'),addEventListener(){}};
  resolvers[1](current);await flush();resolvers[0](old);await flush();
  assert.deepEqual(released,['old']);assert.equal(h.run('wakeLock'),current);
});

test('deleted exercises do not introduce a leading rest',()=>{
  const h=harness();h.start([timer('B')],[{exId:'deleted'},{exId:'B'}],{rest:15});assert.equal(h.run('P.steps[0].kind'),'timer');
});

test('Japanese and Korean counting handles the full supported range',()=>{
  const h=harness();assert.equal(h.run('numWord(10000,"ja")'),'いちまん');assert.equal(h.run('numWord(10000,"ko")'),'만');
  assert.equal(h.run('numWord(3000,"ja")'),'さんぜん');assert.equal(h.run('numWord(8000,"ja")'),'はっせん');
});

test('manual video retry makes another attempt when the old play promise is pending',()=>{
  let attempts=0;const h=harness({videoPlay:()=>{attempts++;return new Promise(()=>{})}});
  h.start([{...timer('A'),video:{type:'video/mp4'}}]);h.advance(8000);
  assert.equal(attempts,1);assert.equal(h.nodes.get('pVideoRetry').style.display,'block');
  h.nodes.get('pVideoRetry').onclick();assert.equal(attempts,2);
});
