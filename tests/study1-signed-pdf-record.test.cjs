'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),
 vm=require('node:vm'),zlib=require('node:zlib');
const PDFLib=require('../gas/Study1PdfLib.js');
const sha=buf=>crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex');
const blobBytes=value=>Buffer.isBuffer(value)?Buffer.from(value):Buffer.from(
 typeof value==='string'?value:[...value].map(b=>b&255));
const crc32=bytes=>{let x=0xffffffff;for(const b of bytes){x^=b;for(let i=0;i<8;i++)
 x=x&1?x>>>1^0xedb88320:x>>>1;}return (x^0xffffffff)>>>0};
const chunk=(name,data)=>{let t=Buffer.from(name),len=Buffer.alloc(4),crc=Buffer.alloc(4);
 len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));
 return Buffer.concat([len,t,data,crc]);};
function syntheticInk(){
 const w=64,h=32,pixels=Buffer.alloc(h*(w*4+1));
 for(let y=0;y<h;y++){let row=y*(w*4+1);for(let x=0;x<w;x++){
  let p=row+1+x*4,mark=x>3&&x<58&&Math.abs(y-(x/2-3))<2;
  pixels[p]=mark?10:255;pixels[p+1]=mark?10:255;
  pixels[p+2]=mark?20:255;pixels[p+3]=255;
 }}
 const hdr=Buffer.alloc(13);hdr.writeUInt32BE(w,0);hdr.writeUInt32BE(h,4);
 hdr[8]=8;hdr[9]=6;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),
  chunk('IHDR',hdr),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
async function createBlank(){
 const pdf=await PDFLib.PDFDocument.create();
 for(let i=0;i<5;i++){let p=pdf.addPage([595,842]);
  p.drawText('SYNTHETIC REC-UNAPPROVED E1 '+i,{x:20,y:800});}
 return Buffer.from(await pdf.save());
}
function buildHarness(original){
 const values=new Map(),files=new Map();
 const folderId='1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU',
       originalId='SyntheticPrivatePdfE1_0001';
 let counter=0,writes=0;
 let privateAccess='PRIVATE';
 function file(id,bytes,mime,name){
  const data={id,bytes:blobBytes(bytes),mime,name,access:privateAccess,trashed:false};
  files.set(id,data);
  return {getId:()=>id,getMimeType:()=>data.mime,getSize:()=>data.bytes.length,
   getSharingAccess:()=>data.access,
   setSharing:(access)=>{data.access=access;},
   setTrashed:()=>{data.trashed=true;},
   getBlob:()=>({getBytes:()=>[...data.bytes],
    getDataAsString:()=>data.bytes.toString('utf8')}),
   getParents:()=>{
    let pending=true;
    return {
     hasNext:()=>pending,
     next:()=>{pending=false;return {getId:()=>folderId};}
    };
   }
  };
 }
 file(originalId,original,'application/pdf','Synthetic.pdf');
 const fd={getProperty:k=>values.has(k)?values.get(k):null,
  setProperty:(k,v)=>{writes++;values.set(k,v)},
  setProperties:(pairs)=>{for(const [k,v] of Object.entries(pairs))values.set(k,v)}
 };
 const drives={Access:{PRIVATE:privateAccess},Permission:{VIEW:'VIEW'},
  getFolderById:id=>{assert.equal(id,folderId);return {
   getSharingAccess:()=>privateAccess,
   createFile:blob=>file('SyntheticPrivateFile_'+String(++counter).padStart(17,'0'),
    blob.bytes,blob.mime,blob.name)
  }},
  getFileById:id=>{assert.ok(files.has(id),'unknown Drive file ID '+id);
   return fileProxy(id);}};
 function fileProxy(id){
  const data=files.get(id);
  return {getId:()=>id,getMimeType:()=>data.mime,getSize:()=>data.bytes.length,
   getSharingAccess:()=>data.access,
   setTrashed:()=>{data.trashed=true},
   getBlob:()=>({getBytes:()=>[...data.bytes],
    getDataAsString:()=>data.bytes.toString('utf8')}),
   getParents:()=>{
    let more=true;
    return {
     hasNext:()=>more,
     next:()=>{more=false;return {getId:()=>folderId};}
    };
   }
  };
 }
 let serial=0;
 const utilities={
  DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF-8'},
  computeHmacSha256Signature:(txt,key)=>[...crypto.createHmac('sha256',key).update(txt).digest()],
  computeDigest:(_,data)=>[...crypto.createHash('sha256').update(blobBytes(data)).digest()],
  getUuid:()=>{serial++;return 'aaaaaaaa-bbbb-4ccc-8ddd-'+serial.toString(16).padStart(12,'0');},
  base64Decode:base64=>[...Buffer.from(base64,'base64')],
  base64Encode:bytes=>blobBytes(bytes).toString('base64'),
  newBlob:(value,mime='application/octet-stream',name='')=>{
   const bytes=blobBytes(value);return {bytes,mime,name,
    getBytes:()=>[...bytes]}
  },
  formatDate:(when,zone,format)=>{
   assert.equal(zone,'Asia/Taipei');assert.equal(format,'yyyy/MM/dd');
   const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(when).filter(t=>t.type!=='literal').map(t=>[t.type,t.value]));
   return p.year+'/'+p.month+'/'+p.day;
  }
 };
 const scope=vm.createContext({
  PDFLib,Utilities:utilities,PropertiesService:{getScriptProperties:()=>fd},
  DriveApp:drives,Session:{
   getActiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'}),
   getEffectiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'})
  },
  LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock:()=>{}})},
  JSON,Date,Number,String,Array,Set,Object,Uint8Array,Math,Error,Promise
 });
 for(const p of ['gas/AdminSandbox.js','gas/Study1PdfStampCore.js','gas/Study1EConsentBinding.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',p),'utf8'),scope);
 const doc={experiment:'E1',id:originalId,title:'Synthetic study consent',
  version:'Version02',sha256:sha(original),bytes:original.length,
  url:'https://drive.google.com/file/d/'+originalId+'/view'};
 values.set('STUDY1_CONSENT_DOCUMENT_INDEX_V1',JSON.stringify({
  schemaVersion:1,revision:2,documents:[doc],
  current:{E1:originalId,E2:null},published:{E1:originalId,E2:null}
 }));
 values.set('STUDY1_ECONSENT_APPROVED_PDF_LAYOUT_V1',JSON.stringify({
  schemaVersion:1,bindings:[{
   experiment:'E1',documentSha:doc.sha256,version:doc.version,
   pageCount:5,pageIndex:4,pageWidth:595,pageHeight:842,
   signature:{x:100,y:70,width:190,height:50},
   date:{x:350,y:87,fontSize:11}
  }]
 }));
 for(const [k,v] of Object.entries({OPEN:'true',CONSENT_READY:'true',
  STUDY1_ECONSENT_PROVIDER_VERIFIED:'true',
  STUDY1_ECONSENT_PDF_PROVIDER_VERIFIED:'true',
  STUDY1_ECONSENT_WIZARD_LINK_VERIFIED:'true',
  STUDY1_ECONSENT_BINDING_HMAC_KEY:crypto.randomBytes(40).toString('hex')}))values.set(k,v);
 return {scope,values,files,originalId,doc,writes:()=>writes};
}

/** Entirely synthetic trusted SNAPSHOT, not an authenticated GAS adapter or
 * a participant identity. Tests the actual binding verifier + PDF write path. */
function syntheticBindingEvidence(doc){
 const now=Date.now(),ts=n=>new Date(now+n).toISOString();
 const req={applicantId:'APP_00000001',screeningId:'SCR_00000001',
  challengeId:'CHAL_00000001',reservationId:'RSV_00000001',slotId:'SLOT_00000001',
  experiment:'E1',documentSha:doc.sha256,documentVersion:doc.version};
 const snapshot={
  applicants:{headers:['applicant_id','name','email','phone','created_at_utc','updated_at_utc','status'],
   rows:[[req.applicantId,'SYNTHETIC','participant@example.org','',ts(-7200000),ts(-600000),'EMAIL_VERIFIED']]},
  screenings:{headers:['screening_id','applicant_id','rules_version','eligibility_result','screened_at_utc','verified_by'],
   rows:[[req.screeningId,req.applicantId,'REC_TEST_V1','ELIGIBLE',ts(-5400000),'PARTICIPANT_SELF_REPORT']]},
  verification:{headers:['challenge_id','applicant_id','purpose','otp_hmac','expires_at_utc','attempts','used_at_utc','email','created_at_utc'],
   rows:[[req.challengeId,req.applicantId,'EMAIL_VERIFICATION','b'.repeat(64),ts(-1200000),
     1,ts(-1500000),'participant@example.org',ts(-1800000)]]},
  reservations:{headers:['reservation_id','applicant_id','slot_id','status','hold_until_utc','idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'],
   rows:[[req.reservationId,req.applicantId,req.slotId,'HELD',ts(900000),'HOLD_TEST',ts(-900000),'','',ts(-850000)]]},
  slots:{headers:['slot_id','start_at_utc','end_at_utc','capacity','location_code','status','created_by','updated_at_utc'],
   rows:[[req.slotId,ts(7200000),ts(10800000),5,'TEST','OPEN','STAFF_TEST','']]},
  identity:{verified:true,provenance:'STUDY1_E1_SELF_REPORT_OTP_HMAC',
   consentProcedureApproved:true,
   emailControlSource:'ORIGINAL_VERIFICATION_FG',
   eligibilityEvidenceSource:'PARTICIPANT_SELF_REPORT',
   eligibilityEvidenceSha256:'e'.repeat(64),applicantId:req.applicantId,experiment:'E1',
   email:'participant@example.org',
   evidenceSha256:'c'.repeat(64),verifiedAtUtc:ts(-1500000),
   screeningVersion:'REC_TEST_V1',screeningId:req.screeningId,slotId:req.slotId,
   reservationId:req.reservationId,challengeId:req.challengeId}
 };
 return {request:req,adapter:{readTrustedSnapshot:()=>snapshot},snapshot};
}


test('Retired researcher second-signature and synthetic consent RPCs are deleted from V2',async()=>{
 const h=buildHarness(await createBlank());
 for(const fn of ['study1EConsentIssue','study1EConsentExplain','study1EConsentSession',
  'study1EConsentSign','study1EConsentConfirm','study1EConsentCopy',
  'study1EConsentConfirmPdf','study1EConsentOwnerPendingPdfConfirmations',
  'study1PdfResearcherLayoutRead_','study1PdfComposeResearcherSigned_']){
  assert.equal(typeof h.scope[fn],'undefined',fn+' must not exist');
 }
 assert.equal(h.files.size,1,'deleting obsolete RPCs cannot create evidence');
});
test('Only the FORMAL_E1 ISSUED and researcher-presigned original may be signed',async()=>{
 const original=await createBlank(),h=buildHarness(original),png=syntheticInk();
 const index=JSON.parse(h.values.get('STUDY1_CONSENT_DOCUMENT_INDEX_V1'));
 index.documents[0].researcherPresigned=true;
 h.doc.researcherPresigned=true;
 h.values.set('STUDY1_CONSENT_DOCUMENT_INDEX_V1',JSON.stringify(index));
 const {request,adapter}=syntheticBindingEvidence(h.doc);
 h.scope.study1EConsentBindingAdapter_=()=>adapter;
 const issued=h.scope.study1EConsentIssueBound_(request);
 const input={token:issued.token,name:'SYNTHETIC',signature:png.toString('base64'),
  documentSha:h.doc.sha256,read:true,answerAcknowledged:true,agree:true};
 const stored=h.scope.study1EConsentRegistry_(),row=stored.records[0];
 const count=h.files.size;
 row.channel='FORMAL_E1';row.researcherPresigned=false;
 h.values.set('STUDY1_ECONSENT_PRIVATE_V1',JSON.stringify(stored));
 await assert.rejects(h.scope.study1EConsentSignPdf(input),/E1_PRESIGNED_FORMAL_ONLY/);
 row.researcherPresigned=true;row.state='EXPLAINED';
 h.values.set('STUDY1_ECONSENT_PRIVATE_V1',JSON.stringify(stored));
 await assert.rejects(h.scope.study1EConsentSignPdf(input),/E1_PRESIGNED_FORMAL_ONLY/);
 row.state='ISSUED';row.channel='LEGACY';
 h.values.set('STUDY1_ECONSENT_PRIVATE_V1',JSON.stringify(stored));
 await assert.rejects(h.scope.study1EConsentSignPdf(input),/E1_PRESIGNED_FORMAL_ONLY/);
 assert.equal(h.files.size,count,'invalid source never persists signed PDF');
});
test('E2 still does not become an E1 signing option',async()=>{
 const h=buildHarness(await createBlank());
 assert.throws(()=>h.scope.study1EConsentReadyDocument_('E2'),/實驗二|實驗不合法/);
});

test('full signing is fail-closed when the independent PDF or wizard binding gate is missing',async()=>{
 const h=buildHarness(await createBlank()),before=h.files.size;
 h.values.set('STUDY1_ECONSENT_WIZARD_LINK_VERIFIED','false');
 await assert.rejects(h.scope.study1EConsentSignPdf({}),/PDF_LINK_NOT_READY|目前尚未/);
 assert.equal(h.files.size,before);
});





test('MVP actual PDF engine accepts only researcher presigned source, adds participant ink once and permits OWNER private download',async()=>{
 const docPdf=await PDFLib.PDFDocument.load(await createBlank());
 docPdf.getPage(4).drawText('SYNTHETIC RESEARCHER PRESIGNED BEFORE PARTICIPANT',
  {x:60,y:260,size:10});
 const original=Buffer.from(await docPdf.save()),h=buildHarness(original),png=syntheticInk();
 const index=JSON.parse(h.values.get('STUDY1_CONSENT_DOCUMENT_INDEX_V1'));
 index.documents[0].researcherPresigned=true;
 h.doc.researcherPresigned=true;
 h.values.set('STUDY1_CONSENT_DOCUMENT_INDEX_V1',JSON.stringify(index));
 const {request,adapter}=syntheticBindingEvidence(h.doc);
 h.scope.study1EConsentBindingAdapter_=()=>adapter;
 const issued=h.scope.study1EConsentIssueBound_(request);
 const registry=h.scope.study1EConsentRegistry_();
 registry.records[0].channel='FORMAL_E1';
 registry.records[0].researcherPresigned=true;
 assert.equal(registry.records[0].state,'ISSUED');
 assert.equal(registry.records[0].explanation,null);
 h.values.set('STUDY1_ECONSENT_PRIVATE_V1',JSON.stringify(registry));
 h.scope.study1FormalConsentGate_=()=>true;
 h.scope.study1FormalConsentCopyExpiry_=()=>Date.now()+72*3600000;
 let bookingChecks=0,mailCount=0;
 h.scope.study1FormalFinalizeSignedE1Booking_=(id,token)=>{
  bookingChecks++;assert.equal(id,issued.id);assert.equal(token,issued.token);
  return {bookingConfirmed:true,bookingStatus:'CONFIRMED'};
 };
 h.scope.study1ParticipantBookingNotice_=(email,consentId)=>{
  mailCount++;assert.equal(email,'participant@example.org');
  assert.equal(consentId,issued.id);
  return {attempted:true,status:'PROVIDER_ACCEPTED'};
 };
 const signed=await h.scope.study1EConsentSignPdf({
  token:issued.token,name:'SYNTHETIC',signature:png.toString('base64'),
  documentSha:h.doc.sha256,read:true,answerAcknowledged:true,agree:true
 });
 assert.equal(signed.state,'CONFIRMED');
 assert.equal(signed.researcherPreSigned,true);
 assert.equal(signed.originalBookingConfirmed,true);
 assert.equal(signed.emailNotificationStatus,'PROVIDER_ACCEPTED_NOT_DELIVERED');
 assert.equal(bookingChecks,1);assert.equal(mailCount,1);
 const entry=h.scope.study1EConsentRegistry_().records[0];
 assert.equal(entry.researcherPresigned,true);
 assert.equal(entry.explanation,null,'must not forge researcher explanation event');
 assert.equal(entry.signedPdf.sha,entry.participantSignedPdf.sha);
 const copy=h.scope.study1EConsentSignedPdfCopy(issued.token);
 assert.equal(copy.researcherPreSigned,true);
 assert.equal(copy.researcherSignedAt,null,'pre-sign time must not be fabricated');
 assert.equal(copy.participantSignedPdfSha256,copy.signedPdfSha256);
 assert.equal(sha(Buffer.from(copy.base64,'base64')),copy.signedPdfSha256);
 const owner=h.scope.study1EConsentOwnerSignedPdfDownload(issued.id);
 assert.equal(owner.signedPdfSha256,copy.signedPdfSha256);
 assert.equal(sha(Buffer.from(owner.base64,'base64')),copy.signedPdfSha256);
 const stored=h.scope.study1EConsentRegistry_(),altered=JSON.parse(JSON.stringify(stored));
 altered.records[0].participantSignedPdf.sha='0'.repeat(64);
 h.values.set('STUDY1_ECONSENT_PRIVATE_V1',JSON.stringify(altered));
 assert.throws(()=>h.scope.study1EConsentOwnerSignedPdfDownload(issued.id),
  /OWNER_SIGNED_PDF_EVIDENCE_CHANGED|同意|PDF/);
 h.values.set('STUDY1_ECONSENT_PRIVATE_V1',JSON.stringify(stored));
 const eventBefore=h.scope.study1EConsentEvent_;
 h.scope.study1EConsentEvent_=(ref,entry,kind)=>{
  const event=eventBefore(ref,entry,kind);
  return kind==='SIGNATURE'?{...event,data:{...event.data,taipeiDate:'2000/01/01'}}:event;
 };
 assert.throws(()=>h.scope.study1EConsentOwnerSignedPdfDownload(issued.id),
  /OWNER_SIGNED_PDF_CHRONOLOGY_INVALID/);
 h.scope.study1EConsentEvent_=eventBefore;
 const viewed=await PDFLib.PDFDocument.load(Buffer.from(copy.base64,'base64'));
 assert.equal(viewed.getPageCount(),5);
 assert.equal(sha(original),h.doc.sha256);
 const withdrawn=h.scope.study1EConsentWithdraw({token:issued.token,
  reason:'SYNTHETIC_REQUEST_TO_WITHDRAW',dataChoice:'CONTACT_STAFF'});
 assert.equal(withdrawn.state,'WITHDRAWN');
 assert.equal(h.scope.study1EConsentSignedPdfCopy(issued.token).signedPdfSha256,
  copy.signedPdfSha256,'withdrawal does not rewrite the signed original PDF');
 await assert.rejects(h.scope.study1EConsentSignPdf({
  token:issued.token,name:'SYNTHETIC',signature:png.toString('base64'),
  documentSha:h.doc.sha256,read:true,answerAcknowledged:true,agree:true
 }),/失效|狀態|BINDING|驗證|not|此固定文件/);
});
