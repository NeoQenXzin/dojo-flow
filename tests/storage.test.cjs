const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','storage.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const plain=value=>JSON.parse(JSON.stringify(value));
const backup=(extra={})=>({app:'dojoflow',version:2,exercises:[{id:'exercise-1',name:'Coupe'}],workouts:[],journal:[],...extra});

// This small transactional fake models commit/abort separately from request
// success. Its failures deliberately happen after earlier requests succeeded.
function fakeDatabase(initial={},options={}){
  const records=Object.fromEntries(['exercises','workouts','journal'].map(name=>[name,structuredClone(initial[name]||[])]));
  const transactions=[];
  let puts=0;
  return {
    records,transactions,
    transaction(names,mode){
      names=typeof names==='string'?[names]:names;
      const working=structuredClone(records);
      let pending=0,aborted=false,completed=false;
      const transaction={
        error:null,
        abort(){
          if(aborted||completed)return;
          aborted=true;
          queueMicrotask(()=>transaction.onabort?.({target:transaction}));
        },
        complete(){
          if(aborted||completed||pending)return;
          completed=true;
          if(mode==='readwrite')names.forEach(name=>{records[name]=working[name]});
          transaction.oncomplete?.({target:transaction});
        },
        objectStore(name){
          if(!names.includes(name))throw new Error('Store outside transaction');
          const request=(operation,kind)=>{
            pending++;
            const req={result:undefined,error:null};
            queueMicrotask(()=>{
              if(aborted)return;
              try{
                if(kind==='put' && ++puts===options.failPut)throw Object.assign(new Error('Quota exhausted'),{name:'QuotaExceededError'});
                if(kind==='getAll' && options.failGet)throw new Error('Read failed');
                req.result=operation();
                req.onsuccess?.({target:req});
              }catch(error){
                req.error=error;transaction.error=error;
                req.onerror?.({target:req});
                transaction.onerror?.({target:req});
                transaction.abort();
              }
              pending--;
              if(!pending && !options.manualCommit)queueMicrotask(()=>transaction.complete());
            });
            return req;
          };
          return {
            getAll:()=>request(()=>structuredClone(working[name]),'getAll'),
            put:value=>request(()=>{
              if(options.rejectBlob && value.video instanceof Blob)throw new Error('Error preparing Blob/File data to be stored in object store');
              const index=working[name].findIndex(record=>record.id===value.id);
              if(index<0)working[name].push(structuredClone(value));
              else working[name][index]=structuredClone(value);
              return value.id;
            },'put'),
            delete:key=>request(()=>{working[name]=working[name].filter(value=>value.id!==key)},'delete'),
            clear:()=>request(()=>{working[name]=[]},'clear')
          };
        }
      };
      transactions.push(transaction);
      return transaction;
    }
  };
}
function load(database=fakeDatabase(),extras={}){
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',style:{},disabled:false,files:[],value:''});
    return elements.get(id);
  };
  let downloads=0;
  const context=vm.createContext({
    Blob,ArrayBuffer,Uint8Array,WeakMap,Map,Set,Date,Number,console,queueMicrotask,
    atob:input=>Buffer.from(input,'base64').toString('binary'),
    setTimeout:()=>0,
    APP_VERSION:2,
    testDatabase:database,
    navigator:{},
    document:{getElementById:element,querySelectorAll:()=>[...elements.values()],body:{appendChild(){}},createElement:()=>({click(){downloads++},remove(){}})},
    $:element,
    URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},
    fmt:value=>String(value),fmtMo:value=>String(value),
    esc:value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),
    journal:[],vidURLs:{},dropVidURL(){},reload:async()=>{},alert(){},confirm:()=>true,
    ...extras
  });
  vm.runInContext(source,context);
  vm.runInContext('db=testDatabase',context);
  return {context,elements,element,database,downloads:()=>downloads};
}

test('legacy v2 backups receive safe defaults and decode video bytes',async()=>{
  const {context}=load();
  const normalized=context.normalizeBackup(backup({exercises:[{id:'exercise-1',name:' Coupe ',videoB64:'AQIDBA==',videoType:'video/webm'}]}));
  assert.equal(normalized.exercises[0].name,'Coupe');
  assert.equal(normalized.exercises[0].duration,60);
  assert.equal(normalized.exercises[0].count,'metro');
  assert.equal(normalized.exercises[0].video.type,'video/webm');
  assert.deepEqual([...new Uint8Array(await normalized.exercises[0].video.arrayBuffer())],[1,2,3,4]);
});

test('malicious or malformed backups are rejected before persistence',()=>{
  const {context,database}=load();
  const invalid=[
    backup({exercises:[{id:"x');alert(1);//",name:'Injection'}]}),
    backup({exercises:[{id:'__proto__',name:'Injection'}]}),
    backup({exercises:[{id:'one',name:12}]}),
    backup({exercises:[{id:'one',name:'A',video:{}}]}),
    backup({exercises:[{id:'one',name:'A',reps:Infinity}]}),
    backup({exercises:[{id:'one',name:'A',duration:7201}]}),
    backup({exercises:[{id:'one',name:'A',videoB64:'abc='+'=def'}]}),
    backup({exercises:[{id:'one',name:'A',videoB64:'AQID',videoType:'\" onerror=alert(1)'}]}),
    backup({exercises:[{id:'one',name:'A'},{id:'one',name:'B'}]}),
    backup({version:999}),
    backup({journal:[{id:'one',name:'Séance',at:1,secs:2,exos:'<img src=x onerror=alert(1)>'}]}),
    backup({workouts:[{id:'w',name:'Séance',items:[],rest:-1}]}),
    backup({exercises:[{id:'one',name:'A',videoError:true}]})
  ];
  invalid.forEach(data=>assert.throws(()=>context.normalizeBackup(data)));
  assert.equal(database.transactions.length,0);
});

test('a full-size base64 value avoids regex stack overflow',()=>{
  const {context}=load();
  assert.equal(context.b64ToBlob('AAAA'.repeat(300000),'video/mp4').size,900000);
});

test('a successful request does not resolve save before the transaction commits',async()=>{
  const database=fakeDatabase({}, {manualCommit:true});
  const {context}=load(database);
  let resolved=false;
  const save=context.idbPut('exercises',{id:'one',name:'A'}).then(()=>{resolved=true});
  await tick();
  assert.equal(resolved,false);
  assert.equal(database.records.exercises.length,0);
  database.transactions[0].complete();
  await save;
  assert.equal(resolved,true);
  assert.equal(database.records.exercises.length,1);
});

test('request errors reject reads and asynchronous batch callbacks are rejected',async()=>{
  const {context}=load(fakeDatabase({}, {failGet:true}));
  await assert.rejects(context.idbAll('exercises'),/Read failed/);
  await assert.rejects(context.idbBatch(['exercises'],async transaction=>transaction.objectStore('exercises').clear()),/sans await/);
});

test('replace aborts all stores if quota runs out after a successful write',async()=>{
  const initial={exercises:[{id:'old',name:'Old'}],workouts:[{id:'old-w',name:'Old training'}],journal:[{id:'old-j',secs:1}]};
  const {context,database}=load(fakeDatabase(initial,{failPut:2}));
  const data=context.normalizeBackup(backup({exercises:[{id:'one',name:'A'},{id:'two',name:'B'}]}));
  await assert.rejects(context.restoreBackup(data,'replace'),{name:'QuotaExceededError'});
  assert.deepEqual(database.records,initial);
});

test('merge preserves local videos, resolves local references and replaces supplied videos',async()=>{
  const original=new Blob(['original'],{type:'video/mp4'});
  const initial={exercises:[{id:'exercise-1',name:'Old',video:original},{id:'local',name:'Local'}]};
  const {context,database}=load(fakeDatabase(initial));
  const data=context.normalizeBackup(backup({workouts:[{id:'workout-1',name:'Fusion',items:[{exId:'local'}]}]}));
  await context.restoreBackup(data,'merge');
  assert.equal(await (await context.idbAll('exercises'))[0].video.text(),'original');
  assert.ok(database.records.exercises[0].videoBytes instanceof ArrayBuffer);
  assert.equal(database.records.exercises[0].video,undefined);
  assert.equal(database.records.exercises.length,2);
  assert.equal(database.records.workouts[0].items[0].exId,'local');
  const withVideo=context.normalizeBackup(backup({exercises:[{id:'exercise-1',name:'New',videoB64:'bmV3',videoType:'video/mp4'}]}));
  await context.restoreBackup(withVideo,'merge');
  assert.equal(await (await context.idbAll('exercises'))[0].video.text(),'new');
});

test('video writes store bytes, rehydrate MIME and do not mutate the caller',async()=>{
  const {context,database}=load(fakeDatabase({}, {rejectBlob:true}));
  const video=new Blob([new Uint8Array([0,1,255,42])],{type:'video/webm'});
  const exercise={id:'bytes',name:'Video',video};
  await context.idbPut('exercises',exercise);
  assert.equal(exercise.video,video);
  assert.equal(exercise.videoBytes,undefined);
  const raw=database.records.exercises[0];
  assert.equal(raw.video,undefined);
  assert.ok(raw.videoBytes instanceof ArrayBuffer);
  assert.equal(raw.videoType,'video/webm');
  const [read]=await context.idbAll('exercises');
  assert.ok(read.video instanceof Blob);
  assert.equal(read.video.type,'video/webm');
  assert.deepEqual([...new Uint8Array(await read.video.arrayBuffer())],[0,1,255,42]);
  assert.equal(read.videoBytes,undefined);
  assert.equal(read.videoType,undefined);
  const snapshot=await context.idbSnapshot();
  assert.equal(snapshot.exercises[0].video.type,'video/webm');
  assert.equal(snapshot.exercises[0].videoBytes,undefined);
  await context.idbPut('exercises',{...read,video:null});
  assert.equal(database.records.exercises[0].video,null);
  assert.equal(database.records.exercises[0].videoBytes,undefined);
});

test('backup restoration writes video bytes even when IndexedDB rejects Blobs',async()=>{
  const {context,database}=load(fakeDatabase({}, {rejectBlob:true}));
  const data=context.normalizeBackup(backup({exercises:[{id:'video',name:'Video',videoB64:'bmV3',videoType:'video/mp4'}]}));
  const original=data.exercises[0].video;
  await context.restoreBackup(data,'replace');
  assert.equal(data.exercises[0].video,original);
  assert.equal(data.exercises[0].videoBytes,undefined);
  assert.ok(database.records.exercises[0].videoBytes instanceof ArrayBuffer);
  const merge=context.normalizeBackup(backup({exercises:[{id:'video',name:'Updated'}]}));
  await context.restoreBackup(merge,'merge');
  assert.equal(await (await context.idbAll('exercises'))[0].video.text(),'new');
  assert.equal((await context.idbAll('exercises'))[0].name,'Updated');
});

test('legacy Blob records remain readable and light merges migrate them to bytes',async()=>{
  const original=new Blob(['legacy'],{type:'video/x-matroska'});
  const {context,database}=load(fakeDatabase({exercises:[{id:'legacy',name:'Legacy',video:original}]},{rejectBlob:true}));
  assert.equal(await (await context.idbAll('exercises'))[0].video.text(),'legacy');
  await context.restoreBackup(context.normalizeBackup(backup({exercises:[{id:'legacy',name:'Renamed'}]})),'merge');
  assert.equal(database.records.exercises[0].video,undefined);
  assert.equal(database.records.exercises[0].videoType,'video/x-matroska');
  assert.equal(await (await context.idbAll('exercises'))[0].video.text(),'legacy');
});

test('byte-backed video exports retain v2 base64 and never expose storage fields',async()=>{
  let exported;
  class Reader {
    async readAsDataURL(blob){
      this.result='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');
      this.onload();
    }
  }
  const {context}=load(fakeDatabase(),{FileReader:Reader,URL:{createObjectURL(blob){exported=blob;return 'blob:export'},revokeObjectURL(){}}});
  await context.idbPut('exercises',{id:'one',name:'Video',video:new Blob(['exact bytes'],{type:'video/mp4'})});
  await context.exportData(true);
  const data=JSON.parse(await exported.text());
  assert.equal(data.version,2);
  assert.equal(data.exercises[0].videoB64,Buffer.from('exact bytes').toString('base64'));
  assert.equal(data.exercises[0].videoType,'video/mp4');
  assert.equal(data.exercises[0].videoBytes,undefined);
  assert.equal(data.exercises[0].video,undefined);
  await context.exportData(false);
  const light=JSON.parse(await exported.text());
  assert.equal(light.exercises[0].videoB64,undefined);
  assert.equal(light.exercises[0].videoBytes,undefined);
  assert.equal(light.exercises[0].videoType,undefined);
});

test('a missing workout reference aborts replace and preserves existing data',async()=>{
  const initial={exercises:[{id:'old',name:'Old'}],workouts:[],journal:[]};
  const {context,database}=load(fakeDatabase(initial));
  const data=context.normalizeBackup(backup({workouts:[{id:'w',name:'Missing',items:[{exId:'absent'}]}]}));
  await assert.rejects(context.restoreBackup(data,'replace'),/exercice absent/);
  assert.deepEqual(database.records,initial);
});

test('a failed video export produces no incomplete download and releases controls',async()=>{
  class BrokenReader {readAsDataURL(){queueMicrotask(()=>this.onerror())}}
  const {context,element,downloads}=load(fakeDatabase({exercises:[{id:'one',name:'Broken',video:new Blob(['bytes'])}]}),{FileReader:BrokenReader});
  element('expFullBtn').textContent='Export complet';
  const other=element('otherButton');
  await context.exportData(true);
  assert.equal(downloads(),0);
  assert.match(element('impStatus').textContent,/Export annulé/);
  assert.equal(element('expFullBtn').textContent,'Export complet');
  assert.equal(other.disabled,false);
});

test('invalid import and quota failure leave all existing records untouched',async()=>{
  const initial={exercises:[{id:'old',name:'Old'}],workouts:[],journal:[]};
  const {context,element,database}=load(fakeDatabase(initial,{failPut:2}));
  element('impFile').files=[{size:10,text:async()=>JSON.stringify(backup({exercises:[{id:'one',name:'One'},{id:'two',name:'Two'}]}))}];
  await context.importData('replace');
  assert.match(element('impStatus').textContent,/Stockage plein/);
  assert.deepEqual(database.records,initial);
  element('impFile').files=[{size:10,text:async()=>'{bad json'}];
  await context.importData('replace');
  assert.match(element('impStatus').textContent,/JSON valide/);
  assert.deepEqual(database.records,initial);
});

test('journal rendering never interprets numeric strings as markup',()=>{
  const {context,element}=load(undefined,{journal:[{id:'one',name:'<img src=x>',at:Date.now(),secs:2,exos:'<img src=x onerror=alert(1)>',reps:'<svg onload=alert(1)>'}]});
  context.renderJournal();
  assert.match(element('journalCard').innerHTML,/&lt;img src=x&gt;/);
  assert.doesNotMatch(element('journalCard').innerHTML,/<img|<svg/);
});

test('blocked open rejects and closes a subsequently opened orphan connection',async()=>{
  const request={};
  let closed=false;
  const {context}=load(undefined,{indexedDB:{open:()=>request}});
  const opening=context.openDB();
  request.onblocked();
  await assert.rejects(opening,/autres onglets/);
  request.result={close(){closed=true}};
  request.onsuccess();
  assert.equal(closed,true);
});

test('oversized complete backups are rejected before attempting base64 allocation',async()=>{
  const database=fakeDatabase({exercises:[{id:'large',name:'Grand fichier',video:{size:400*1024*1024}}]});
  const h=load(database);
  await h.context.exportData(true);
  assert.equal(h.downloads(),0);
  assert.match(h.element('impStatus').textContent,/trop volumineux/);
});
