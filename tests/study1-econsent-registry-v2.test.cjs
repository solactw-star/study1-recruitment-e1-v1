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
