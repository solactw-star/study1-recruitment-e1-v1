'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
const sha=value=>crypto.createHash('sha256').update(
 Buffer.isBuffer(value)?value:Array.isArray(value)?Buffer.from(value.map(n=>n&255)):
 Buffer.from(String(value),'utf8')).digest('hex');
function build({diskDir=null}={}){
 const values=new Map(),files=new Map(),folderId='1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU';
 let counter=0,onCreate=null,onPointerWrite=null,onPropertyWrite=null;
 const prop={getProperty:key=>values.has(key)?values.get(key):null,
  setProperty:(key,value)=>{
   values.set(key,value);
   if(onPropertyWrite)onPropertyWrite(key,value);
   if(key==='STUDY1_ECONSENT_POINTER_V2'&&onPointerWrite)onPointerWrite();
  }};
 const proxy=data=>({
  getId:()=>data.id,getSize:()=>data.diskSize??data.bytes.length,
  getUrl:()=> 'https://drive.google.com/file/d/'+data.id+'/view',
  setTrashed:value=>{data.trashed=value;},
  getMimeType:()=>data.mime,getSharingAccess:()=>data.access,
  setSharing:access=>{data.access=access;},
  getParents:()=>{let done=false;return {hasNext:()=>!done,
   next:()=>{done=true;return {getId:()=>data.parentId};}};},
  getBlob:()=>{const b=data.bytes;return {getBytes:()=>diskDir?b:[...b],
   getDataAsString:()=>b.toString('utf8')};}
 });
 const folder={getSharingAccess:()=> 'PRIVATE',
  createFile:blob=>{
   const data={id:'V2_PRIVATE_FILE_'+(++counter).toString().padStart(10,'0'),
    bytes:Buffer.from(blob.bytes),mime:blob.mime,access:'PRIVATE',parentId:folderId};
   if(diskDir){const target=path.join(diskDir,data.id);fs.writeFileSync(target,data.bytes);
    data.diskSize=data.bytes.length;delete data.bytes;
    Object.defineProperty(data,'bytes',{get:()=>fs.readFileSync(target)});}
   files.set(data.id,data);
   if(onCreate)onCreate();
   return proxy(data);
  }};
 const scope=vm.createContext({
  PropertiesService:{getScriptProperties:()=>prop},
  LockService:{getScriptLock:()=>({hasLock:()=>true,tryLock:()=>true,releaseLock:()=>{}})},
  DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{VIEW:'VIEW'},
   getFolderById:id=>{assert.equal(id,folderId);return folder;},
   getFileById:id=>{if(!files.has(id))throw Error('missing file '+id);return proxy(files.get(id));}},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},
   computeDigest:(_,v)=>[...Buffer.from(sha(v),'hex')],
   newBlob:(v,mime='application/json',name='')=>{
    const bytes=Array.isArray(v)?Buffer.from(v):Buffer.from(String(v),'utf8');
    return {bytes,mime,name,getBytes:()=>diskDir?bytes:[...bytes]};
   }},
  STUDY1_CONSENT_DOC_FOLDER_:folderId,
  study1BindingHmac_:items=>crypto.createHmac('sha256','only-synthetic-strong-test-key')
   .update(JSON.stringify(items)).digest('hex'),
  Session:{getActiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'}),getEffectiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'})},
  Date,JSON,Math,Number,String,Array,Object,Set,Error
 });
 vm.runInContext(source,scope,{timeout:5000});
 const entry=(n)=>({
  id:'aaaaaaaa-bbbb-4ccc-8ddd-'+n.toString(16).padStart(12,'0'),
  tokenHash:sha('TOKEN'+n),experiment:'E1',documentSha:sha('PRESIGNED_PDF_V1'),
  documentVersion:'Version02',expires:1799999999999,state:'ISSUED',
  explanation:null,signature:null,confirmation:null,withdrawal:null
 });
 const legacy={schemaVersion:1,revision:1,records:[entry(1)]};
 const legacyBytes=JSON.stringify(legacy);
 values.set('STUDY1_ECONSENT_PRIVATE_V1',legacyBytes);
 return {scope,values,files,legacy,legacyBytes,entry,
  enable:()=>values.set('STUDY1_ECONSENT_MIGRATION_V2_APPROVED','true'),
  onCreate:fn=>{onCreate=fn;},onPointerWrite:fn=>{onPointerWrite=fn;},onPropertyWrite:fn=>{onPropertyWrite=fn;}};
}
function grow(f,start,end){
 let prior=f.scope.study1EConsentRegistry_();
 for(let i=start;i<=end;i++){
  const next={...prior,revision:prior.revision+1,records:prior.records.concat([f.entry(i)])};
  f.scope.study1EConsentWrite_(prior,next);prior=next;
 }
 return prior;
}
test('legacy mode is unchanged and retains old 12-record/7500-byte gate',()=>{
 const f=build();
 const next={...f.legacy,revision:2,records:[...f.legacy.records,f.entry(2)]};
 f.scope.study1EConsentWrite_(f.legacy,next);
 assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),JSON.stringify(next));
 assert.equal(f.values.has('STUDY1_ECONSENT_POINTER_V2'),false);
 assert.equal(f.files.size,0);
 const tooMany={...next,revision:3,
  records:Array.from({length:13},(_,i)=>f.entry(i+1))};
 assert.throws(()=>f.scope.study1EConsentWrite_(next,tooMany),/容量不足/);
});
test('explicit V2 migration preserves original V1 bytes and grows beyond 12',()=>{
 const f=build();f.enable();
 const result=grow(f,2,17);
 assert.equal(result.records.length,17);
 assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),f.legacyBytes);
 const pointer=JSON.parse(f.values.get('STUDY1_ECONSENT_POINTER_V2'));
 assert.equal(pointer.schemaVersion,2);assert.equal(pointer.revision,result.revision);
 assert.equal(pointer.legacySha256,sha(f.legacyBytes));
 assert.equal(f.files.get(pointer.fileId).access,'PRIVATE');
 assert.equal(f.files.get(pointer.fileId).parentId,'1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU');
 assert.equal(pointer.sha256,sha(f.files.get(pointer.fileId).bytes));
 assert.equal(JSON.stringify(f.scope.study1EConsentRegistry_()),JSON.stringify(result));
 assert.equal(f.scope.study1EConsentRegistry_().records[0].id,f.legacy.records[0].id);
});
test('migration retains completed signed PDF and independent event references byte-for-byte',()=>{
 const f=build();f.enable();
 const completed={...f.entry(1),state:'CONFIRMED',
  signedPdf:{id:'PRIVATE_SIGNED_PDF_12345',sha:sha('signed pdf bytes')},
  signature:{id:'PRIVATE_SIGN_EVENT_12345',sha:sha('signature event')},
  confirmation:{id:'PRIVATE_CONFIRM_12345',sha:sha('confirmation event')}};
 const legacy={schemaVersion:1,revision:1,records:[completed]};
 const original=JSON.stringify(legacy);
 f.values.set('STUDY1_ECONSENT_PRIVATE_V1',original);
 const next={...legacy,revision:2,records:[completed,f.entry(2)]};
 f.scope.study1EConsentWrite_(legacy,next);
 assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),original);
 assert.equal(JSON.stringify(f.scope.study1EConsentRegistry_()),JSON.stringify(next));
});
test('invalid new records reject before any Drive version or pointer is written',()=>{
 const f=build();f.enable();
 const invalid={...f.legacy,revision:2,records:[
  {...f.entry(1),state:'FORGED'},f.entry(2)]};
 assert.throws(()=>f.scope.study1EConsentWrite_(f.legacy,invalid),/來源不合法/);
 assert.equal(f.files.size,0);
 assert.equal(f.values.has('STUDY1_ECONSENT_POINTER_V2'),false);
});
test('V2 pointer remains authoritative even after migration switch is off',()=>{
 const f=build();f.enable();grow(f,2,2);
 f.values.delete('STUDY1_ECONSENT_MIGRATION_V2_APPROVED');
 const result=grow(f,3,3);
 assert.equal(result.records.length,3);
 assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),f.legacyBytes);
});
test('tampered pointer and altered historic V1 bytes never fall back silently',()=>{
 const f=build();f.enable();grow(f,2,2);
 const ptr=JSON.parse(f.values.get('STUDY1_ECONSENT_POINTER_V2'));
 f.values.set('STUDY1_ECONSENT_POINTER_V2',JSON.stringify({...ptr,sha256:'f'.repeat(64)}));
 assert.throws(()=>f.scope.study1EConsentRegistry_(),/HMAC_INVALID/);
 f.values.set('STUDY1_ECONSENT_POINTER_V2',JSON.stringify(ptr));
 f.values.set('STUDY1_ECONSENT_PRIVATE_V1',f.legacyBytes+' ');
 assert.throws(()=>f.scope.study1EConsentRegistry_(),/LEGACY_CHANGED/);
});
test('private ACL, original folder parent and SHA are checked every read',()=>{
 const f=build();f.enable();grow(f,2,2);
 const ptr=JSON.parse(f.values.get('STUDY1_ECONSENT_POINTER_V2'));
 const file=f.files.get(ptr.fileId);
 file.access='ANYONE';
 assert.throws(()=>f.scope.study1EConsentRegistry_(),/PRIVATE_FILE_INVALID/);
 file.access='PRIVATE';file.parentId='DIFFERENT_FOLDER';
 assert.throws(()=>f.scope.study1EConsentRegistry_(),/OUTSIDE_PRIVATE_FOLDER/);
 file.parentId='1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU';
 file.bytes=Buffer.from(file.bytes);file.bytes[20]^=1;
 assert.throws(()=>f.scope.study1EConsentRegistry_(),/SHA_CHANGED/);
});
test('a storage error before pointer commit preserves original registry',()=>{
 const f=build();f.enable();
 f.onCreate(()=>{throw Error('synthetic staging write failure');});
 const next={...f.legacy,revision:2,records:[...f.legacy.records,f.entry(2)]};
 assert.throws(()=>f.scope.study1EConsentWrite_(f.legacy,next),/staging write failure/);
 assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),f.legacyBytes);
 assert.equal(f.values.has('STUDY1_ECONSENT_POINTER_V2'),false);
 assert.equal(f.scope.study1EConsentRegistry_().records.length,1);
});
test('pointer commit followed by ambiguous RPC error remains recoverable',()=>{
 const f=build();f.enable();
 f.onPointerWrite(()=>{throw Error('synthetic response lost after commit');});
 const next={...f.legacy,revision:2,records:[...f.legacy.records,f.entry(2)]};
 assert.throws(()=>f.scope.study1EConsentWrite_(f.legacy,next),/response lost/);
 assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),f.legacyBytes);
 assert.equal(JSON.stringify(f.scope.study1EConsentRegistry_()),JSON.stringify(next));
});
test('competing pointer change between staged file and commit is refused',()=>{
 const f=build();f.enable();
 f.onCreate(()=>{f.values.set('STUDY1_ECONSENT_POINTER_V2','STALE_FOREIGN_WRITER');});
 const next={...f.legacy,revision:2,records:[...f.legacy.records,f.entry(2)]};
 assert.throws(()=>f.scope.study1EConsentWrite_(f.legacy,next),/CONCURRENT_POINTER_WRITE/);
 assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),f.legacyBytes);
});
test('no authorized shared ScriptLock rejects migration before any Drive write',()=>{
 const f=build();f.enable();
 f.scope.LockService.getScriptLock=()=>({hasLock:()=>false});
 const next={...f.legacy,revision:2,records:[...f.legacy.records,f.entry(2)]};
 assert.throws(()=>f.scope.study1EConsentWrite_(f.legacy,next),/SHARED_LOCK_REQUIRED/);
 assert.equal(f.files.size,0);
});


// Capacity evidence uses only deterministic synthetic records and fake Drive.
// Bulk snapshots exercise the real storage commit/readback, not a claim that
// 3000 successive remote writes or actual Apps Script quotas were tested.
function capacityDocument(f){
 const raw=Buffer.from('%PDF-1.7\n'+ 'SYNTHETIC DOCUMENT BYTE INTEGRITY FIXTURE '.repeat(10));
 const id='PRIVATE_TEMPLATE_CAPACITY_01',folderId='1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU';
 const doc={id,experiment:'E1',version:'CAPACITY-TEST',title:'Synthetic template',sha256:sha(raw),
  bytes:raw.length,url:'https://drive.google.com/file/d/'+id,researcherPresigned:true};
 f.files.set(id,{id,bytes:raw,mime:'application/pdf',access:'PRIVATE',parentId:folderId});
 f.values.set('STUDY1_CONSENT_DOCUMENT_INDEX_V1',JSON.stringify({schemaVersion:1,revision:1,
  documents:[doc],current:{E1:id,E2:null},published:{E1:null,E2:null}}));
 return doc;
}
for(const count of [13,100,500,1000,3000,3001]){
 test('CAPACITY registry V2 + independent B10 source '+count+' records',()=>{
  const f=build();f.enable();const doc=capacityDocument(f);
  const initialFileCount=f.files.size;
  const next={...f.legacy,revision:2,records:Array.from({length:count},(_,i)=>f.entry(i+1))};
  if(count===3001){
   assert.throws(()=>f.scope.study1EConsentWrite_(f.legacy,next),/容量不合法/);
   assert.equal(f.files.size,initialFileCount);
   assert.equal(f.values.has('STUDY1_ECONSENT_POINTER_V2'),false);
   assert.equal(f.scope.study1EConsentRegistry_().records.length,1);
  }else{
   f.scope.study1EConsentWrite_(f.legacy,next);
   const p=JSON.parse(f.values.get('STUDY1_ECONSENT_POINTER_V2'));
   const actual=f.scope.study1EConsentRegistry_();
   assert.equal(actual.records.length,count);
   assert.equal(JSON.stringify(actual),JSON.stringify(next));
   assert.equal(p.sha256,sha(f.files.get(p.fileId).bytes));
   assert.equal(f.files.size,initialFileCount+1);
   // Duplicate at the tail must fail without creating another file/pointer.
   const before=f.values.get('STUDY1_ECONSENT_POINTER_V2');
   const dup={...actual,revision:3,records:actual.records.slice(0,-1).concat(actual.records[0])};
   assert.throws(()=>f.scope.study1EConsentWrite_(actual,dup),/索引不一致/);
   assert.equal(f.values.get('STUDY1_ECONSENT_POINTER_V2'),before);
   assert.equal(f.files.size,initialFileCount+1);
  }
  assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),f.legacyBytes);
  const catalog=f.scope.study1ConsentVersionRead_();
  assert.equal(catalog.documents.length,1);assert.equal(catalog.current.E1,doc.id);
  assert.equal(sha(f.scope.study1ConsentDocumentBytes_(catalog.documents[0])),doc.sha256);
  f.files.get(doc.id).access='ANYONE';
  assert.throws(()=>f.scope.study1ConsentDocumentBytes_(doc),/私人權限異常/);
 });
}
for(const bytes of [4999999,5000000,5000001]){
 test('CAPACITY registry exact UTF-8 '+bytes+' bytes plus independent B10 source',()=>{
  const f=build();f.enable();const doc=capacityDocument(f);
  const next={...f.legacy,revision:2,records:[f.entry(1),{...f.entry(2),syntheticPadding:''}]};
  const remaining=bytes-Buffer.byteLength(JSON.stringify(next),'utf8');
  // Deliberately artificial padding tests bytes rather than character count.
  next.records[1].syntheticPadding='測'.repeat(Math.floor(remaining/3))+'x'.repeat(remaining%3);
  assert.equal(Buffer.byteLength(JSON.stringify(next),'utf8'),bytes);
  if(bytes>5000000){
   assert.throws(()=>f.scope.study1EConsentWrite_(f.legacy,next),/SNAPSHOT_CAPACITY/);
   assert.equal(f.values.has('STUDY1_ECONSENT_POINTER_V2'),false);
   assert.equal(f.files.size,1);
  }else{
   f.scope.study1EConsentWrite_(f.legacy,next);
   const ptr=JSON.parse(f.values.get('STUDY1_ECONSENT_POINTER_V2'));
   assert.equal(f.files.get(ptr.fileId).bytes.length,bytes);
   assert.equal(JSON.stringify(f.scope.study1EConsentRegistry_()),JSON.stringify(next));
   assert.equal(ptr.sha256,sha(f.files.get(ptr.fileId).bytes));
   assert.equal(f.files.size,2);
  }
  assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),f.legacyBytes);
  assert.equal(sha(f.scope.study1ConsentDocumentBytes_(doc)),doc.sha256);
 });
}
test('CAPACITY B10 independent catalog 24/25 versions, not 3000 consent records',()=>{
 const f=build(),doc=capacityDocument(f);
 const read=()=>JSON.parse(f.values.get('STUDY1_CONSENT_DOCUMENT_INDEX_V1'));
 const catalog=read();
 catalog.documents=Array.from({length:24},(_,i)=>({...doc,id:'PRIVATE_TEMPLATE_CAPACITY_'+String(i+1).padStart(2,'0'),
  version:'CAPACITY-'+String(i+1)}));
 catalog.current.E1=catalog.documents[0].id;
 f.values.set('STUDY1_CONSENT_DOCUMENT_INDEX_V1',JSON.stringify(catalog));
 assert.equal(f.scope.study1ConsentVersionRead_().documents.length,24);
 catalog.documents.push({...doc,id:'PRIVATE_TEMPLATE_CAPACITY_25',version:'CAPACITY-25'});
 f.values.set('STUDY1_CONSENT_DOCUMENT_INDEX_V1',JSON.stringify(catalog));
 assert.throws(()=>f.scope.study1ConsentVersionRead_(),/版本目錄損毀/);
});


// A dedicated disk-backed fake Drive retains every exact snapshot byte.
// No real Apps Script service, quota or remote data is involved.
test('RETENTION sequential real V2 write/readback to 3000 records, all historical snapshots retained',t=>{
 const diskDir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'study1-registry-retention-'));
 t.after(()=>fs.rmSync(diskDir,{recursive:true,force:true}));
 const f=build({diskDir});f.enable();
 const expected=new Map(),marks=new Set([13,100,500,1000,3000]);
 let old=f.legacy,total=0;
 for(let i=2;i<=3000;i++){
  const next={...old,revision:old.revision+1,records:old.records.concat(f.entry(i))};
  f.scope.study1EConsentWrite_(old,next);
  const ptr=JSON.parse(f.values.get('STUDY1_ECONSENT_POINTER_V2'));
  const file=f.files.get(ptr.fileId);
  assert.equal(ptr.revision,i);assert.ok(!expected.has(ptr.fileId));
  assert.equal(file.diskSize,Buffer.byteLength(JSON.stringify(next),'utf8'));
  assert.equal(file.access,'PRIVATE');assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),f.legacyBytes);
  total+=file.diskSize;expected.set(ptr.fileId,{sha:ptr.sha256,revision:i,bytes:file.diskSize});
  old=next;
  if(marks.has(i))t.diagnostic('RETENTION_METRIC '+JSON.stringify({records:i,snapshots:f.files.size,currentBytes:file.diskSize,historyBytes:total}));
 }
 const active=f.scope.study1EConsentRegistry_();
 assert.equal(JSON.stringify(active),JSON.stringify(old));
 assert.equal(active.records.length,3000);assert.equal(f.files.size,2999);
 let verified=0;
 for(const [id,meta] of expected){
  const file=f.files.get(id),bytes=file.bytes;
  assert.equal(bytes.length,meta.bytes);assert.equal(sha(bytes),meta.sha);
  assert.equal(JSON.parse(bytes).revision,meta.revision);
  assert.equal(file.parentId,'1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU');
  assert.equal(file.trashed,undefined);verified++;
 }
 assert.equal(verified,2999);
 const before=f.values.get('STUDY1_ECONSENT_POINTER_V2');
 assert.throws(()=>f.scope.study1EConsentWrite_(old,{...old,revision:3001,records:old.records.concat(f.entry(3001))}),/容量不合法/);
 assert.equal(f.values.get('STUDY1_ECONSENT_POINTER_V2'),before);assert.equal(f.files.size,2999);
 t.diagnostic('RETENTION_VERIFIED '+JSON.stringify({snapshots:verified,historyBytes:total}));
});
test('RETENTION repeated revisions and ambiguous V2 commit retain historic signatures and withdrawal evidence',()=>{
 const f=build();f.enable();
 const signature={id:'PRIVATE_SIG_HISTORY_00001',sha:sha('synthetic signature')};
 const confirmation={id:'PRIVATE_CONF_HISTORY_00001',sha:sha('synthetic confirmation')};
 const signedPdf={id:'PRIVATE_PDF_HISTORY_00001',sha:sha('synthetic signed pdf')};
 const token='a'.repeat(80);
 const e={...f.entry(1),tokenHash:sha(token),expires:Date.now()+600000,state:'CONFIRMED',signature,confirmation,signedPdf};
 const first={...f.legacy,revision:2,records:[e]};
 f.scope.study1EConsentWrite_(f.legacy,first);
 const oldPointer=f.values.get('STUDY1_ECONSENT_POINTER_V2');
 const oldFile=f.files.get(JSON.parse(oldPointer).fileId),oldHash=sha(oldFile.bytes);
 const result=f.scope.study1EConsentWithdraw({token,reason:'synthetic request for destruction',dataChoice:'DESTROY'});
 assert.equal(result.recorded,true);assert.equal(result.requiresResearcherDataDisposition,true);
 assert.equal(result.dataDispositionState,'PENDING_RESEARCH_TEAM_ACTION');
 const current=f.scope.study1EConsentRegistry_(),withdrawn=current.records[0];
 assert.equal(withdrawn.state,'WITHDRAWN');assert.equal(withdrawn.signedPdf.id,signedPdf.id);
 assert.equal(withdrawn.signature.sha,signature.sha);assert.equal(withdrawn.confirmation.sha,confirmation.sha);
 assert.equal(f.scope.study1EConsentEvent_(withdrawn.withdrawal,withdrawn,'WITHDRAWAL').data.dataChoice,'DESTROY');
 assert.equal(sha(oldFile.bytes),oldHash);assert.equal(JSON.parse(oldFile.bytes).records[0].state,'CONFIRMED');
 assert.equal(f.files.size,3);
 f.onPointerWrite(()=>{throw Error('synthetic lost response after commit');});
 const next={...current,revision:4,records:current.records.concat(f.entry(2))};
 assert.throws(()=>f.scope.study1EConsentWrite_(current,next),/lost response/);
 f.onPointerWrite(null);
 assert.equal(JSON.stringify(f.scope.study1EConsentRegistry_()),JSON.stringify(next));
 assert.equal(f.files.size,4);assert.equal(sha(oldFile.bytes),oldHash);
 assert.ok([...f.files.values()].every(x=>!x.trashed));
 assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),f.legacyBytes);
});
// Characterization, not a security pass: valid old pointers are not a
// monotonic external anchor, and non-current history is not scanned on read.
test('RETENTION known gap: valid historical pointer rollback and missing inactive snapshot are not detected',t=>{
 const f=build();f.enable();grow(f,2,2);
 const earlier=f.values.get('STUDY1_ECONSENT_POINTER_V2'),earlyId=JSON.parse(earlier).fileId;
 grow(f,3,3);const latest=f.values.get('STUDY1_ECONSENT_POINTER_V2');
 f.values.set('STUDY1_ECONSENT_POINTER_V2',earlier);
 assert.equal(f.scope.study1EConsentRegistry_().revision,2);
 f.values.set('STUDY1_ECONSENT_POINTER_V2',latest);
 f.files.delete(earlyId);
 assert.equal(f.scope.study1EConsentRegistry_().revision,3);
 t.diagnostic('RETENTION_KNOWN_GAP valid old pointer replay and inactive history deletion undetected; independent anchor/inventory needed');
});
function b10Fixture(){
 const f=build(),key='STUDY1_CONSENT_DOCUMENT_INDEX_V1';
 f.values.set('OPEN','false');f.values.set('CONSENT_READY','false');
 const pdf=Buffer.from('%PDF-1.7\n'+'synthetic byte fixture '.repeat(12)+'\n%%EOF');
 const fixed='2026-11-18T00:00:00.000Z';
 f.scope.Date=class extends Date{constructor(...a){super(...(a.length?a:[fixed]));}};
 f.scope.Utilities.base64Decode=s=>Array.from(Buffer.from(s,'base64'));
 const input={experiment:'E1',title:'Synthetic template',version:'NEW-01',researcherPresigned:true,expectedRevision:1,base64:pdf.toString('base64')};
 const doc={experiment:'E1',id:'V2_PRIVATE_FILE_0000000001',title:input.title,version:input.version,
  sha256:sha(pdf),bytes:pdf.length,url:'https://drive.google.com/file/d/V2_PRIVATE_FILE_0000000001/view',researcherPresigned:true,at:fixed};
 const seed={experiment:'E1',id:'PRIVATE_OLD_PDF_00001',title:'Synthetic old',version:'OLD-01',
  sha256:sha(pdf),bytes:pdf.length,url:'https://drive.google.com/file/d/PRIVATE_OLD_PDF_00001/view',researcherPresigned:true,at:fixed};
 const catalog={schemaVersion:1,revision:1,documents:[seed],current:{E1:null,E2:null},published:{E1:null,E2:null}};
 const persist=()=>{
  for(const d of catalog.documents)f.files.set(d.id,{id:d.id,bytes:pdf,mime:'application/pdf',access:'PRIVATE',parentId:'1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU'});
  f.values.set(key,JSON.stringify(catalog));
 };
 const planned=kind=>kind==='upload'?{...catalog,revision:2,documents:catalog.documents.concat(doc)}:
  kind==='select'?{...catalog,revision:2,current:{...catalog.current,E1:seed.id}}:
  {...catalog,revision:2,published:{...catalog.published,E1:seed.id}};
 const prepare=(kind,n,unicode=false)=>{
  if(kind==='publish')catalog.current.E1=seed.id;
  if(unicode){
   catalog.documents=Array.from({length:12},(_,i)=>({...seed,id:'PRIVATE_OLD_PDF_'+String(i+1).padStart(5,'0'),version:'OLD-'+String(i+1).padStart(2,'0'),title:'測'.repeat(100)}));
  }
  const remainder=n-JSON.stringify(planned(kind)).length;
  assert.ok(remainder>=0);catalog.documents[0].url+='x'.repeat(remainder);
  assert.equal(JSON.stringify(planned(kind)).length,n);persist();
 };
 const prepareBytes=(kind,n,title='測'.repeat(100))=>{
  if(kind==='publish')catalog.current.E1=seed.id;
  seed.title=title;
  // Multiple real metadata titles produce sufficient Unicode overhead.
  catalog.documents=Array.from({length:5},(_,i)=>i===0?seed:{...seed,
   id:'PRIVATE_OTHER_PDF_'+String(i+1).padStart(5,'0'),version:'OTHER-'+String(i+1)});
  const remaining=n-Buffer.byteLength(JSON.stringify(planned(kind)),'utf8');
  assert.ok(remaining>=0);seed.url+='x'.repeat(remaining);
  const payload=JSON.stringify(planned(kind));
  assert.equal(Buffer.byteLength(payload,'utf8'),n);
  assert.ok(payload.length<=7500);persist();
 };
 const execute=kind=>kind==='upload'?f.scope.study1ConsentVersionUpload(input):
  kind==='select'?f.scope.study1ConsentVersionSelect({id:seed.id,expectedRevision:1}):
  f.scope.study1ConsentVersionPublication({id:seed.id,experiment:'E1',expectedRevision:1,confirmSha256:seed.sha256});
 return {f,key,doc,seed,catalog,prepare,prepareBytes,execute,planned,persist};
}
for(const kind of ['upload','select','publish']){
 for(const n of [7499,7500,7501]){
  test('RETENTION B10 '+kind+' exact '+n+' UTF-16 code units',()=>{
   const b=b10Fixture();b.prepare(kind,n);
   const before=b.f.values.get(b.key);
   if(n===7501){
    assert.throws(()=>b.execute(kind),/索引容量不足/);
    assert.equal(b.f.values.get(b.key),before);
    assert.equal(b.f.files.get(b.seed.id).trashed,undefined);
    if(kind==='upload')assert.equal(b.f.files.get(b.doc.id).trashed,true);
   }else{
    const result=b.execute(kind);
    assert.equal(JSON.stringify(result).length,n);
    assert.equal(b.f.values.get(b.key),JSON.stringify(b.planned(kind)));
    assert.equal(b.f.files.get(b.seed.id).trashed,undefined);
    if(kind==='upload')assert.equal(b.f.files.get(b.doc.id).trashed,undefined);
   }
  });
 }
}
test('B10 UTF8 regression: prior 7500 units / 9900 bytes case is refused before property commit',t=>{
 const b=b10Fixture();b.prepare('upload',7500,true);
 const expected=JSON.stringify(b.planned('upload')),bytes=Buffer.byteLength(expected,'utf8');
 assert.equal(expected.length,7500);assert.equal(bytes,9900);
 const before=b.f.values.get(b.key);let writes=0;
 b.f.onPropertyWrite(key=>{if(key===b.key)writes++;});
 assert.throws(()=>b.execute('upload'),/UTF-8 8000 bytes/);
 assert.equal(writes,0);assert.equal(b.f.values.get(b.key),before);
 assert.equal(b.f.files.get(b.doc.id).trashed,true);
 assert.equal(b.f.files.get(b.seed.id).trashed,undefined);
 t.diagnostic('B10_UTF8_PREVIOUS_DEFECT_REFUSED '+JSON.stringify({codeUnits:expected.length,utf8Bytes:bytes,writes}));
});
test('RETENTION B10 upload response lost after index commit preserves both old and new referenced files',()=>{
 const b=b10Fixture();b.prepare('upload',7500);
 b.f.onPropertyWrite((key)=>{if(key===b.key)throw Error('synthetic response lost after catalog commit');});
 assert.throws(()=>b.execute('upload'),/response lost/);b.f.onPropertyWrite(null);
 const current=b.f.scope.study1ConsentVersionRead_();
 assert.equal(current.documents.length,2);assert.equal(current.revision,2);
 assert.equal(b.f.files.get(b.seed.id).trashed,undefined);
 assert.equal(b.f.files.get(b.doc.id).trashed,undefined);
 assert.equal(sha(b.f.scope.study1ConsentDocumentBytes_(current.documents[1])),b.doc.sha256);
});


// Test each original mutation with exactly measured UTF-8 JSON; the old
// 7499/7500/7501 ASCII-unit tests above remain unchanged.
for(const kind of ['upload','select','publish']){
 for(const n of [7999,8000,8001]){
  test('B10 UTF8 '+kind+' exact '+n+' bytes with Chinese titles',()=>{
   const b=b10Fixture();b.prepareBytes(kind,n);
   const before=b.f.values.get(b.key);
   const oldHashes=new Map([...b.f.files].map(([id,file])=>[id,sha(file.bytes)]));
   let writes=0;b.f.onPropertyWrite(key=>{if(key===b.key)writes++;});
   if(n>8000){
    assert.throws(()=>b.execute(kind),/UTF-8 8000 bytes/);
    assert.equal(writes,0);assert.equal(b.f.values.get(b.key),before);
    if(kind==='upload')assert.equal(b.f.files.get(b.doc.id).trashed,true);
   }else{
    const result=b.execute(kind),payload=JSON.stringify(result);
    assert.equal(Buffer.byteLength(payload,'utf8'),n);
    assert.ok(payload.length<=7500);assert.equal(writes,1);
    assert.equal(b.f.values.get(b.key),payload);
    if(kind==='upload')assert.equal(b.f.files.get(b.doc.id).trashed,undefined);
   }
   for(const [id,hash] of oldHashes){
    assert.equal(sha(b.f.files.get(id).bytes),hash);
    assert.equal(b.f.files.get(id).trashed,undefined);
   }
  });
 }
}
test('B10 UTF8 exact encoder parity for Chinese, mixed scripts, emoji, escapes and lone surrogate JSON',()=>{
 const {f}=b10Fixture();
 for(const title of ['ABC','中文','Café','αβ','🙂','🇹🇼','𠮷','e\u0301','"\\\n\t','\ud800','\udc00','中🙂A']){
  const next={title,version:'TEST'};
  const payload=f.scope.study1ConsentCatalogPayload_(next);
  assert.equal(payload,JSON.stringify(next));
  assert.equal(f.scope.study1ConsentCatalogUtf8Bytes_(payload),Buffer.byteLength(payload,'utf8'));
 }
});
test('B10 UTF8 old oversize catalog remains readable; no-op leaves it alone and mutation fails closed',()=>{
 const b=b10Fixture();b.prepareBytes('publish',8200);
 const before=b.f.values.get(b.key);assert.ok(Buffer.byteLength(before,'utf8')>8000);
 let writes=0;b.f.onPropertyWrite(key=>{if(key===b.key)writes++;});
 const read=b.f.scope.study1ConsentVersionList();
 assert.equal(read.documents.length,5);
 assert.equal(sha(b.f.scope.study1ConsentDocumentBytes_(read.documents[0])),b.seed.sha256);
 assert.equal(JSON.stringify(b.f.scope.study1ConsentVersionSelect({id:b.seed.id,expectedRevision:1})),before);
 assert.throws(()=>b.execute('publish'),/UTF-8 8000 bytes/);
 assert.equal(writes,0);assert.equal(b.f.values.get(b.key),before);
 assert.ok([...b.f.files.values()].every(x=>!x.trashed));
});
test('B10 UTF8 unpublish uses the same guard: shrinking to 8000 allowed, still oversize rejected',()=>{
 for(const target of [8000,8001]){
  const b=b10Fixture();b.prepareBytes('publish',target+String(b.seed.id).length-2);
  b.catalog.published.E1=b.seed.id;
  const next={...b.catalog,revision:2,published:{E1:null,E2:null}};
  // Tune to the final serialized payload after clearing the selected ID.
  const n=Buffer.byteLength(JSON.stringify(next),'utf8');
  if(n>target)b.seed.url=b.seed.url.slice(0,-(n-target));
  else b.seed.url+='x'.repeat(target-n);
  assert.equal(Buffer.byteLength(JSON.stringify(next),'utf8'),target);b.persist();
  const before=b.f.values.get(b.key);let writes=0;
  b.f.onPropertyWrite(key=>{if(key===b.key)writes++;});
  const input={id:null,experiment:'E1',expectedRevision:1,confirmSha256:''};
  if(target===8000){
   assert.equal(b.f.scope.study1ConsentVersionPublication(input).published.E1,null);
   assert.equal(writes,1);
  }else{
   assert.throws(()=>b.f.scope.study1ConsentVersionPublication(input),/UTF-8 8000 bytes/);
   assert.equal(writes,0);assert.equal(b.f.values.get(b.key),before);
  }
  assert.ok([...b.f.files.values()].every(x=>!x.trashed));
 }
});
for(const kind of ['upload','select','publish']){
 test('B10 UTF8 '+kind+' response lost at exact 8000 bytes preserves evidence and stale retry fails',()=>{
  const b=b10Fixture();b.prepareBytes(kind,8000);
  const expected=JSON.stringify(b.planned(kind));let writes=0;
  b.f.onPropertyWrite(key=>{if(key===b.key){writes++;throw Error('synthetic response lost after catalog commit');}});
  assert.throws(()=>b.execute(kind),/response lost/);
  b.f.onPropertyWrite(null);
  const read=b.f.scope.study1ConsentVersionRead_();
  assert.equal(JSON.stringify(read),expected);assert.equal(read.revision,2);assert.equal(writes,1);
  for(const doc of read.documents){
   assert.equal(sha(b.f.scope.study1ConsentDocumentBytes_(doc)),doc.sha256);
   assert.equal(b.f.files.get(doc.id).trashed,undefined);
  }
  const count=b.f.files.size;
  assert.throws(()=>b.execute(kind),/變更|衝突|已更新/);
  assert.equal(b.f.files.size,count);assert.equal(b.f.values.get(b.key),expected);
 });
}


// The original registry reader + binding HMAC and original typed tab
// comparison run in this synthetic VM. No caller can open real Sheets/Drive.
function reconciliationFixture(){
 const f=build();
 const hmac=f.scope.study1BindingHmac_;
 for(const name of ['Study1EConsentBinding.js','BookingReadOnlySheet.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../gas',name),'utf8'),f.scope);
 f.scope.study1BindingHmac_=hmac;
 const sentinels={sheet:0,drive:0,property:0};
 const header=['consent_id','applicant_id','reservation_id','pdf_template_version','pre_signed_template_sha256',
  'signed_pdf_file_id','signed_pdf_sha256','signed_at_utc','status'];
 const at='2026-11-18T02:00:00.000Z';
 function make(i,state='CONFIRMED'){
  const suffix=String(i).padStart(12,'0'),e=f.entry(i);
  const b={schemaVersion:1,applicantId:'APP_PRIVATE_'+suffix,reservationId:'RSV_PRIVATE_'+suffix,
   slotId:'SLOT_PRIVATE_1234',challengeId:'CHL_PRIVATE_'+suffix,screeningId:'SCR_PRIVATE_'+suffix,
   experiment:'E1',documentSha:e.documentSha,documentVersion:e.documentVersion,
   identityEvidenceSha:sha('identity'+i),eligibilityEvidenceSha:sha('eligible'+i),priorE1EvidenceSha:null,
   verifiedAtUtc:'2026-11-18T01:50:00.000Z',otpUsedAtUtc:'2026-11-18T01:50:00.000Z',
   holdUntilUtc:'2026-11-18T02:10:00.000Z',digest:''};
  b.digest=f.scope.study1BindingDigest_(b);
  const ref=(kind)=>({id:'PRIVATE_'+kind+'_'+suffix,sha:sha(kind+i)});
  const x={...e,channel:'FORMAL_E1',researcherPresigned:true,binding:b,state,
   signature:ref('SIG'),confirmation:ref('CONF'),signedPdf:ref('PDF'),participantSignedPdf:ref('PDF'),
   withdrawal:state==='WITHDRAWN'?ref('WITHDRAW'):null};
  if(!['CONFIRMED','WITHDRAWN'].includes(state)){
   x.signature=null;x.confirmation=null;delete x.signedPdf;delete x.participantSignedPdf;
  }
  const row=[x.id,b.applicantId,b.reservationId,x.documentVersion,x.documentSha,
   x.signedPdf?.id||'',x.signedPdf?.sha||'',at,state];
  const proof={consentId:x.id,bindingDigest:b.digest,documentSha:x.documentSha,
   signatureSha:x.signature?.sha,confirmationSha:x.confirmation?.sha,signedPdfSha:x.signedPdf?.sha,
   signedAtUtc:at,verified:true,withdrawalSha:x.withdrawal?.sha||null};
  return {x,row,proof};
 }
 const snap=(entries,rows,proofs,revision=2)=>({registry:{schemaVersion:1,revision,records:entries},
  sheet:{headers:[...header],rows},proofs:{revision,records:proofs}});
 const clone=x=>structuredClone(x);
 const lock={hasLock:()=>true};
 function check(x,y=clone(x),held=lock){
  // Any new direct service access is a test failure. HMAC uses only the
  // existing isolated synthetic key and the production digest function.
  f.scope.SpreadsheetApp={openById:()=>{sentinels.sheet++;throw Error('FORBIDDEN_SHEET_IO');}};
  const prev=f.scope.DriveApp,props=f.scope.PropertiesService;
  f.scope.DriveApp=new Proxy({},{get(){sentinels.drive++;throw Error('FORBIDDEN_DRIVE_IO');}});
  f.scope.PropertiesService={getScriptProperties(){sentinels.property++;throw Error('FORBIDDEN_PROPERTY_IO');}};
  try{return f.scope.study1ConsentRecordsReconcile_(x,y,held);}
  finally{f.scope.DriveApp=prev;f.scope.PropertiesService=props;
   assert.deepEqual(sentinels,{sheet:0,drive:0,property:0});}
 }
 return {f,make,snap,clone,check,lock,sentinels,header};
}
test('RECONCILE actual V2 registry readback, completed/withdrawn metadata and exact nine columns are candidate-only',()=>{
 const h=reconciliationFixture(),a=h.make(1),b=h.make(2,'WITHDRAWN'),pending=h.make(3,'ISSUED');
 h.f.enable();
 const next={schemaVersion:1,revision:2,records:[a.x,b.x,pending.x]};
 h.f.scope.study1EConsentWrite_(h.f.legacy,next);
 const actual=h.f.scope.study1EConsentRegistry_();
 const snapshot=h.snap(actual.records,[a.row,b.row],[a.proof,b.proof],actual.revision);
 const before=JSON.stringify(snapshot),pointer=h.f.values.get('STUDY1_ECONSENT_POINTER_V2');
 const result=h.check(snapshot);
 assert.equal(result.result,'CANDIDATE_FIELDS_MATCH');assert.equal(result.counts.matchedCompletedRows,2);
 assert.equal(result.counts.notCompleted,1);assert.equal(result.counts.missingCompletedRows,0);
 assert.equal(result.formalSyncApproved,false);assert.equal(result.formalReady,false);assert.equal(result.sourceReadbackVerified,false);
 assert.equal(result.written,false);assert.equal(JSON.stringify(snapshot),before);
 assert.equal(h.f.values.get('STUDY1_ECONSENT_POINTER_V2'),pointer);
 assert.equal(h.f.files.size,1);assert.equal(h.f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),h.f.legacyBytes);
 assert.doesNotMatch(JSON.stringify(result),/APP_PRIVATE_|RSV_PRIVATE_|PRIVATE_PDF_|aaaaaaaa|signedAtUtc|tokenHash|base64/);
});
test('RECONCILE every projected field mismatch counted independently, no row contents exposed',()=>{
 const h=reconciliationFixture(),a=h.make(1);
 for(let j=1;j<9;j++){
  const row=a.row.slice();row[j]=j===7?'2026-11-18T02:01:00.000Z':'WRONG_PRIVATE_VALUE';
  const result=h.check(h.snap([a.x],[row],[a.proof]));
  assert.equal(result.result,'REVIEW_REQUIRED');assert.equal(result.counts.mismatchedCompletedRows,1);
  assert.equal(result.fieldMismatches[h.header[j]],1);
  assert.equal(Object.values(result.fieldMismatches).reduce((s,n)=>s+n,0),1);
  assert.doesNotMatch(JSON.stringify(result),/WRONG_PRIVATE_VALUE|APP_PRIVATE_|RSV_PRIVATE_|PRIVATE_PDF_/);
 }
});
test('RECONCILE orphan, pending, known legacy/E2, invalid ID and duplicate case variants stay separate',()=>{
 const h=reconciliationFixture(),a=h.make(1),pending=h.make(2,'ISSUED'),legacy=h.make(3),other=h.make(4);
 delete legacy.x.channel;other.x.experiment='E2';other.x.channel='OTHER';
 const orphan=h.make(5).row;
 const bad=a.row.slice();bad[0]='NOT_AN_ID';
 const variant=a.row.slice();variant[0]=a.row[0].toUpperCase();
 const result=h.check(h.snap([a.x,pending.x,legacy.x,other.x],[a.row,variant,pending.row,legacy.row,other.row,orphan,bad,Array(9).fill('')],[a.proof]));
 assert.equal(result.result,'REVIEW_REQUIRED');assert.equal(result.counts.duplicateSheetIdGroups,1);
 assert.equal(result.counts.ambiguousCompletedRows,1);assert.equal(result.counts.matchedCompletedRows,0);
 assert.equal(result.counts.unclassifiedRows,2);assert.equal(result.counts.outOfScopeRows,2);
 assert.equal(result.counts.preCompletionRows,1);assert.equal(result.counts.invalidIdRows,1);
 assert.equal(result.counts.emptyRows,1);assert.equal(result.counts.missingCompletedRows,0);
});
test('RECONCILE missing sheet row is review only; sheet-only record cannot create consent',()=>{
 const h=reconciliationFixture(),a=h.make(1),other=h.make(2);
 const result=h.check(h.snap([a.x],[other.row],[a.proof]));
 assert.equal(result.counts.missingCompletedRows,1);assert.equal(result.counts.unclassifiedRows,1);
 assert.equal(result.result,'REVIEW_REQUIRED');assert.equal(result.written,false);
 assert.equal(h.f.files.size,0);
});
test('RECONCILE forged binding, wrong reservation and duplicate reservation references never match',()=>{
 const h=reconciliationFixture(),a=h.make(1),b=h.make(2);
 const changed=h.clone(a.x);changed.binding.applicantId='APP_WRONG_PRIVATE';
 let result=h.check(h.snap([changed],[a.row],[a.proof]));
 assert.equal(result.counts.invalidBindingRecords,1);assert.equal(result.counts.matchedCompletedRows,0);
 b.x.binding.reservationId=a.x.binding.reservationId;
 b.x.binding.digest=h.f.scope.study1BindingDigest_(b.x.binding);
 b.row[2]=a.row[2];b.proof.bindingDigest=b.x.binding.digest;
 result=h.check(h.snap([a.x,b.x],[a.row,b.row],[a.proof,b.proof]));
 assert.equal(result.counts.ambiguousReservationRecords,2);assert.equal(result.counts.matchedCompletedRows,0);
});
test('RECONCILE missing, duplicate, forged or wrong-revision evidence never proves a completed record',()=>{
 const h=reconciliationFixture(),a=h.make(1,'WITHDRAWN');
 for(const proofs of [[],[a.proof,a.proof],[{...a.proof,verified:false}],
  [{...a.proof,withdrawalSha:null}],[{...a.proof,signedPdfSha:'0'.repeat(64)}],
  [{...a.proof,bindingDigest:'0'.repeat(64)}],[{...a.proof,signedAtUtc:'2026-02-30T02:00:00.000Z'}],
  [{...a.proof,rawSignature:'DO_NOT_RETURN'}]]){
  const result=h.check(h.snap([a.x],[a.row],proofs));
  assert.equal(result.counts.unverifiedEvidenceRecords,1);assert.equal(result.counts.matchedCompletedRows,0);
  assert.equal(result.result,'REVIEW_REQUIRED');assert.doesNotMatch(JSON.stringify(result),/DO_NOT_RETURN/);
 }
 const s=h.snap([a.x],[a.row],[a.proof]);s.proofs.revision--;
 assert.throws(()=>h.check(s),/CONSENT_RECORDS_SNAPSHOT_INVALID/);
});
test('RECONCILE unsigned and empty are not consent completion; typed UTC Date accepted, local date rejected',()=>{
 const h=reconciliationFixture(),a=h.make(1),pending=h.make(2,'ISSUED');
 let result=h.check(h.snap([pending.x],[],[]));
 assert.equal(result.result,'NO_COMPLETED_CANDIDATES');assert.equal(result.formalReady,false);
 result=h.check(h.snap([],[],[],0));
 assert.equal(result.result,'NO_COMPLETED_CANDIDATES');
 const row=a.row.slice();row[7]=new Date(a.row[7]);
 assert.equal(h.check(h.snap([a.x],[row],[a.proof])).counts.matchedCompletedRows,1);
 row[7]='2026/11/18 10:00';
 assert.equal(h.check(h.snap([a.x],[row],[a.proof])).fieldMismatches.signed_at_utc,1);
});
test('RECONCILE schema, row shape, duplicate registry IDs, evidence provenance and shared lock fail closed',()=>{
 const h=reconciliationFixture(),a=h.make(1);
 const valid=h.snap([a.x],[a.row],[a.proof]);
 const bad=h.clone(valid);bad.sheet.headers[1]='wrong';assert.throws(()=>h.check(bad),/SNAPSHOT_INVALID/);
 const sparse=h.clone(valid);delete sparse.sheet.rows[0][5];assert.throws(()=>h.check(sparse),/ROW_SHAPE_INVALID/);
 const date=h.clone(valid);date.sheet.rows[0][7]=new Date(NaN);assert.throws(()=>h.check(date),/ROW_SHAPE_INVALID/);
 const duplicate=h.snap([a.x,a.x],[a.row],[a.proof]);assert.throws(()=>h.check(duplicate),/索引不一致/);
 const variant=h.clone(a.x);variant.id=a.x.id.toUpperCase();
 assert.throws(()=>h.check(h.snap([a.x,variant],[a.row],[a.proof])),/REGISTRY_ID_AMBIGUOUS/);
 assert.throws(()=>h.check(valid,h.clone(valid),{hasLock:()=>false}),/LOCK_REQUIRED/);
 let calls=0;assert.throws(()=>h.check(valid,h.clone(valid),{hasLock:()=>++calls===1}),/LOCK_LOST/);
});
test('RECONCILE independent snapshots reject same-revision registry, sheet, evidence and typed date drift',()=>{
 const h=reconciliationFixture(),a=h.make(1),x=h.snap([a.x],[a.row],[a.proof]);
 for(const mutate of [s=>{s.registry.records[0].documentVersion='OTHER';},
  s=>{s.sheet.rows[0][8]='WITHDRAWN';},s=>{s.proofs.records[0].signedAtUtc='2026-11-18T02:01:00.000Z';},
  s=>{s.sheet.rows[0][7]=new Date(a.row[7]);}]){
  const y=h.clone(x);mutate(y);assert.throws(()=>h.check(x,y),/SOURCE_CHANGED/);
 }
});
test('RECONCILE 3000 synthetic completed records and 10000 row guard, tail mismatch not hidden',()=>{
 const h=reconciliationFixture(),data=Array.from({length:3000},(_,i)=>h.make(i+1));
 const s=h.snap(data.map(x=>x.x),data.map(x=>x.row),data.map(x=>x.proof));
 const first=h.check(s);assert.equal(first.counts.matchedCompletedRows,3000);
 s.sheet.rows[2999][6]='0'.repeat(64);
 const last=h.check(s);assert.equal(last.counts.matchedCompletedRows,2999);assert.equal(last.fieldMismatches.signed_pdf_sha256,1);
 s.sheet.rows=Array.from({length:10001},()=>Array(9).fill(''));
 assert.throws(()=>h.check(s),/SNAPSHOT_INVALID/);
});
test('RECONCILE candidate is private internal helper with no RPC or automatic call site',()=>{
 const matches=source.match(/study1ConsentRecordsReconcile_\s*\(/g)||[];
 assert.equal(matches.length,2); // definition plus internal preflight only
 assert.match(source,/const result=study1ConsentRecordsReconcile_\(first,second,lock\);/);
 assert.match(source,/function study1ConsentRecordsReconcile_\(/);
 assert.doesNotMatch(source,/function study1ConsentRecordsReconcile\(/);
});


// Actual original read-only tab, registry pointer, ACL and PDF/event readers
// execute against fake services. No credentials/network/real document.
function preflightFixture(){
 const h=reconciliationFixture(),f=h.f,c=f.scope;
 for(const n of ['BookingCore.js','Study1PdfStampCore.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../gas',n),'utf8'),c);
 c.Utilities.formatDate=(d)=>new Date(d.getTime()+8*3600000).toISOString().slice(0,10).replace(/-/g,'/');
 c.Utilities.base64Encode=bytes=>Buffer.from(bytes).toString('base64');
 const owner='solac.tw@gmail.com',personal='1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI',folder='1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU';
 c.SITE_RESOURCES_={personal,operations:'1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ'};
 const a=h.make(1,'WITHDRAWN'),pdf=Buffer.from('%PDF-1.7\n'+'SYNTHETIC ONLY '.repeat(20)+'\n%%EOF');
 const sourceId='PRIVATE_SOURCE_PDF_001',at=a.row[7],confirmed='2026-11-18T02:00:01.000Z',withdrawn='2026-11-18T02:00:02.000Z';
 const doc={experiment:'E1',id:sourceId,title:'synthetic',version:a.x.documentVersion,sha256:sha(pdf),
  bytes:pdf.length,url:'https://drive.google.com/file/d/'+sourceId+'/view',researcherPresigned:true,at};
 a.x.documentSha=doc.sha256;a.x.binding.documentSha=doc.sha256;
 a.x.binding.digest=c.study1BindingDigest_(a.x.binding);
 a.x.signedPdf.sha=sha(pdf);a.x.participantSignedPdf.sha=sha(pdf);
 const metadata=(id,mime,bytes)=>({id,mime,bytes,access:'PRIVATE',parentId:folder,owner,editors:[],viewers:[],trashed:false});
 const envelope=(ref,kind,data,time)=>{
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,kind,recordId:a.x.id,experiment:'E1',documentSha:doc.sha256,recordedAt:time,data}));
  ref.sha=sha(bytes);f.files.set(ref.id,metadata(ref.id,'application/json',bytes));
 };
 envelope(a.x.signature,'SIGNATURE',{serverSignedAt:at,taipeiDate:'2026/11/18',signedPdfSha256:sha(pdf),name:'PRIVATE_TEST_SENTINEL'},at);
 envelope(a.x.confirmation,'CONFIRMATION',{mode:'RESEARCHER_PRESIGNED_SOURCE',researcherSignedSourceSha256:doc.sha256,
  signatureHash:a.x.signature.sha,participantSignedPdfSha256:sha(pdf),researcherSignedPdfSha256:sha(pdf)},confirmed);
 envelope(a.x.withdrawal,'WITHDRAWAL',{signatureHash:a.x.signature.sha,confirmationHash:a.x.confirmation.sha,reason:'PRIVATE_REASON_SENTINEL'},withdrawn);
 f.files.set(sourceId,metadata(sourceId,'application/pdf',pdf));
 f.files.set(a.x.signedPdf.id,metadata(a.x.signedPdf.id,'application/pdf',pdf));
 f.values.set('STUDY1_CONSENT_DOCUMENT_INDEX_V1',JSON.stringify({schemaVersion:1,revision:1,documents:[doc],current:{E1:sourceId,E2:null},published:{E1:sourceId,E2:null}}));
 a.row=[a.x.id,a.x.binding.applicantId,a.x.binding.reservationId,a.x.documentVersion,a.x.documentSha,a.x.signedPdf.id,a.x.signedPdf.sha,at,'WITHDRAWN'];
 f.enable();c.study1EConsentWrite_(f.legacy,{schemaVersion:1,revision:2,records:[a.x]});
 const pointer=JSON.parse(f.values.get('STUDY1_ECONSENT_POINTER_V2'));
 Object.assign(f.files.get(pointer.fileId),{owner,editors:[],viewers:[],trashed:false});
 const wb=metadata(personal,'application/vnd.google-apps.spreadsheet',Buffer.alloc(0));
 const fd=metadata(folder,null,Buffer.alloc(0));
 const controls={active:owner,effective:owner,busy:false,lost:false,bookId:personal,missingTab:false,formula:null,rows:[a.row],
  headers:h.header.slice(),onOpen:null,onValues:null,onAcl:null,onBlob:null,onRelease:null,throwOpen:false};
 const calls={locks:0,releases:0,opens:0,drive:0,values:0,formulas:0,blobs:0,writes:0};
 const approvals=['STUDY1_PARTICIPANT_DATA_USE_APPROVED','STUDY1_ECONSENT_LIVE_SHEETS_APPROVED',
  'STUDY1_E1_FORMAL_WORKSPACE_READ_APPROVED','STUDY1_E1_CONSENT_RECORDS_PREFLIGHT_READ_APPROVED'];
 for(const k of approvals)f.values.set(k,'true');
 f.values.set('OPEN','false');f.values.set('CONSENT_READY','false');
 f.onPropertyWrite(()=>{calls.writes++;throw Error('FORBIDDEN_PROPERTY_WRITE');});
 let locked=false;
 c.Session={getActiveUser:()=>({getEmail:()=>controls.active}),getEffectiveUser:()=>({getEmail:()=>controls.effective})};
 c.LockService={getScriptLock:()=>({tryLock:()=>{calls.locks++;locked=!controls.busy;return locked;},
  hasLock:()=>locked&&!controls.lost,releaseLock:()=>{calls.releases++;locked=false;if(controls.onRelease)controls.onRelease();}})};
 const user=email=>({getEmail:()=>email});
 const proxy=data=>({
  getId:()=>data.id,isTrashed:()=>data.trashed,getSharingAccess:()=>{if(controls.onAcl)controls.onAcl(data);return data.access;},
  getOwner:()=>data.owner?user(data.owner):null,getEditors:()=>data.editors?.map(user),getViewers:()=>data.viewers?.map(user),
  getMimeType:()=>data.mime,getSize:()=>data.bytes.length,
  getParents:()=>{let n=0;return {hasNext:()=>n<(data.parentIds||[data.parentId]).length,next:()=>({getId:()=> (data.parentIds||[data.parentId])[n++]})};},
  getBlob:()=>{calls.blobs++;if(controls.onBlob)controls.onBlob(data);return {getBytes:()=>[...data.bytes],getDataAsString:()=>data.bytes.toString('utf8')};},
  setTrashed:()=>{calls.writes++;throw Error('FORBIDDEN_DRIVE_WRITE');},setSharing:()=>{calls.writes++;throw Error('FORBIDDEN_ACL_WRITE');}
 });
 // getParents iterator increments on next, not on getId (capture id).
 function fileProxy(data){
  const p=proxy(data);
  p.getParents=()=>{let n=0;const ids=data.parentIds||[data.parentId];return {hasNext:()=>n<ids.length,next:()=>{const id=ids[n++];return {getId:()=>id};}};};
  return p;
 }
 c.DriveApp={Access:{PRIVATE:'PRIVATE'},getFileById:id=>{calls.drive++;const data=id===personal?wb:f.files.get(id);
  if(!data)throw Error('PRIVATE_PROVIDER_ERROR '+id);return fileProxy(data);},
  getFolderById:id=>{calls.drive++;assert.equal(id,folder);return fileProxy(fd);}};
 const tab={getLastRow:()=>controls.rows.length+1,getLastColumn:()=>controls.headers.length,
  getRange:(start,col,n,width)=>{assert.equal(col,1);assert.equal(width,9);
   return {getFormulas:()=>{calls.formulas++;return Array.from({length:n},(_,i)=>Array.from({length:width},(_,j)=>
    controls.formula&&controls.formula(start+i,j,calls.formulas)?'=SECRET_FORMULA':''));
   },getValues:()=>{calls.values++;if(controls.onValues)controls.onValues(start);
    return start===1?[controls.headers]:controls.rows.slice(start-2,start-2+n);
   },setValues:()=>{calls.writes++;throw Error('FORBIDDEN_SHEET_WRITE');}};
  }};
 c.SpreadsheetApp={openById:id=>{calls.opens++;assert.equal(id,personal);
  if(controls.onOpen)controls.onOpen(calls.opens);
  if(controls.throwOpen)throw Error('PRIVATE_PROVIDER_ERROR '+personal);
  return {getId:()=>controls.bookId,getSheetByName:name=>{assert.equal(name,'ConsentRecords');return controls.missingTab?null:tab;}};
 }};
 const check=(...args)=>c.study1OwnerConsentRecordsPreflight_(...args);
 return {h,f,c,a,doc,wb,fd,controls,calls,approvals,pointer,personal,check,owner};
}
test('PREFLIGHT OWNER two actual synthetic source passes yield aggregate-only result with zero writes',()=>{
 const x=preflightFixture(),before=JSON.stringify([...x.f.values]),files=x.f.files.size;
 const result=x.check();
 assert.equal(result.result,'CANDIDATE_FIELDS_MATCH');assert.equal(result.counts.matchedCompletedRows,1);
 assert.equal(result.preflightMode,'ISOLATED_OWNER_CANDIDATE');assert.equal(result.boundedDoubleRead,true);
 for(const k of ['formalSyncApproved','formalReady','sourceReadbackVerified','written','historyAnchorVerified','formalReadAuthorized'])assert.equal(result[k],false);
 assert.equal(x.calls.opens,2);assert.equal(x.calls.values,4);assert.ok(x.calls.formulas>=8);assert.ok(x.calls.blobs>0);
 assert.equal(x.calls.locks,1);assert.equal(x.calls.releases,1);assert.equal(x.calls.writes,0);
 assert.equal(JSON.stringify([...x.f.values]),before);assert.equal(x.f.files.size,files);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|abcdef|aaaaaaaa|base64|signedAtUtc|solac.tw|serverSignedAt/);
});
test('PREFLIGHT missing dedicated or inherited approval and wrong OWNER stop before any source or lock access',()=>{
 for(const key of ['STUDY1_PARTICIPANT_DATA_USE_APPROVED','STUDY1_ECONSENT_LIVE_SHEETS_APPROVED',
  'STUDY1_E1_FORMAL_WORKSPACE_READ_APPROVED','STUDY1_E1_CONSENT_RECORDS_PREFLIGHT_READ_APPROVED']){
  const x=preflightFixture();x.f.values.delete(key);
  assert.throws(()=>x.check(),/NOT_APPROVED/);assert.equal(x.calls.opens+x.calls.drive+x.calls.locks,0);
 }
 for(const which of ['active','effective']){
  const x=preflightFixture();x.controls[which]='';
  assert.throws(()=>x.check(),/PREFLIGHT_REJECTED/);assert.equal(x.calls.opens+x.calls.drive+x.calls.locks,0);
 }
 const x=preflightFixture();assert.throws(()=>x.check({workbookId:'other'}),/NOT_APPROVED/);
 assert.equal(x.calls.opens+x.calls.drive+x.calls.locks,0);
});
test('PREFLIGHT workbook ID, missing tab and exact nine headers reject before data/evidence access',()=>{
 for(const change of [x=>{x.c.SITE_RESOURCES_.personal='OTHER';},
  x=>{x.controls.bookId='OTHER';},x=>{x.controls.missingTab=true;},
  x=>{x.controls.headers[3]='OTHER';},x=>{x.controls.headers.push('EXTRA');}]){
  const x=preflightFixture();change(x);assert.throws(()=>x.check(),/CONSENT_PREFLIGHT_/);
  assert.equal(x.calls.blobs,0);assert.equal(x.calls.releases,1);assert.equal(x.calls.writes,0);
 }
});
test('PREFLIGHT rejects workbook sharing, wrong owner, editors/viewers, trash, wrong MIME and missing ACL methods',()=>{
 for(const change of [x=>x.wb.access='PUBLIC',x=>x.wb.owner='OTHER',x=>x.wb.editors=['OTHER'],
  x=>x.wb.viewers=['OTHER'],x=>x.wb.trashed=true,x=>x.wb.mime='application/pdf',x=>x.wb.editors=null]){
  const x=preflightFixture();change(x);assert.throws(()=>x.check(),/PREFLIGHT_ACL/);
  assert.equal(x.calls.opens,0);assert.equal(x.calls.values,0);assert.equal(x.calls.releases,1);
 }
});
test('PREFLIGHT formulas in headers, values and inserted after read fail closed before PDF read',()=>{
 for(const formula of [(row,j)=>row===1&&j===0,(row,j)=>row===2&&j===5,
  (row,j,n)=>row===2&&j===5&&n>=4]){
  const x=preflightFixture();x.controls.formula=formula;
  assert.throws(()=>x.check(),/PREFLIGHT_REJECTED/);assert.equal(x.calls.blobs,0);assert.equal(x.calls.writes,0);
 }
});
test('PREFLIGHT changed sheet rows, catalog, pointer or same-revision snapshot rejected; no V1 fallback',()=>{
 const x=preflightFixture();x.controls.onOpen=n=>{if(n===2)x.controls.rows[0][8]='CONFIRMED';};
 assert.throws(()=>x.check(),/CONSENT_RECORDS_SOURCE_CHANGED/);
 const y=preflightFixture();y.controls.onOpen=n=>{if(n===2){
  const key='STUDY1_CONSENT_DOCUMENT_INDEX_V1',cat=JSON.parse(y.f.values.get(key));cat.revision++;y.f.values.set(key,JSON.stringify(cat));}};
 assert.throws(()=>y.check(),/PREFLIGHT_SOURCE_CHANGED/);
 const z=preflightFixture();z.f.values.delete('STUDY1_ECONSENT_POINTER_V2');
 assert.throws(()=>z.check(),/PREFLIGHT_V2_REQUIRED/);assert.equal(z.calls.blobs,0);
 const tampered=preflightFixture();tampered.f.files.get(tampered.pointer.fileId).bytes[0]^=1;
 assert.throws(()=>tampered.check(),/PREFLIGHT_REJECTED/);
});
test('PREFLIGHT evidence and registry strict private ACL, folder membership and source integrity reject',()=>{
 for(const change of [x=>x.fd.viewers=['OTHER'],x=>x.f.files.get(x.pointer.fileId).editors=['OTHER'],
  x=>x.f.files.get(x.a.x.signature.id).parentIds=['OTHER'],x=>x.f.files.get(x.a.x.withdrawal.id).viewers=['OTHER'],
  x=>x.f.files.get(x.a.x.signedPdf.id).bytes[15]^=1,
  x=>x.f.files.get(x.doc.id).bytes[15]^=1,
  x=>x.f.files.get(x.a.x.confirmation.id).bytes[15]^=1]){
  const x=preflightFixture();change(x);assert.throws(()=>x.check(),/CONSENT_PREFLIGHT_/);
  assert.equal(x.calls.writes,0);assert.equal(x.calls.releases,1);
 }
});
test('PREFLIGHT lock busy, lost mid-read, revoked gate or owner and post-read ACL drift never release data',()=>{
 const busy=preflightFixture();busy.controls.busy=true;assert.throws(()=>busy.check(),/LOCK_BUSY/);
 assert.equal(busy.calls.opens+busy.calls.drive+busy.calls.releases,0);
 for(const change of [x=>{x.controls.lost=true;},x=>{x.f.values.delete(x.approvals[3]);},
  x=>{x.controls.active='OTHER';},x=>{x.wb.viewers=['OTHER'];}]){
  const x=preflightFixture();x.controls.onValues=start=>{if(start===2)change(x);};
  assert.throws(()=>x.check(),/CONSENT_PREFLIGHT_/);assert.equal(x.calls.blobs,0);assert.equal(x.calls.releases,1);
 }
});
test('PREFLIGHT original provider errors and release errors are redacted; no arbitrary rows or public RPC',()=>{
 const x=preflightFixture();x.controls.throwOpen=true;
 assert.throws(()=>x.check(),e=>e.message==='CONSENT_PREFLIGHT_REJECTED');assert.equal(x.calls.releases,1);
 const y=preflightFixture();y.controls.onRelease=()=>{throw Error('PRIVATE_RELEASE_SECRET');};
 assert.throws(()=>y.check(),e=>e.message==='CONSENT_PREFLIGHT_LOCK_LOST');
 assert.equal((source.match(/study1OwnerConsentRecordsPreflight_\s*\(/g)||[]).length,1);
 assert.doesNotMatch(source,/function study1OwnerConsentRecordsPreflight\(/);
});
