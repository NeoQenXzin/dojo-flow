'use strict';

/* IndexedDB requests can succeed before their transaction commits. All helpers
   below settle on completion/abort, so a quota error never looks like a save. */
let db;
const DB_STORES = ['exercises','workouts','journal'];
const batchErrors = new WeakMap();

function storageErrorMessage(error){
  if(error?.name==='QuotaExceededError')return 'Stockage plein. Libère de l’espace sur cet appareil ou choisis une vidéo plus petite, puis réessaie.';
  return error?.message || String(error || 'Erreur de stockage inconnue.');
}
function storageNotice(message){
  const info=document.getElementById('dbInfo');
  if(info)info.textContent=message;
  const status=document.getElementById('impStatus');
  if(status)status.textContent=message;
}
function openDB(){
  return new Promise((resolve,reject)=>{
    let request, settled=false;
    const fail=error=>{if(!settled){settled=true;reject(error)}};
    try{request=indexedDB.open('dojoflow',2)}catch(error){fail(error);return}
    request.onupgradeneeded=()=>{
      const connection=request.result;
      DB_STORES.forEach(name=>{
        if(!connection.objectStoreNames.contains(name))connection.createObjectStore(name,{keyPath:'id'});
      });
    };
    request.onblocked=()=>fail(new Error('Ferme les autres onglets DojoFlow, puis recharge cette page pour ouvrir le stockage.'));
    request.onerror=()=>fail(request.error || new Error('Impossible d’ouvrir le stockage local.'));
    request.onsuccess=()=>{
      const connection=request.result;
      if(settled){connection.close();return}
      db=connection;
      connection.onversionchange=()=>{
        connection.close();
        if(db===connection)db=null;
        storageNotice('DojoFlow a été mis à jour dans un autre onglet. Recharge cette page.');
      };
      connection.onclose=()=>{
        if(db===connection){db=null;storageNotice('Le stockage a été déconnecté. Recharge cette page avant de continuer.')}
      };
      settled=true;
      resolve();
    };
  });
}
function abortBatch(transaction,error){
  batchErrors.set(transaction,error);
  try{transaction.abort()}catch(ignored){}
}
function storageTransaction(stores,mode,callback){
  return new Promise((resolve,reject)=>{
    let transaction, result;
    try{
      if(!db)throw new Error('Le stockage local n’est pas disponible. Recharge cette page.');
      transaction=db.transaction(stores,mode);
      transaction.oncomplete=()=>resolve(result);
      transaction.onerror=event=>{
        if(!batchErrors.has(transaction))batchErrors.set(transaction,event.target?.error || transaction.error);
      };
      transaction.onabort=()=>reject(batchErrors.get(transaction) || transaction.error || new Error('Enregistrement annulé. Aucune modification n’a été conservée.'));
      result=callback(transaction);
      if(result && typeof result.then==='function')throw new TypeError('Une transaction IndexedDB doit être préparée sans await.');
    }catch(error){
      if(transaction)abortBatch(transaction,error);
      reject(error);
    }
  });
}
// callback(transaction) must synchronously enqueue requests; it may attach
// request handlers, but must not return a Promise or await external work.
function idbBatch(stores,callback){return storageTransaction(stores,'readwrite',callback)}
function idbRawAll(store){
  let result=[];
  return storageTransaction([store],'readonly',transaction=>{
    transaction.objectStore(store).getAll().onsuccess=event=>{result=event.target.result || []};
  }).then(()=>result);
}
function hydrateExercise(record){
  const exercise={...record};
  if(record.videoBytes instanceof ArrayBuffer || ArrayBuffer.isView(record.videoBytes)){
    exercise.video=new Blob([record.videoBytes],{type:record.videoType || 'video/mp4'});
  }
  delete exercise.videoBytes;
  delete exercise.videoType;
  return exercise;
}
async function serializeExercise(exercise){
  const record={...exercise};
  delete record.videoBytes;
  delete record.videoType;
  if(exercise.video instanceof Blob){
    // Some WebKit contexts cannot persist Blob/File handles. ArrayBuffer uses
    // the normal IndexedDB structured-clone path and keeps every video byte.
    record.videoBytes=await exercise.video.arrayBuffer();
    record.videoType=exercise.video.type || 'video/mp4';
    delete record.video;
  }else record.video=exercise.video || null;
  return record;
}
function idbAll(store){return idbRawAll(store).then(records=>store==='exercises'?records.map(hydrateExercise):records)}
async function idbPut(store,value){
  const record=store==='exercises'?await serializeExercise(value):value;
  return idbBatch([store],transaction=>{transaction.objectStore(store).put(record)});
}
function idbDel(store,key){return idbBatch([store],transaction=>{transaction.objectStore(store).delete(key)})}
function idbClear(store){return idbBatch([store],transaction=>{transaction.objectStore(store).clear()})}
function idbSnapshot(){
  const result={};
  return storageTransaction(DB_STORES,'readonly',transaction=>{
    DB_STORES.forEach(store=>{
      transaction.objectStore(store).getAll().onsuccess=event=>{result[store]=event.target.result || []};
    });
  }).then(()=>({...result,exercises:result.exercises.map(hydrateExercise)}));
}

/* Only known, typed fields enter the database. Imported IDs also occur in
   inline event attributes in the legacy UI, so their alphabet is restricted. */
const BACKUP_LIMITS={records:20000,items:1000,fileBytes:512*1024*1024};
function backupObject(value,label){
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error(label+' : objet invalide.');
  return value;
}
function backupString(value,label,max,fallback){
  if(value===undefined && fallback!==undefined)return fallback;
  if(typeof value!=='string' || value.length>max)throw new Error(label+' : texte invalide ou trop long.');
  return value;
}
function backupID(value,label){
  if(typeof value!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value) || ['__proto__','constructor','prototype'].includes(value))throw new Error(label+' : identifiant invalide.');
  return value;
}
function backupNumber(value,label,min,max,fallback,integer=true){
  if(value===undefined && fallback!==undefined)return fallback;
  if(typeof value!=='number' || !Number.isFinite(value) || value<min || value>max || (integer && !Number.isInteger(value)))throw new Error(label+' : nombre attendu entre '+min+' et '+max+'.');
  return value;
}
function backupArray(value,label,max,fallback){
  if(value===undefined && fallback)return [];
  if(!Array.isArray(value) || value.length>max)throw new Error(label+' : liste invalide ou trop longue.');
  return value;
}
function uniqueBackupIDs(records,label){
  const ids=new Set();
  records.forEach(record=>{
    if(ids.has(record.id))throw new Error(label+' : identifiant en double (« '+record.id+' »).');
    ids.add(record.id);
  });
}
function normalizeBackup(data){
  backupObject(data,'Sauvegarde');
  if(data.app!=='dojoflow')throw new Error('Ce fichier n’est pas une sauvegarde DojoFlow.');
  backupNumber(data.version,'Version',1,APP_VERSION,2);
  const exercises=backupArray(data.exercises,'Exercices',BACKUP_LIMITS.records).map((value,index)=>{
    const label='Exercice '+(index+1), source=backupObject(value,label);
    const name=backupString(source.name,label+' / nom',200).trim();
    if(!name)throw new Error(label+' : le nom est vide.');
    const mode=source.mode===undefined?'timer':source.mode;
    if(!['timer','reps'].includes(mode))throw new Error(label+' : mode inconnu.');
    const count=source.count===undefined?'metro':source.count;
    if(!['metro','fr','en','ja','ko'].includes(count))throw new Error(label+' : voix inconnue.');
    const exercise={
      id:backupID(source.id,label), name, mode, count,
      art:backupString(source.art,label+' / art',100,''),
      cat:backupString(source.cat,label+' / catégorie',100,''),
      notes:backupString(source.notes,label+' / notes',10000,''),
      duration:backupNumber(source.duration,label+' / durée',5,7200,60),
      reps:backupNumber(source.reps,label+' / répétitions',1,10000,100),
      tempo:backupNumber(source.tempo,label+' / tempo',.4,20,1.5,false),
      created:backupNumber(source.created,label+' / date',0,8640000000000000,Date.now()),
      video:null
    };
    if(source.video!==undefined && source.video!==null)throw new Error(label+' : la vidéo doit être fournie en base64.');
    if(source.videoError)throw new Error(label+' : cette ancienne sauvegarde signale une vidéo manquante. Utilise une sauvegarde complète valide ou un export léger.');
    if(source.videoB64!==undefined){
      const content=backupString(source.videoB64,label+' / vidéo',BACKUP_LIMITS.fileBytes);
      if(!content.length)throw new Error(label+' : vidéo vide.');
      exercise.video=b64ToBlob(content,source.videoType);
    }
    return exercise;
  });
  const workouts=backupArray(data.workouts,'Entraînements',BACKUP_LIMITS.records,true).map((value,index)=>{
    const label='Entraînement '+(index+1), source=backupObject(value,label);
    const name=backupString(source.name,label+' / nom',200).trim();
    if(!name)throw new Error(label+' : le nom est vide.');
    return {
      id:backupID(source.id,label),name,
      rest:backupNumber(source.rest,label+' / repos',0,180,15),
      prep:backupNumber(source.prep,label+' / préparation',0,60,10),
      items:backupArray(source.items,label+' / séquence',BACKUP_LIMITS.items).map((value,i)=>{
        const item=backupObject(value,label+' / étape '+(i+1));
        const normalized={exId:backupID(item.exId,label+' / référence')};
        if(item.duration!==undefined)normalized.duration=backupNumber(item.duration,label+' / durée',5,7200);
        if(item.reps!==undefined)normalized.reps=backupNumber(item.reps,label+' / répétitions',1,10000);
        return normalized;
      })
    };
  });
  const journal=backupArray(data.journal,'Journal',BACKUP_LIMITS.records,true).map((value,index)=>{
    const label='Journal '+(index+1), source=backupObject(value,label);
    return {
      id:backupID(source.id,label),name:backupString(source.name,label+' / nom',200),
      at:backupNumber(source.at,label+' / date',0,8640000000000000),
      secs:backupNumber(source.secs,label+' / durée',0,31536000),
      exos:backupNumber(source.exos,label+' / exercices',0,100000),
      reps:backupNumber(source.reps,label+' / répétitions',0,1000000000,0)
    };
  });
  uniqueBackupIDs(exercises,'Exercices');
  uniqueBackupIDs(workouts,'Entraînements');
  uniqueBackupIDs(journal,'Journal');
  return {exercises,workouts,journal};
}
function validateBackupReferences(data,existing=[]){
  const ids=new Set([...existing.map(exercise=>exercise.id),...data.exercises.map(exercise=>exercise.id)]);
  for(const workout of data.workouts){
    for(const item of workout.items){
      if(!ids.has(item.exId))throw new Error('« '+workout.name+' » référence un exercice absent (« '+item.exId+' »). Aucune donnée n’a été modifiée.');
    }
  }
}
function legacyVideoSignature(record){
  const copy={...record};delete copy.video;
  return JSON.stringify(copy)+'|'+record.video.size+'|'+record.video.type;
}
async function restoreBackup(data,mode){
  if(!['merge','replace'].includes(mode))throw new Error('Mode de restauration invalide.');
  // All Blob reads finish before opening the atomic write transaction.
  const imported=[];
  for(const exercise of data.exercises)imported.push(await serializeExercise(exercise));
  const legacyVideos=new Map();
  if(mode==='merge'){
    const needed=new Set(imported.filter(exercise=>!exercise.videoBytes).map(exercise=>exercise.id));
    if(needed.size){
      for(const local of await idbRawAll('exercises')){
        if(needed.has(local.id) && local.video instanceof Blob){
          legacyVideos.set(local.id,{signature:legacyVideoSignature(local),record:await serializeExercise(local)});
        }
      }
    }
  }
  return idbBatch(DB_STORES,transaction=>{
    const store=transaction.objectStore('exercises');
    // Read inside the write transaction: another tab cannot change the local
    // videos between preservation/validation and the actual merge.
    store.getAll().onsuccess=event=>{
      try{
        const locals=mode==='merge'?event.target.result:[];
        validateBackupReferences(data,locals);
        const localById=new Map(locals.map(exercise=>[exercise.id,exercise]));
        if(mode==='replace')DB_STORES.forEach(name=>transaction.objectStore(name).clear());
        imported.forEach(exercise=>{
          const saved={...exercise};
          if(!saved.videoBytes && mode==='merge'){
            const local=localById.get(saved.id);
            if(local?.videoBytes){
              saved.videoBytes=local.videoBytes;saved.videoType=local.videoType || 'video/mp4';delete saved.video;
            }else if(local?.video instanceof Blob){
              const prepared=legacyVideos.get(saved.id);
              if(!prepared || prepared.signature!==legacyVideoSignature(local))throw new Error('Une vidéo a changé dans un autre onglet. Relance la fusion.');
              saved.videoBytes=prepared.record.videoBytes;saved.videoType=prepared.record.videoType;delete saved.video;
            }
          }
          store.put(saved);
        });
        data.workouts.forEach(workout=>transaction.objectStore('workouts').put(workout));
        data.journal.forEach(entry=>transaction.objectStore('journal').put(entry));
      }catch(error){abortBatch(transaction,error)}
    };
  });
}

function renderJournal(){
  const container=$('journalCard');
  if(!journal.length){container.innerHTML='<div class="muted">Aucune séance terminée pour l’instant.</div>';return}
  const number=value=>Number.isFinite(value)&&value>=0?value:0;
  const totSecs=journal.reduce((total,entry)=>total+number(entry.secs),0);
  const totReps=journal.reduce((total,entry)=>total+number(entry.reps),0);
  const now=Date.now();
  const week=journal.filter(entry=>entry.at<=now && now-entry.at<7*86400e3).length;
  container.innerHTML=`<div class="row" style="margin-bottom:10px">
    <div class="grow"><b>${journal.length}</b> séances · <b>${fmt(totSecs)}</b> cumulées${totReps?` · <b>${totReps}</b> répétitions`:''}</div>
    <span class="tag cat">${week} ces 7 derniers jours</span></div>`+
    journal.slice(0,15).map(entry=>`<div class="row" style="padding:7px 0;border-top:1px solid var(--line)">
      <div class="grow" style="font-size:14px">${esc(String(entry.name||''))}<div class="muted">${new Date(entry.at).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})} · ${new Date(entry.at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div></div>
      <div class="muted" style="text-align:right">${fmt(number(entry.secs))}<br>${number(entry.exos)} exos${number(entry.reps)?` · ${number(entry.reps)} rép.`:''}</div></div>`).join('');
}
async function refreshStorage(){
  try{
    if(navigator.storage?.estimate){
      const {usage=0,quota=0}=await navigator.storage.estimate();
      $('storText').textContent=quota?`${fmtMo(usage)} / ${fmtMo(quota)}`:fmtMo(usage);
      $('storBar').style.width=(quota?Math.min(100,usage/quota*100):0)+'%';
    }else $('storText').textContent='Non disponible';
  }catch(error){$('storText').textContent='Estimation indisponible'}
  try{
    if(navigator.storage?.persisted){
      const persistent=await navigator.storage.persisted();
      $('persistText').textContent=persistent
        ? '🔒 Stockage persistant activé. Garde une sauvegarde : effacer les données du navigateur les supprime toujours.'
        : 'Stockage non persistant : le navigateur pourrait purger les données s’il manque d’espace.';
      $('persistBtn').style.display=persistent?'none':'block';
    }else{
      $('persistText').textContent='Persistance non gérée par ce navigateur. Exporte régulièrement une sauvegarde.';
      $('persistBtn').style.display='none';
    }
  }catch(error){$('persistText').textContent='Impossible de vérifier la persistance. Exporte régulièrement une sauvegarde.'}
}
async function askPersist(){
  try{
    if(!navigator.storage?.persist)return;
    const granted=await navigator.storage.persist();
    await refreshStorage();
    if(!granted)$('persistText').textContent='Le navigateur n’a pas accordé la persistance. Garde une sauvegarde exportée.';
  }catch(error){$('persistText').textContent='Persistance indisponible : '+storageErrorMessage(error)}
}
const blobToB64=blob=>new Promise((resolve,reject)=>{
  if(!(blob instanceof Blob)){reject(new Error('Vidéo locale illisible. Réimporte son fichier avant de sauvegarder.'));return}
  const reader=new FileReader();
  reader.onload=()=>resolve(reader.result.split(',')[1]);
  reader.onerror=()=>reject(reader.error || new Error('Lecture de la vidéo impossible.'));
  reader.onabort=()=>reject(new Error('Lecture de la vidéo annulée.'));
  reader.readAsDataURL(blob);
});
function b64ToBlob(base64,type){
  // Avoid a repeated-group regex: large videos can overflow its backtracking
  // stack even when their base64 is valid.
  if(typeof base64!=='string' || !base64.length || base64.length%4 || /[^A-Za-z0-9+/=]/.test(base64))throw new Error('Vidéo base64 invalide.');
  const padding=base64.indexOf('=');
  if(padding!==-1 && !((padding===base64.length-1) || (padding===base64.length-2 && base64.endsWith('=='))))throw new Error('Vidéo base64 invalide.');
  if(type!==undefined && (typeof type!=='string' || type.length>100 || (type!=='' && !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(type))))throw new Error('Type de vidéo invalide.');
  const bytes=atob(base64), array=new Uint8Array(bytes.length);
  for(let index=0;index<bytes.length;index++)array[index]=bytes.charCodeAt(index);
  return new Blob([array],{type:type || 'video/mp4'});
}

let dataOperationBusy=false;
function beginDataOperation(){
  if(dataOperationBusy)return null;
  dataOperationBusy=true;
  const controls=[...document.querySelectorAll('button,input,select,textarea')].map(element=>[element,element.disabled]);
  controls.forEach(([element])=>{element.disabled=true});
  return ()=>{
    controls.forEach(([element,disabled])=>{element.disabled=disabled});
    dataOperationBusy=false;
  };
}
async function exportData(withVideos){
  const finish=beginDataOperation();
  if(!finish)return;
  const button=$('expFullBtn'), initialLabel=button.textContent;
  let downloadURL;
  try{
    $('impStatus').textContent='Préparation de la sauvegarde…';
    const snapshot=await idbSnapshot();
    const videoBytes=withVideos?snapshot.exercises.reduce((total,ex)=>total+(ex.video?.size||0),0):0;
    if(Math.ceil(videoBytes/3)*4>BACKUP_LIMITS.fileBytes-1024*1024)throw new Error('Export complet trop volumineux (limite 512 Mo). Réduis les vidéos ou conserve leurs originaux séparément avec un export léger.');
    const out={app:'dojoflow',version:APP_VERSION,exportedAt:new Date().toISOString(),exercises:[],workouts:snapshot.workouts,journal:snapshot.journal};
    for(const [index,exercise] of snapshot.exercises.entries()){
      if(withVideos)button.textContent=`Export… ${index+1}/${snapshot.exercises.length}`;
      const copy={...exercise};
      delete copy.video;
      delete copy.videoBytes;
      delete copy.videoType;
      delete copy.videoError;
      if(withVideos && exercise.video){
        try{
          copy.videoB64=await blobToB64(exercise.video);
          copy.videoType=exercise.video.type;
        }catch(error){throw new Error('Export annulé : vidéo de « '+exercise.name+' » illisible. '+storageErrorMessage(error))}
      }
      out.exercises.push(copy);
    }
    const blob=new Blob([JSON.stringify(out)],{type:'application/json'});
    if(blob.size>BACKUP_LIMITS.fileBytes)throw new Error('Export trop volumineux (limite 512 Mo).');
    downloadURL=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=downloadURL;
    link.download=`dojoflow-${withVideos?'complet':'leger'}-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);link.click();link.remove();
    const url=downloadURL;
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    downloadURL=null;
    $('impStatus').textContent=`Téléchargement de l’export ${withVideos?'complet':'léger (sans vidéos)'} lancé (${fmtMo(blob.size)}). Vérifie qu’il est enregistré dans Fichiers ou Téléchargements.`;
  }catch(error){$('impStatus').textContent='❌ '+storageErrorMessage(error)}
  finally{
    if(downloadURL)URL.revokeObjectURL(downloadURL);
    button.textContent=initialLabel;
    finish();
  }
}
async function importData(mode){
  if(dataOperationBusy)return;
  const file=$('impFile').files[0];
  if(!file){alert('Choisis d’abord un fichier de sauvegarde .json.');return}
  const finish=beginDataOperation();
  if(!finish)return;
  let committed=false;
  try{
    if(!['merge','replace'].includes(mode))throw new Error('Mode de restauration invalide.');
    if(file.size>BACKUP_LIMITS.fileBytes)throw new Error('Sauvegarde trop volumineuse (maximum 512 Mo). Utilise une sauvegarde plus petite.');
    $('impStatus').textContent='Lecture et vérification du fichier…';
    let parsed;
    try{parsed=JSON.parse(await file.text())}catch(error){throw new Error('Fichier illisible : ce n’est pas un JSON valide.')}
    const data=normalizeBackup(parsed);
    const videoCount=data.exercises.filter(exercise=>exercise.video).length;
    if(mode==='replace'){
      validateBackupReferences(data);
      if(!confirm(`Remplacer toutes les données actuelles par ${data.exercises.length} exercices, ${videoCount} vidéos et ${data.workouts.length} entraînements ? Les données et vidéos absentes de cette sauvegarde seront supprimées.`)){
        $('impStatus').textContent='Restauration annulée. Aucune donnée n’a été modifiée.';
        return;
      }
    }
    $('impStatus').textContent='Enregistrement de la sauvegarde…';
    await restoreBackup(data,mode);
    committed=true;
    Object.keys(vidURLs).forEach(dropVidURL);
    if(typeof randSeq!=='undefined')randSeq=null;
    const randomResult=document.getElementById('randResult');
    if(randomResult)randomResult.textContent='';
    await reload();
    $('impFile').value='';
    $('impStatus').textContent=`✅ Import terminé : ${data.exercises.length} exercices (${videoCount} vidéos importées), ${data.workouts.length} entraînements.${mode==='merge'?' Les vidéos locales absentes de la sauvegarde ont été conservées.':''}`;
  }catch(error){
    $('impStatus').textContent='❌ '+storageErrorMessage(error)+(committed?' Les données ont été enregistrées ; recharge la page pour actualiser l’affichage.':' Aucune donnée n’a été modifiée.');
  }finally{finish()}
}
