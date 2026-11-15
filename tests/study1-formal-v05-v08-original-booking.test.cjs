'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),
 crypto=require('node:crypto');
const scripts=['BookingCore.js','BookingHoldTransaction.js','BookingReadOnlySheet.js',
 'Study1EConsentBinding.js','Study1ParticipantIntake.js','Study1WizardP0Bridge.js',
 'Study1FormalBooking.js'].map(name=>
  fs.readFileSync(path.join(__dirname,'../gas',name),'utf8')).join('\n');
const P='1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI',
 O='1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ';
const ts=(t,n)=>new Date(t+n).toISOString();
function harness(){
 const t=Date.now(),secret=crypto.randomBytes(48).toString('hex');
 const S1='SLOT_E1_12345678',S2='SLOT_E1_87654321',
  S3='SLOT_E2_22222222';
 let held=false,failAppend=false,intercept=null,propertyHook=null,seq=0,mutations=[];
 const props=new Map([
  ['STUDY1_ECONSENT_BINDING_HMAC_KEY',secret],
  ['STUDY1_WIZARD_P0_SHEET_HOLD_VERIFIED','true'],
  ['STUDY1_E1_SELF_REPORT_OTP_SOURCE_VERIFIED','true'],
  ['STUDY1_E1_BOOKING_APPROVED','true'],
  ['STUDY1_E1_SLOT_REGISTRY_APPROVED','true'],
  ['STUDY1_E1_WAITLIST_POLICY_REVIEWED','true']
 ]);
 const tables={
  Slots:{headers:['slot_id','start_at_utc','end_at_utc','capacity','location_code',
   'status','created_by','updated_at_utc'],
   rows:[[S1,ts(t,4*3600000),ts(t,5*3600000),1,'E1_ROOM','OPEN','REVIEWED_OWNER',''],
    [S2,ts(t,6*3600000),ts(t,7*3600000),1,'E1_ROOM_2','OPEN','REVIEWED_OWNER',''],
    [S3,ts(t,7*3600000),ts(t,8*3600000),1,'E2_ROOM','OPEN','REVIEWED_OWNER','']]},
  Reservations:{headers:['reservation_id','applicant_id','slot_id','status','hold_until_utc',
   'idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'],
   rows:[]},
  Applicants:{headers:['applicant_id','name','email','phone','created_at_utc',
   'updated_at_utc','status'],rows:[]},
  Screenings:{headers:['screening_id','applicant_id','rules_version','eligibility_result',
   'screened_at_utc','verified_by'],rows:[]},
  AuditLogs:{headers:['event_id','occurred_at_utc','actor_type','actor_id','action','target_type','target_id','result','request_id'],rows:[]},
  Notifications:{headers:['notification_id','applicant_id','reservation_id','kind','status','attempts','created_at_utc','sent_at_utc','last_error_code'],rows:[]},
  Verification:{headers:['challenge_id','applicant_id','purpose','otp_hmac',
   'expires_at_utc','attempts','used_at_utc','email','created_at_utc'],rows:[]}
 };
 const evidenceFiles=[];let evidenceCreateHook=null;
 const cursor=items=>{let i=0;return {hasNext:()=>i<items.length,next:()=>items[i++]};};
 const folder={
  searchFiles:q=>{const prefix=q.match(/title contains '([^']+)'/)[1];return cursor(evidenceFiles.filter(f=>f.name.includes(prefix)));},
  getFilesByName:name=>cursor(evidenceFiles.filter(f=>f.name===name)),
  createFile:blob=>{
   assert.equal(held,true);const f={name:blob.name,raw:blob.raw,access:'PRIVATE',
    getName(){return this.name},getId(){return 'FAKE_FILE_'+this.name},getSharingAccess(){return this.access},
    getMimeType(){return 'application/json'},getSize(){return Buffer.byteLength(this.raw)},
    getParents(){return cursor([{getId:()=> 'ORIGINAL_CONSENT_FOLDER'}])},
    getBlob(){return {getDataAsString:()=>this.raw}},setSharing(){this.access='PRIVATE'}};
   evidenceFiles.push(f);if(evidenceCreateHook)evidenceCreateHook(f);return f;
  }};
 let personRecords=new Map();
 function person(label){
  const appId='APP_TEST_'+label+'12345678',
   screenId='SCR_TEST_'+label+'12345678',
   challengeId='CHL_TEST_'+label+'12345678',
   email='synthetic.'+label.toLowerCase()+'@example.org',
   created=ts(t,-1200000),screened=ts(t,-900000),
   challengeAt=ts(t,-300000),used=ts(t,-120000);
  tables.Applicants.rows.push([appId,'合成測試',email,'',
   created,ts(t,-110000),'EMAIL_VERIFIED']);
  tables.Screenings.rows.push([screenId,appId,'E1_TEST_V1','ELIGIBLE',
   screened,'PARTICIPANT_SELF_REPORT']);
  tables.Verification.rows.push([challengeId,appId,'EMAIL_VERIFICATION',
   'b'.repeat(64),ts(t,180000),1,used,email,challengeAt]);
  const id={applicantId:appId,screeningId:screenId,
   challengeId,experiment:'E1',verified:true,
   provenance:'STUDY1_E1_SELF_REPORT_OTP_HMAC',
   eligibilityEvidenceSource:'PARTICIPANT_SELF_REPORT',
   emailControlSource:'ORIGINAL_VERIFICATION_FG',
   eligibilityEvidenceSha256:crypto.createHash('sha256').update('elig'+label).digest('hex'),
   evidenceSha256:crypto.createHash('sha256').update('mail'+label).digest('hex'),
   screeningVersion:'E1_TEST_V1',email,verifiedAtUtc:used};
  personRecords.set(appId,id);
  return id;
 }
 function book(id){
  const allowed=id===P?['Applicants','Screenings','Verification']:['Slots','Reservations','Notifications','AuditLogs'];
  if(![P,O].includes(id))throw Error('UNKNOWN_SHEET');
  return {getId:()=>id,getSheetByName:name=>{
   if(!allowed.includes(name))return null;
   const table=tables[name];
   return {getLastRow:()=>table.rows.length+1,
    getLastColumn:()=>table.headers.length,
    getRange:(start,col,height,width)=>{
     if(start<1||col<1||height<1||width<1)throw Error('INVALID_RANGE');
     return {getValues:()=>Array.from({length:height},(_,i)=>{
      const row=start+i===1?table.headers:table.rows[start+i-2];
      if(!row)throw Error('READ_PAST_END');
      return row.slice(col-1,col+width-1);
     }),getFormulas:()=>Array.from({length:height},()=>Array(width).fill('')),
     createTextFinder:term=>{
      let entire=false,sensitive=true,regex=true;
      const finder={matchEntireCell(value){entire=value;return finder;},
       matchCase(value){sensitive=value;return finder;},
       useRegularExpression(value){regex=value;return finder;},
       findAll(){
        assert.equal(entire,true);assert.equal(regex,false);
        const matching=[];
        for(let row=start;row<start+height;row++){
         const cells=row===1?table.headers:table.rows[row-2];
         if(!cells)continue;
         const value=cells[col-1];
         const equal=sensitive?value===term:String(value).toLowerCase()===String(term).toLowerCase();
         if(equal)matching.push({getRow:()=>row,getColumn:()=>col});
        }
        return matching;
       }};
      return finder;
     },
     setValues:grid=>{
      if(!held)throw Error('UNLOCKED_MUTATION');
      if(intercept){const fn=intercept;intercept=null;fn()}
      for(let i=0;i<height;i++){
       const row=table.rows[start+i-2];
       if(!row)throw Error('WRITE_PAST_END');
       for(let j=0;j<width;j++)row[col+j-1]=grid[i][j];
      }
      mutations.push({name,method:'set',start,col});
     }};
    },
    appendRow:row=>{
     if(!held)throw Error('UNLOCKED_APPEND');
     if(failAppend){failAppend=false;throw Error('SYNTHETIC_APPEND_FAILURE');}
     if(intercept){const fn=intercept;intercept=null;fn()}
     table.rows.push(row.slice());
     mutations.push({name,method:'append',row:row.slice()});
    }};
  }};
 }
 const locks={getScriptLock:()=>{
  let owned=false;
  return {tryLock:()=>{if(held)return false;held=true;owned=true;return true},
   hasLock:()=>owned&&held,
   releaseLock:()=>{if(owned)held=false;owned=false}};
 }};
 const clock={now:t};
 class FixedDate extends Date{
  constructor(...args){super(...(args.length?args:[clock.now]))}
  static now(){return clock.now}
 }
 const ctx=vm.createContext({
  Date:FixedDate,JSON,Array,Object,Math,Number,String,Boolean,Set,Map,Error,
  DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{VIEW:'VIEW'}},STUDY1_CONSENT_DOC_FOLDER_:'ORIGINAL_CONSENT_FOLDER',
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperties:values=>{if(!held)throw Error('UNLOCKED_PROPERTY');if(propertyHook)propertyHook(values);for(const [k,v] of Object.entries(values))props.set(k,v);mutations.push({method:'properties'});}})},
  Session:{getActiveUser:()=>({getEmail:()=> 'owner@example.org'})},
  Utilities:{Charset:{UTF_8:'UTF-8'},newBlob:(raw,mime,name)=>({raw,mime,name}),
   getUuid:()=> '00000000-1111-4222-8333-'+String(++seq).padStart(12,'0'),
   computeHmacSha256Signature:(text,key)=>
    [...crypto.createHmac('sha256',key).update(text).digest()]},
  LockService:locks,
  SITE_RESOURCES_:{personal:P,operations:O},
  SpreadsheetApp:{openById:book,flush:()=>mutations.push({method:'flush'})}
 });
 vm.runInContext(scripts,ctx,{timeout:4500});
 ctx.study1EConsentRegistry_=()=>({revision:0,records:[]});
 ctx.study1EConsentFolder_=()=>folder;
 ctx.study1ParticipantGate_=()=>{if(props.get('OPEN')==='false')
  throw Error('PARTICIPANT_INTAKE_NOT_READY');return true;};
 ctx.study1ParticipantRecPolicy_=()=>({screeningVersion:'E1_TEST_V1',documentSha256:'a'.repeat(64)});
 ctx.study1ParticipantVerifiedPolicy_=v=>v;
 ctx.study1SelfReportedAuthority_=(r,lock)=>{
  assert.equal(lock.hasLock(),true,'exact acquired Lock object required');
  if(r.experiment!=='E1')throw Error('EXPERIMENT_NOT_OPEN');
  const stored=personRecords.get(r.applicantId);
  if(!stored||stored.screeningId!==r.screeningId||
     stored.challengeId!==r.challengeId)throw Error('SELF_REPORT_EMAIL_OTP_EVIDENCE_INVALID');
  return {...stored};
 };
 ctx.study1EConsentReadyDocument_=(experiment)=>{
  if(experiment!=='E1')throw Error('EXPERIMENT_NOT_OPEN');
  return {experiment:'E1',version:'REC_V02',sha256:'a'.repeat(64)};
 };
 ctx.study1ParticipantEmailProofRequest_=proof=>{
  if(!proof||proof.experiment!=='E1'||proof.expiresAtUtc<=new Date(clock.now).toISOString())
   throw Error('EMAIL_PROOF_EXPIRED');
  return proof;
 };
 const entries=tables.Slots.rows.map(row=>({
  experiment:row[0]===S3?'E2':'E1',slotId:row[0],
  slotRowSha256:ctx.study1BindingHmac_(['STUDY1_E1_ORIGINAL_SLOT_ROW_V1',...row])
 }));
 const raw=JSON.stringify(entries);
 props.set('STUDY1_E1_SLOT_REGISTRY_V1',raw);
 props.set('STUDY1_E1_SLOT_REGISTRY_HMAC',ctx.study1BindingHmac_(['STUDY1_E1_SLOT_REGISTRY_V1',raw]));
 function proof(id){
  return {version:1,applicantId:id.applicantId,screeningId:id.screeningId,
   challengeId:id.challengeId,experiment:'E1',emailHash:ctx.study1BindingHmac_([
    'MAIL_HASH_V1',id.email]),usedAtUtc:id.verifiedAtUtc,
   expiresAtUtc:ts(clock.now,1800000),signature:'c'.repeat(64)};
 }
 function holdSlot(p,slotId,requestId='REQ_HOLD_1234567890'){
  const q=ctx.study1FormalQuoteHold({emailProof:p,slotId,requestId});
  if(!q.allowed)return q;
  return ctx.study1FormalHoldSlot({emailProof:p,quote:q.quote});
 }
 return {ctx,tables,props,person,proof,holdSlot,S1,S2,S3,clock,
  mutations,locks,evidenceFiles,folder,get held(){return held},
  set evidenceCreateHook(fn){evidenceCreateHook=fn;},
  set intercept(x){intercept=x},
  set propertyHook(x){propertyHook=x},
  set failAppend(x){failAppend=x}};
}
test('V05 verified E1 registry returns only true E1 slots and exact seat counts',()=>{
 const h=harness(),p=h.proof(h.person('A'));
 const r=h.ctx.study1FormalV05Slots(p);
 assert.equal(r.experiment,'E1');
 assert.deepEqual(Array.from(r.slots,x=>x.slotId),[h.S1,h.S2]);
 assert.ok(r.slots.every(x=>x.capacity===1&&x.remaining===1&&x.bookable===true));
 assert.equal(h.tables.Reservations.rows.length,0);
});
test('V05 original booking quote + HMAC emits exactly one HELD row and safe replay',()=>{
 const h=harness(),p=h.proof(h.person('A'));
 const q=h.ctx.study1FormalQuoteHold({emailProof:p,slotId:h.S1,
  requestId:'REQ_HOLD_1234567890'});
 assert.equal(q.allowed,true);
 assert.match(q.quote.signature,/^[a-f0-9]{64}$/);
 assert.throws(()=>h.ctx.study1FormalHoldSlot({emailProof:p,quote:{
  ...q.quote,slotId:h.S2}}),/V05_QUOTE_HMAC_INVALID/);
 const result=h.ctx.study1FormalHoldSlot({emailProof:p,quote:q.quote});
 assert.equal(result.held,true);
 assert.equal(h.tables.Reservations.rows.length,1);
 assert.equal(h.tables.Reservations.rows[0][3],'HELD');
 const again=h.ctx.study1FormalHoldSlot({emailProof:p,quote:q.quote});
 assert.equal(again.reason,'REPLAY');
 assert.equal(h.tables.Reservations.rows.length,1);
 assert.equal(h.ctx.study1FormalV05Slots(p).slots[0].remaining,0);
});
test('V08 original WAITLISTED is not occupied and FIFO gets released seat',()=>{
 const h=harness(),a=h.proof(h.person('A')),b=h.proof(h.person('B')),
  c=h.proof(h.person('C'));
 const held=h.holdSlot(a,h.S1);
 assert.equal(held.held,true);
 const first=h.ctx.study1FormalWaitlistJoin({emailProof:b,slotId:h.S1,
  requestId:'REQ_WAIT_B_1234567890'});
 assert.equal(first.joined,true);assert.equal(first.position,1);
 const second=h.ctx.study1FormalWaitlistJoin({emailProof:c,slotId:h.S1,
  requestId:'REQ_WAIT_C_1234567890'});
 assert.equal(second.position,2);
 assert.equal(h.tables.Reservations.rows.filter(r=>r[3]==='WAITLISTED').length,2);
 assert.equal(h.ctx.study1FormalV05Slots(b).slots[0].remaining,0);
 const canceled=h.ctx.study1FormalCancel({emailProof:a,
  reservationId:held.reservationId,requestId:'REQ_CANCEL_A_1234567890'});
 assert.equal(canceled.cancelled,true);
 const slots=h.ctx.study1FormalV05Slots(b).slots;
 assert.equal(slots[0].remaining,1);
 assert.equal(slots[0].bookable,false,'direct holds cannot bypass queued participant');
 assert.equal(h.ctx.study1FormalWaitlistClaim({emailProof:c,
  reservationId:second.reservationId,requestId:'REQ_CLAIM_C_1234567890'}).reason,
  'WAITLIST_FIFO');
 const claim=h.ctx.study1FormalWaitlistClaim({emailProof:b,
  reservationId:first.reservationId,requestId:'REQ_CLAIM_B_1234567890'});
 assert.equal(claim.held,true);assert.equal(claim.reason,'CLAIMED');
 assert.equal(h.tables.Reservations.rows.find(r=>r[0]===first.reservationId)[3],'HELD');
 assert.equal(h.tables.Reservations.rows.length,3,'claim reuses same reservation row');
 assert.equal(h.ctx.study1FormalV05Slots(b).slots[0].remaining,0);
});
test('V08 move persists old CANCELLED row + new HELD row, preserves expiry and replay',()=>{
 const h=harness(),a=h.proof(h.person('A'));
 const original=h.holdSlot(a,h.S1),before=h.tables.Reservations.rows[0].slice();
 const input={emailProof:a,reservationId:original.reservationId,
  newSlotId:h.S2,requestId:'REQ_MOVE_A_1234567890'};
 const moved=h.ctx.study1FormalMove(input);
 assert.equal(moved.moved,true);assert.equal(moved.slotId,h.S2);
 assert.equal(h.tables.Reservations.rows.length,2);
 assert.equal(h.tables.Reservations.rows[0][3],'CANCELLED');
 assert.equal(h.tables.Reservations.rows[1][3],'HELD');
 assert.equal(h.tables.Reservations.rows[1][4],before[4]);
 assert.equal(h.ctx.study1FormalMove(input).reason,'REPLAY');
 assert.equal(h.tables.Reservations.rows.length,2);
 const cancel=h.ctx.study1FormalCancel({emailProof:a,
  reservationId:moved.reservationId,requestId:'REQ_CANCEL_A_9876543210'});
 assert.equal(cancel.status,'CANCELLED');
 assert.equal(h.tables.Reservations.rows[1][8],h.tables.Reservations.rows[1][9]);
 assert.equal(h.ctx.study1FormalCancel({emailProof:a,
  reservationId:moved.reservationId,requestId:'REQ_CANCEL_A_9876543210'}).reason,
  'ALREADY_CANCELLED');
});
test('Wrong experiment mapping and E2 cannot be booked or joined',()=>{
 const h=harness(),a=h.proof(h.person('A'));
 assert.throws(()=>h.ctx.study1FormalQuoteHold({emailProof:a,
  slotId:h.S3,requestId:'REQ_HOLD_E2_1234567890'}),/SLOT_EXPERIMENT_MISMATCH/);
 assert.throws(()=>h.ctx.study1FormalWaitlistJoin({emailProof:a,
  slotId:h.S3,requestId:'REQ_WAIT_E2_1234567890'}),/SLOT_EXPERIMENT_MISMATCH/);
 a.experiment='E2';
 assert.throws(()=>h.ctx.study1FormalV05Slots(a),/EMAIL_PROOF_EXPIRED/);
 assert.equal(h.tables.Reservations.rows.length,0);
});
test('Closed gates, wrong applicant, stale slot HMAC, and revoked FIFO block mutations',()=>{
 const h=harness(),a=h.proof(h.person('A')),b=h.proof(h.person('B'));
 const booked=h.holdSlot(a,h.S1);
 assert.throws(()=>h.ctx.study1FormalCancel({emailProof:b,
  reservationId:booked.reservationId,requestId:'REQ_CANCEL_B_1234567890'}),
  /V08_RESERVATION_NOT_OWNED/);
 h.props.set('STUDY1_E1_SLOT_REGISTRY_HMAC','0'.repeat(64));
 assert.throws(()=>h.ctx.study1FormalV05Slots(a),/SLOT_REGISTRY_TAMPERED/);
 h.props.set('STUDY1_E1_SLOT_REGISTRY_APPROVED','false');
 assert.throws(()=>h.ctx.study1FormalQuoteHold({emailProof:a,
  slotId:h.S2,requestId:'REQ_HOLD_A_9999999999'}),/SLOT_EXPERIMENT_SOURCE_NOT_CONFIGURED/);
 h.props.set('OPEN','false');
 assert.throws(()=>h.ctx.study1FormalStatus(a),/PARTICIPANT_INTAKE_NOT_READY/);
 assert.equal(h.tables.Reservations.rows.length,1);
});
test('V08 rejects concurrent mutation of same ScriptLock and never makes second row',()=>{
 const h=harness(),a=h.proof(h.person('A'));
 const original=h.holdSlot(a,h.S1);
 h.intercept=()=>assert.throws(()=>h.ctx.study1FormalCancel({
  emailProof:a,reservationId:original.reservationId,
  requestId:'REQ_CONCURRENT_CANCEL_12'}),/FORMAL_BOOKING_LOCK_BUSY/);
 const moved=h.ctx.study1FormalMove({emailProof:a,
  reservationId:original.reservationId,newSlotId:h.S2,
  requestId:'REQ_MOVE_CONCURRENT_123456'});
 assert.equal(moved.moved,true);
 assert.equal(h.tables.Reservations.rows.length,2);
});
test('V08 partial move failure never claims success, never retries destructive step',()=>{
 const h=harness(),a=h.proof(h.person('A')),held=h.holdSlot(a,h.S1);
 h.failAppend=true;
 assert.throws(()=>h.ctx.study1FormalMove({emailProof:a,
  reservationId:held.reservationId,newSlotId:h.S2,
  requestId:'REQ_MOVE_PARTIAL_123456789'}),/V08_MUTATION_PARTIAL_REQUIRES_REVIEW/);
 assert.equal(h.tables.Reservations.rows[0][3],'CANCELLED');
 assert.equal(h.tables.Reservations.rows.length,1);
});


/**
 * Synthetic original researcher-PRESIGNED full PDF plus the participant's
 * one final electronic signature has already committed to the private registry.
 * The consent state NEVER grants a seat by itself; the original Reservations
 * CAS is a separately verified transaction.
 */
function signedConsentFixture(h,person,held){
 const consentId='CONSENT_E1_ONLINE_12345678',docId='REC_SYNTH_DOC_12345678';
 const row=h.tables.Reservations.rows.find(r=>r[0]===held.reservationId);
 const binding={
  schemaVersion:1,applicantId:person.applicantId,reservationId:row[0],
  slotId:row[2],challengeId:person.challengeId,screeningId:person.screeningId,
  experiment:'E1',documentSha:'a'.repeat(64),documentVersion:'REC_V02',
  identityEvidenceSha:person.evidenceSha256,
  eligibilityEvidenceSha:person.eligibilityEvidenceSha256,
  priorE1EvidenceSha:'',verifiedAtUtc:person.verifiedAtUtc,
  otpUsedAtUtc:person.verifiedAtUtc,holdUntilUtc:row[4],digest:''
 };
 binding.digest=h.ctx.study1BindingDigest_(binding);
 const pdf={id:'E1_PRESIGNED_AND_PARTICIPANT_123456',sha:'e'.repeat(64)};
 const x={id:consentId,state:'CONFIRMED',channel:'FORMAL_E1',
  experiment:'E1',researcherPresigned:true,tokenHash:'a'.repeat(64),
  documentSha:'a'.repeat(64),documentVersion:'REC_V02',
  binding,signature:{id:'SIGNATURE_123456789',sha:'b'.repeat(64)},
  confirmation:{id:'CONFIRM_123456789',sha:'c'.repeat(64)},
  participantSignedPdf:pdf,signedPdf:pdf
 };
 let owner=true, pdfChecks=0,bindingChecks=0;
 h.ctx.study1AdminOwnerRequired_=()=>{if(!owner)throw Error('OWNER_REQUIRED')};
 h.ctx.study1FormalConsentGate_=()=>true;
 h.ctx.study1FormalConsentRecScope_=()=>({
  consentDocumentId:docId,consentDocumentSha256:'a'.repeat(64)});
 h.ctx.study1EConsentReadyDocument_=exp=>{
  if(exp!=='E1')throw Error('EXPERIMENT_NOT_OPEN');
  return {id:docId,experiment:'E1',version:'REC_V02',
   researcherPresigned:true,sha256:'a'.repeat(64)};
 };
 const registry={schemaVersion:1,revision:7,records:[x]};
 h.ctx.study1EConsentRegistry_=()=>registry;
 h.ctx.study1EConsentEvent_=(ref,entry,kind)=>{
  assert.equal(entry,x);
  if(kind==='SIGNATURE')return {data:{signedPdfSha256:x.participantSignedPdf.sha}};
  if(kind==='CONFIRMATION')return {data:{
   mode:'RESEARCHER_PRESIGNED_SOURCE',
   researcherSignedSourceSha256:x.documentSha,
   signatureHash:x.signature.sha,
   participantSignedPdfSha256:x.participantSignedPdf.sha,
   researcherSignedPdfSha256:'e'.repeat(64)}};
  throw Error('UNEXPECTED_PDF_EVENT');
 };
 h.ctx.study1EConsentSignedPdfRead_=(ref,entry)=>{
  assert.equal(entry,x);assert.ok(ref===x.signedPdf||ref===x.participantSignedPdf);
  pdfChecks++;return [];
 };
 h.ctx.study1EConsentBindingAdapter_=(audience)=>{
  assert.equal(audience,'PUBLIC_E1');return {readTrustedSnapshot:()=>({})};
 };
 h.ctx.study1BindingRecheck_=(b,doc,adapter,utc,lock)=>{
  assert.equal(lock.hasLock(),true);assert.equal(b,binding);
  assert.equal(doc.sha256,'a'.repeat(64));assert.ok(adapter);
  assert.equal(typeof utc,'string');bindingChecks++;return b;
 };
 return {x,consentId,registry,setOwner:v=>{owner=v;},
  get pdfChecks(){return pdfChecks},get bindingChecks(){return bindingChecks}};
}
test('§70-S.23 original reservation finalization requires valid online dual-PDF and OWNER',()=>{
 const h=harness(),person=h.person('A'),proof=h.proof(person),
  held=h.holdSlot(proof,h.S1),c=signedConsentFixture(h,person,held);
 assert.equal(h.tables.Reservations.rows[0][3],'HELD');
 c.setOwner(false);
 assert.throws(()=>h.ctx.study1FormalFinalizeSignedE1Booking_(c.consentId),
  /OWNER_REQUIRED/);
 assert.equal(h.tables.Reservations.rows[0][3],'HELD');
 c.setOwner(true);
 c.x.state='SIGNED';
 assert.throws(()=>h.ctx.study1FormalFinalizeSignedE1Booking_(c.consentId),
  /FORMAL_BOOKING_DUAL_PDF_NOT_CONFIRMED/);
 c.x.state='CONFIRMED';
 c.x.signedPdf.sha='0'.repeat(64);
 assert.throws(()=>h.ctx.study1FormalFinalizeSignedE1Booking_(c.consentId),
  /FORMAL_BOOKING_DUAL_PDF_HASH_MISMATCH|FORMAL_BOOKING_DUAL_PDF_NOT_CONFIRMED/);
 assert.equal(h.tables.Reservations.rows[0][3],'HELD');
});
test('§70-S.23 OWNER confirmed dual-PDF transitions only original HELD to CONFIRMED once',()=>{
 const h=harness(),person=h.person('A'),proof=h.proof(person),
  held=h.holdSlot(proof,h.S1),c=signedConsentFixture(h,person,held);
 const before=h.mutations.filter(x=>x.name==='Reservations'&&x.method==='set').length;
 const done=h.ctx.study1FormalFinalizeSignedE1Booking_(c.consentId);
 assert.equal(done.bookingConfirmed,true);assert.equal(done.bookingStatus,'CONFIRMED');
 assert.equal(done.reason,'CONFIRMED_AFTER_DUAL_PDF');
 const row=h.tables.Reservations.rows[0];
 assert.equal(row[3],'CONFIRMED');assert.equal(row[7],row[9]);
 // A signed PDF alone was insufficient: the independently confirmed
 // ORIGINAL Reservations row must be visible through the read-only recovery.
 const writesAfterConfirmation=h.mutations.length;
 const recovered=h.ctx.study1FormalHoldOutcome({emailProof:proof,slotId:h.S1,
  requestId:'REQ_HOLD_1234567890'});
 assert.equal(recovered.status,'CONFIRMED');
 assert.equal(recovered.reservationId,held.reservationId);
 assert.equal(h.ctx.study1FormalStatus(proof).reservations[0].status,'CONFIRMED');
 assert.equal(h.mutations.length,writesAfterConfirmation,'read-only recovery cannot mutate confirmation');
 assert.ok(c.pdfChecks>=2);assert.equal(c.bindingChecks,1);
 assert.equal(h.mutations.filter(x=>x.name==='Reservations'&&x.method==='set').length,before+1);
 const replay=h.ctx.study1FormalFinalizeSignedE1Booking_(c.consentId);
 assert.equal(replay.bookingConfirmed,true);assert.equal(replay.readOnlyReplay,true);
 assert.equal(h.mutations.filter(x=>x.name==='Reservations'&&x.method==='set').length,before+1);
});
test('§70-S.23 no online signature can resurrect an expired HELD or stale original slot',()=>{
 const h=harness(),person=h.person('A'),proof=h.proof(person),
  held=h.holdSlot(proof,h.S1),c=signedConsentFixture(h,person,held);
 h.tables.Slots.rows[0][3]=2;
 assert.throws(()=>h.ctx.study1FormalFinalizeSignedE1Booking_(c.consentId),
  /SLOT_REGISTRY|SLOT.*HMAC|SLOT.*TAMPER|SLOT.*CHANGED/);
 assert.equal(h.tables.Reservations.rows[0][3],'HELD');
 h.tables.Slots.rows[0][3]=1;
 h.clock.now+=11*60000;
 assert.throws(()=>h.ctx.study1FormalFinalizeSignedE1Booking_(c.consentId),
  /FORMAL_BOOKING_HELD_EXPIRED_OR_CHANGED/);
 assert.equal(h.tables.Reservations.rows[0][3],'HELD');
});

test('E1 read-only HELD expiry is derived without rewriting original Reservations',()=>{
 const h=harness(),a=h.proof(h.person('A')),b=h.proof(h.person('B'));
 const hold=h.holdSlot(a,h.S1,'REQ_HOLD_EXPIRY_123456789');
 const original=h.tables.Reservations.rows[0].slice(),writes=h.mutations.length;
 assert.equal(h.ctx.study1FormalStatus(a).reservations[0].status,'HELD');
 assert.equal(h.ctx.study1FormalV05Slots(b).slots[0].remaining,0);
 h.clock.now+=11*60000;
 const result=h.ctx.study1FormalStatus(a);
 assert.equal(result.reservations[0].status,'EXPIRED');
 assert.equal(result.reservations[0].reservationId,hold.reservationId);
 assert.deepEqual(h.tables.Reservations.rows[0],original);
 assert.equal(h.mutations.length,writes);
 assert.equal(h.ctx.study1FormalV05Slots(b).slots[0].remaining,1);
});
test('E1 original hold outcome is read-only, exact-key and bound to applicant and slot',()=>{
 const h=harness(),a=h.proof(h.person('A')),b=h.proof(h.person('B')),key='REQ_HOLD_CAUSAL_123456789';
 const absent=h.ctx.study1FormalHoldOutcome({emailProof:a,slotId:h.S1,requestId:key});
 assert.equal(absent.resolved,false);assert.equal(absent.status,'UNKNOWN');
 const hold=h.holdSlot(a,h.S1,key),writes=h.mutations.length;
 const r=h.ctx.study1FormalHoldOutcome({emailProof:a,slotId:h.S1,requestId:key});
 assert.equal(r.status,'HELD');assert.equal(r.reservationId,hold.reservationId);
 // Original WZ_ HMAC includes applicant and slot. Other identities/slots
 // derive a DIFFERENT key, yielding UNKNOWN without leaking a reservation ID.
 const other=h.ctx.study1FormalHoldOutcome({emailProof:b,slotId:h.S1,requestId:key});
 const wrongSlot=h.ctx.study1FormalHoldOutcome({emailProof:a,slotId:h.S2,requestId:key});
 for(const x of [other,wrongSlot]){
  assert.equal(x.resolved,false);assert.equal(x.status,'UNKNOWN');
  assert.equal(x.reservationId,undefined);
 }
 assert.equal(h.tables.Reservations.rows.length,1);assert.equal(h.mutations.length,writes);
 // A corrupted row whose signed HMAC key no longer agrees with its owner
 // MUST fail closed rather than exposing the original reservation.
 const original=h.tables.Reservations.rows[0][1];
 h.tables.Reservations.rows[0][1]=b.applicantId;
 assert.throws(()=>h.ctx.study1FormalHoldOutcome({emailProof:a,slotId:h.S1,requestId:key}),
  /BINDING_MISMATCH/);
 h.tables.Reservations.rows[0][1]=original;
 assert.equal(h.mutations.length,writes);
 h.clock.now+=11*60000;
 assert.equal(h.ctx.study1FormalHoldOutcome({emailProof:a,slotId:h.S1,requestId:key}).status,'EXPIRED');
});
test('E1 no seat remains: original quote refuses without writing another reservation',()=>{
 const h=harness(),a=h.proof(h.person('A')),b=h.proof(h.person('B'));
 h.holdSlot(a,h.S1,'REQ_HOLD_FIRST_123456789');
 const writes=h.mutations.length;
 const q=h.ctx.study1FormalQuoteHold({emailProof:b,slotId:h.S1,requestId:'REQ_HOLD_SECOND_123456789'});
 assert.equal(q.allowed,false);assert.equal(q.reason,'FULL_OR_WAITLIST');
 assert.equal(h.ctx.study1FormalV05Slots(b).slots[0].remaining,0);
 assert.equal(h.tables.Reservations.rows.length,1);assert.equal(h.mutations.length,writes);
});

test('E1 original hold idempotency lookup does not confuse raw requestId with WZ_ HMAC',()=>{
 const h=harness(),a=h.proof(h.person('A')),key='REQ_KEY_HMAC_CAUSAL_12345678';
 const first=h.holdSlot(a,h.S1,key),row=h.tables.Reservations.rows[0].slice();
 assert.ok(row[5].startsWith('WZ_'));
 assert.notEqual(row[5],key);
 const writes=h.mutations.length;
 const outcome=h.ctx.study1FormalHoldOutcome({emailProof:a,slotId:h.S1,requestId:key});
 assert.equal(outcome.resolved,true);assert.equal(outcome.status,'HELD');
 assert.equal(outcome.reservationId,first.reservationId);
 assert.equal(h.mutations.length,writes);
});

test('ambiguous HOLD readback uses the original signed quote even after PDF publication changes',()=>{
 const h=harness(),p=h.proof(h.person('A')),key='REQ_QUOTE_CAUSAL_1234567890';
 const issued=h.ctx.study1FormalQuoteHold({emailProof:p,slotId:h.S1,requestId:key});
 assert.equal(issued.allowed,true);
 const held=h.ctx.study1FormalHoldSlot({emailProof:p,quote:issued.quote});
 const mutationCount=h.mutations.length;
 const historicalQuote=issued.quote;
 // A publication can change after original HOLD has already committed.
 h.ctx.study1EConsentReadyDocument_=()=>({experiment:'E1',version:'REC_NEW_V03',sha256:'f'.repeat(64)});
 const oldLookup=h.ctx.study1FormalHoldOutcome({emailProof:p,slotId:h.S1,requestId:key});
 assert.equal(oldLookup.resolved,false,'current PDF cannot resolve the old WZ HMAC');
 const recovered=h.ctx.study1FormalHoldOutcome({emailProof:p,slotId:h.S1,
  requestId:key,quote:historicalQuote});
 assert.equal(recovered.resolved,true);
 assert.equal(recovered.status,'HELD');
 assert.equal(recovered.reservationId,held.reservationId);
 assert.equal(h.mutations.length,mutationCount);
 // The quote expiration is for the original WRITE only; the signed GET
 // can still identify an already committed and unexpired original hold.
 h.clock.now+=3*60000;
 assert.equal(h.ctx.study1FormalHoldOutcome({emailProof:p,slotId:h.S1,
  requestId:key,quote:historicalQuote}).status,'HELD');
 assert.equal(h.mutations.length,mutationCount);
});
test('signed HOLD readback refuses tampered quote, other requester and false status',()=>{
 const h=harness(),a=h.proof(h.person('A')),b=h.proof(h.person('B'));
 const requestId='REQ_SIGNED_READ_ONLY_123456';
 const signed=h.ctx.study1FormalQuoteHold({emailProof:a,slotId:h.S1,requestId}).quote;
 const count=h.mutations.length,read=q=>h.ctx.study1FormalHoldOutcome({
  emailProof:a,slotId:h.S1,requestId,quote:q});
 assert.equal(read(signed).status,'UNKNOWN');
 assert.throws(()=>read({...signed,documentSha:'b'.repeat(64)}),/QUOTE_HMAC_INVALID/);
 assert.throws(()=>read({...signed,slotId:h.S2}),/QUOTE_INVALID/);
 assert.throws(()=>read({...signed,requestId:'REQ_DIFFERENT_KEY_12345678'}),/QUOTE_INVALID/);
 assert.throws(()=>h.ctx.study1FormalHoldOutcome({emailProof:b,
  slotId:h.S1,requestId,quote:signed}),/QUOTE_INVALID/);
 assert.equal(h.mutations.length,count);
});

test('OWNER signed-PDF preflight is read-only and only offers current original HELD to manual operator',()=>{
 const h=harness(),person=h.person('A'),proof=h.proof(person),
  held=h.holdSlot(proof,h.S1),c=signedConsentFixture(h,person,held);
 const before=h.mutations.length;
 const result=h.ctx.study1OwnerE1SignedBookingPreflight(c.consentId);
 assert.equal(result.readOnly,true);assert.equal(result.bookingConfirmed,false);
 assert.equal(result.bookingStatus,'HELD');assert.equal(result.disposition,'REPAIRABLE_HELD');
 assert.equal(result.consentRevision,c.registry.revision);
 assert.equal(result.reservationId,held.reservationId);
 assert.match(result.receipt,/^[a-f0-9]{64}$/);
 assert.equal(result.consentId,c.consentId);
 assert.equal(h.tables.Reservations.rows[0][3],'HELD');
 assert.equal(h.mutations.length,before);
 assert.ok(c.pdfChecks>=2);assert.equal(c.bindingChecks,1);
 assert.equal(JSON.stringify(result).includes(person.email),false);
});
test('explicit OWNER repair takes exact fresh preflight then confirms original Reservations ONCE; never sends notice',()=>{
 const h=harness(),person=h.person('A'),proof=h.proof(person),
  held=h.holdSlot(proof,h.S1),c=signedConsentFixture(h,person,held);
 const candidate=h.ctx.study1OwnerE1SignedBookingPreflight(c.consentId);
 const req={consentId:c.consentId,consentRevision:candidate.consentRevision,receipt:candidate.receipt};
 const before=h.mutations.filter(x=>x.name==='Reservations'&&x.method==='set').length;
 const confirmed=h.ctx.study1OwnerE1SignedBookingRepair(req);
 assert.equal(confirmed.bookingConfirmed,true);assert.equal(confirmed.bookingStatus,'CONFIRMED');
 assert.equal(confirmed.reservationId,held.reservationId);
 assert.equal(confirmed.notification,'NOT_SENT_BY_RECONCILIATION');
 assert.equal(confirmed.readOnlyReplay,false);
 assert.equal(h.mutations.filter(x=>x.name==='Reservations'&&x.method==='set').length,before+1);
 const after=h.mutations.length;
 const checked=h.ctx.study1OwnerE1SignedBookingPreflight(c.consentId);
 assert.equal(checked.disposition,'ALREADY_CONFIRMED');
 assert.equal(checked.readOnly,true);
 const replay=h.ctx.study1OwnerE1SignedBookingRepair(req);
 assert.equal(replay.readOnlyReplay,true);
 assert.equal(h.mutations.length,after);
});
test('stale preflight consent revision, HMAC, slot/hold row change and forged owner receipt cannot mutate',()=>{
 const bads=[
  (h,c,req)=>{req.receipt='0'.repeat(64);},
  (h,c,req)=>{req.consentRevision++;},
  (h,c,req)=>{c.registry.revision++;},
  (h,c,req)=>{h.tables.Reservations.rows[0][5]='STOLEN_OR_MUTATED_IDEMPOTENCY_KEY';},
  (h,c,req)=>{h.tables.Slots.rows[0][3]=2;}
 ];
 for(const alter of bads){
  const h=harness(),person=h.person('A'),proof=h.proof(person),
   held=h.holdSlot(proof,h.S1),c=signedConsentFixture(h,person,held);
  const p=h.ctx.study1OwnerE1SignedBookingPreflight(c.consentId);
  const req={consentId:c.consentId,consentRevision:p.consentRevision,receipt:p.receipt};
  const writes=h.mutations.length;alter(h,c,req);
  assert.throws(()=>h.ctx.study1OwnerE1SignedBookingRepair(req),
   /PREFLIGHT_STALE|SLOT_REGISTRY|SLOT.*HMAC|SLOT.*TAMPER|SLOT.*CHANGED|RESERVATION|IDEMPOTENCY|KEY/);
  assert.equal(h.tables.Reservations.rows[0][3],'HELD');
  assert.equal(h.mutations.length,writes);
 }
});
test('preflight expired/cancelled HELD returns review-only, never issues a receipt or writes',()=>{
 for(const kind of ['EXPIRED','CANCELLED']){
  const h=harness(),person=h.person('A'),proof=h.proof(person),
   held=h.holdSlot(proof,h.S1),c=signedConsentFixture(h,person,held);
  if(kind==='EXPIRED')h.clock.now+=11*60000;
  else{
   const row=h.tables.Reservations.rows[0];
   row[3]='CANCELLED';row[8]=new Date(h.clock.now).toISOString();
   row[9]=row[8];
  }
  const before=h.mutations.length;
  const p=h.ctx.study1OwnerE1SignedBookingPreflight(c.consentId);
  assert.equal(p.disposition,'MANUAL_REVIEW_ONLY');
  assert.equal(p.bookingStatus,kind);
  assert.equal(p.bookingConfirmed,false);
  assert.equal(p.receipt,undefined);
  assert.equal(h.mutations.length,before);
  assert.throws(()=>h.ctx.study1OwnerE1SignedBookingRepair({
   consentId:c.consentId,consentRevision:p.consentRevision,receipt:'a'.repeat(64)}),
   /HELD_EXPIRED_OR_CHANGED/);
  assert.equal(h.mutations.length,before);
 }
});
test('public and non-OWNER repair RPCs deny before private registry or Reservations reads',()=>{
 const h=harness(),person=h.person('A'),proof=h.proof(person),
  held=h.holdSlot(proof,h.S1),c=signedConsentFixture(h,person,held);
 const before=h.mutations.length;
 c.setOwner(false);
 assert.throws(()=>h.ctx.study1OwnerE1SignedBookingPreflight(c.consentId),/OWNER_REQUIRED/);
 assert.throws(()=>h.ctx.study1OwnerE1SignedBookingRepair({
  consentId:c.consentId,consentRevision:7,receipt:'a'.repeat(64)}),/OWNER_REQUIRED/);
 c.setOwner(true);
 h.ctx.study1V2PublicRpcDeny_=()=>{throw Error('PUBLIC_RPC_DENIED');};
 assert.throws(()=>h.ctx.study1OwnerE1SignedBookingPreflight(c.consentId),/PUBLIC_RPC_DENIED/);
 assert.throws(()=>h.ctx.study1OwnerE1SignedBookingRepair({
  consentId:c.consentId,consentRevision:7,receipt:'a'.repeat(64)}),/PUBLIC_RPC_DENIED/);
 assert.equal(h.mutations.length,before);
});
test('non-presigned, inconsistent signed PDF or wrong slot stays blocked before any manual booking repair',()=>{
 for(const corrupt of ['researcherPresigned','signedPdf','slot']){
  const h=harness(),person=h.person('A'),proof=h.proof(person),
   held=h.holdSlot(proof,h.S1),c=signedConsentFixture(h,person,held);
  const count=h.mutations.length;
  if(corrupt==='researcherPresigned')c.x.researcherPresigned=false;
  if(corrupt==='signedPdf')c.x.signedPdf.sha='f'.repeat(64);
  if(corrupt==='slot')c.x.binding.slotId='SLOT_DIFFERENT_12345';
  assert.throws(()=>h.ctx.study1OwnerE1SignedBookingPreflight(c.consentId),
   /DUAL_PDF|HASH_MISMATCH|IDENTITY_SLOT_CHANGED|CONSENT_SOURCE_CHANGED/);
  assert.equal(h.mutations.length,count);
 }
});

test('a second FORMAL_E1 consent bound to the same reservation blocks preview and repair',()=>{
 const h=harness(),person=h.person('A'),proof=h.proof(person),
  held=h.holdSlot(proof,h.S1),c=signedConsentFixture(h,person,held);
 c.registry.records.push({...c.x,id:'OTHER_CONSENT_1234567890'});
 const before=h.mutations.length;
 assert.throws(()=>h.ctx.study1OwnerE1SignedBookingPreflight(c.consentId),
  /RESERVATION_CONSENT_NOT_UNIQUE/);
 assert.throws(()=>h.ctx.study1OwnerE1SignedBookingRepair({
  consentId:c.consentId,consentRevision:c.registry.revision,receipt:'a'.repeat(64)}),
  /RESERVATION_CONSENT_NOT_UNIQUE/);
 assert.equal(h.tables.Reservations.rows[0][3],'HELD');
 assert.equal(h.mutations.length,before);
});
test('lost CAS response after original Reservations CONFIRMED is resolved by read-only preflight without replaying original write',()=>{
 const h=harness(),person=h.person('A'),proof=h.proof(person),
  held=h.holdSlot(proof,h.S1),c=signedConsentFixture(h,person,held);
 const p=h.ctx.study1OwnerE1SignedBookingPreflight(c.consentId);
 const originalAfter=h.ctx.study1FormalAfterMutation_;
 h.ctx.study1FormalAfterMutation_=(...args)=>{
  originalAfter(...args);
  throw Error('SYNTHETIC_ORIGINAL_CONFIRMATION_RESPONSE_UNKNOWN');
 };
 const writesBefore=h.mutations.filter(x=>x.name==='Reservations'&&x.method==='set').length;
 assert.throws(()=>h.ctx.study1OwnerE1SignedBookingRepair({
  consentId:c.consentId,consentRevision:p.consentRevision,receipt:p.receipt}),
  /SYNTHETIC_ORIGINAL_CONFIRMATION_RESPONSE_UNKNOWN/);
 assert.equal(h.tables.Reservations.rows[0][3],'CONFIRMED');
 const after=h.mutations.length;
 const read=h.ctx.study1OwnerE1SignedBookingPreflight(c.consentId);
 assert.equal(read.disposition,'ALREADY_CONFIRMED');
 assert.equal(read.readOnly,true);
 assert.equal(read.bookingConfirmed,true);
 assert.equal(read.receipt,undefined);
 assert.equal(h.mutations.length,after);
 assert.equal(h.mutations.filter(x=>x.name==='Reservations'&&x.method==='set').length,
  writesBefore+1);
});

test('V08 read-only exact MOVE outcome resolves committed pair; partial cancellation never resolves or writes',()=>{
 for(const partial of [false,true]){
  const h=harness(),a=h.proof(h.person('A')),held=h.holdSlot(a,h.S1);
  const p={emailProof:a,reservationId:held.reservationId,newSlotId:h.S2,requestId:'REQ_MOVE_OUTCOME_12345678'};
  if(partial){h.failAppend=true;assert.throws(()=>h.ctx.study1FormalMove(p),/PARTIAL/);}
  else assert.equal(h.ctx.study1FormalMove(p).moved,true);
  const n=h.mutations.length, q={...p,action:'MOVE',slotId:h.S1};
  const r=h.ctx.study1FormalV08Outcome(q);
  assert.equal(r.resolved,!partial);
  if(partial)assert.equal(r.reason,'PARTIAL_OR_UNKNOWN');
  else assert.equal(r.evidence,'ORIGINAL_REQUEST_KEY');
  assert.equal(h.ctx.study1FormalV08Outcome({...q,requestId:'REQ_OTHER_MOVE_12345678'}).resolved,false);
  assert.equal(h.mutations.length,n);
 }
});
test('V08 JOIN exact key, CLAIM/CANCEL original row state only, and cross-applicant denial',()=>{
 const h=harness(),a=h.proof(h.person('A')),b=h.proof(h.person('B'));
 const held=h.holdSlot(a,h.S1),p={emailProof:b,slotId:h.S1,requestId:'REQ_JOIN_OUTCOME_12345678'};
 const joined=h.ctx.study1FormalWaitlistJoin(p);
 const q={...p,action:'JOIN',reservationId:'',newSlotId:''};
 assert.equal(h.ctx.study1FormalV08Outcome(q).evidence,'ORIGINAL_REQUEST_KEY');
 assert.equal(h.ctx.study1FormalV08Outcome({...q,emailProof:a}).resolved,false);
 h.ctx.study1FormalCancel({emailProof:a,reservationId:held.reservationId,requestId:'REQ_CANCEL_OUTCOME_12345678'});
 const claim={emailProof:b,reservationId:joined.reservationId,requestId:'REQ_CLAIM_OUTCOME_12345678'};
 h.ctx.study1FormalWaitlistClaim(claim);
 const n=h.mutations.length;
 const result=h.ctx.study1FormalV08Outcome({...claim,action:'CLAIM',slotId:h.S1,newSlotId:''});
 assert.equal(result.evidence,'ORIGINAL_ROW_STATE_ONLY');assert.equal(result.status,'HELD');
 const cancel={emailProof:a,reservationId:held.reservationId,requestId:'REQ_CANCEL_OUTCOME_12345678',action:'CANCEL',slotId:h.S1,newSlotId:''};
 assert.equal(h.ctx.study1FormalV08Outcome(cancel).status,'CANCELLED');
 assert.throws(()=>h.ctx.study1FormalV08Outcome({...cancel,emailProof:b}),/NOT_OWNED/);
 assert.equal(h.mutations.length,n);
});

test('new session cannot HOLD or mutate V08 after durable original consent issue, without a browser latch',()=>{
 const h=harness(),person=h.person('A'),a=h.proof(person),held=h.holdSlot(a,h.S1);
 h.ctx.study1EConsentRegistry_=()=>({revision:1,records:[{binding:{applicantId:person.applicantId},state:'ISSUED'}]});
 const p=h.proof(person),n=h.mutations.length;
 const req={emailProof:p,reservationId:held.reservationId,requestId:'REQ_FRESH_SESSION_12345678'};
 assert.throws(()=>h.ctx.study1FormalCancel(req),/EXISTING_CONSENT/);
 assert.throws(()=>h.ctx.study1FormalMove({...req,newSlotId:h.S2}),/EXISTING_CONSENT/);
 assert.throws(()=>h.ctx.study1FormalWaitlistClaim(req),/EXISTING_CONSENT/);
 assert.throws(()=>h.ctx.study1FormalWaitlistJoin({emailProof:p,slotId:h.S2,requestId:req.requestId}),/EXISTING_CONSENT/);
 const q=h.ctx.study1FormalQuoteHold({emailProof:p,slotId:h.S2,requestId:req.requestId});
 if(q.allowed)assert.throws(()=>h.ctx.study1FormalHoldSlot({emailProof:p,quote:q.quote}),/EXISTING_CONSENT/);
 assert.equal(h.mutations.length,n);
 assert.equal(h.ctx.study1FormalStatus(p).reservations[0].status,'HELD');
});
test('OWNER lost-browser reference reads original cancellation/consent without a bearer or writing',()=>{
 const h=harness(),person=h.person('A'),p=h.proof(person),held=h.holdSlot(p,h.S1);
 h.failAppend=true;
 assert.throws(()=>h.ctx.study1FormalMove({emailProof:p,reservationId:held.reservationId,newSlotId:h.S2,requestId:'REQ_LOST_BROWSER_MOVE_12345678'}),/PARTIAL/);
 h.ctx.study1EConsentRegistry_=()=>({revision:0,records:[]});
 h.ctx.study1AdminOwnerRequired_=()=>{throw Error('OWNER_REQUIRED');};
 const n=h.mutations.length;
 assert.throws(()=>h.ctx.study1OwnerE1RecoveryAudit(person.applicantId),/OWNER_REQUIRED/);
 h.ctx.study1AdminOwnerRequired_=()=>true;
 const r=h.ctx.study1OwnerE1RecoveryAudit(person.applicantId);
 assert.equal(r.reservations.length,1);assert.equal(r.reservations[0].status,'CANCELLED');
 assert.equal(r.actionAuthority,'NONE');assert.equal(r.evidence,'CURRENT_ORIGINAL_SOURCES_ONLY');
 assert.equal(r.disposition,'OWNER_REVIEW_REQUIRED');assert.doesNotMatch(JSON.stringify(r),/tokenHash|emailProof|signature|idempotency_key/);
 assert.equal(h.mutations.length,n);
 const empty=h.ctx.study1OwnerE1RecoveryAudit('APP_MISSING_CASE_12345678');
 assert.equal(empty.reservations.length,0);assert.equal(empty.disposition,'OWNER_REVIEW_REQUIRED');
});
test('OWNER lost-browser lookup cannot cross experiment or expose a signed bearer',()=>{
 const h=harness(),person=h.person('A'),p=h.proof(person),held=h.holdSlot(p,h.S1);
 h.ctx.study1AdminOwnerRequired_=()=>true;
 h.ctx.study1EConsentRegistry_=()=>({revision:7,records:[{id:'CONSENT_SYNTH_12345678',channel:'FORMAL_E1',experiment:'E1',state:'CONFIRMED',tokenHash:'PRIVATE_HASH',binding:{applicantId:person.applicantId,reservationId:held.reservationId,experiment:'E1'}}]});
 const r=h.ctx.study1OwnerE1RecoveryAudit(person.applicantId);
 assert.equal(r.consents[0].state,'CONFIRMED');assert.equal(r.reservations[0].status,'HELD');
 assert.ok(!JSON.stringify(r).includes('PRIVATE_HASH'));
 h.ctx.study1V2PublicRpcDeny_=()=>{throw Error('PUBLIC_READ_ONLY');};
 assert.throws(()=>h.ctx.study1OwnerE1RecoveryAudit(person.applicantId),/PUBLIC_READ_ONLY/);
});

test('durable HOLD and V08 exact transaction evidence remains discoverable without original browser nonce',()=>{
 const h=harness();h.props.set('STUDY1_E1_TXN_EVIDENCE_APPROVED','true');
 const a=h.person('A'),p=h.proof(a),held=h.holdSlot(p,h.S1);
 const moved=h.ctx.study1FormalMove({emailProof:p,reservationId:held.reservationId,newSlotId:h.S2,requestId:'REQ_MOVE_DURABLE_12345678'});
 h.ctx.study1FormalCancel({emailProof:p,reservationId:moved.reservationId,requestId:'REQ_CANCEL_DURABLE_12345678'});
 h.ctx.study1AdminOwnerRequired_=()=>true;
 const r=h.ctx.study1OwnerE1RecoveryAudit(a.applicantId);
 assert.equal(r.transactionEvidence.events.length,3);
 assert.deepEqual(Array.from(r.transactionEvidence.events,x=>x.action),['HOLD','MOVE','CANCEL']);
 assert.ok(r.transactionEvidence.events.every(x=>x.status==='COMMITTED_EVIDENCE'));
 assert.equal(h.evidenceFiles.length,6);
 assert.doesNotMatch(h.evidenceFiles.map(x=>x.raw).join(''),/synthetic\.|emailProof|REQ_MOVE_DURABLE|tokenHash/);
});
test('durable partial MOVE is visible across sessions; new HOLD blocked and original state never auto-repaired',()=>{
 const h=harness();h.props.set('STUDY1_E1_TXN_EVIDENCE_APPROVED','true');
 const a=h.person('A'),p=h.proof(a),held=h.holdSlot(p,h.S1);
 h.failAppend=true;
 assert.throws(()=>h.ctx.study1FormalMove({emailProof:p,reservationId:held.reservationId,newSlotId:h.S2,requestId:'REQ_MOVE_PARTIAL_12345678'}),/PARTIAL/);
 const n=h.mutations.length,files=h.evidenceFiles.length;
 assert.throws(()=>h.holdSlot(h.proof(a),h.S2,'REQ_FRESH_AFTER_PARTIAL_12345678'),/E1_TXN_UNRESOLVED/);
 assert.equal(h.mutations.length,n);assert.equal(h.evidenceFiles.length,files);
 h.ctx.study1AdminOwnerRequired_=()=>true;
 const r=h.ctx.study1OwnerE1RecoveryAudit(a.applicantId);
 const move=r.transactionEvidence.events.find(x=>x.action==='MOVE');
 assert.equal(move.status,'UNKNOWN');assert.equal(move.currentObservation,'PARTIAL_OR_CHANGED');
 assert.equal(h.tables.Reservations.rows.length,1);assert.equal(h.tables.Reservations.rows[0][3],'CANCELLED');
});
test('durable waitlist JOIN and CLAIM preserve original key and use shared private evidence',()=>{
 const h=harness();h.props.set('STUDY1_E1_TXN_EVIDENCE_APPROVED','true');
 const a=h.person('A'),z=h.person('B'),p=h.proof(a),q=h.proof(z),held=h.holdSlot(p,h.S1);
 const joined=h.ctx.study1FormalWaitlistJoin({emailProof:q,slotId:h.S1,requestId:'REQ_DURABLE_JOIN_12345678'});
 const key=h.tables.Reservations.rows[1][5];
 h.ctx.study1FormalCancel({emailProof:p,reservationId:held.reservationId,requestId:'REQ_DURABLE_CANCEL_12345678'});
 h.ctx.study1FormalWaitlistClaim({emailProof:q,reservationId:joined.reservationId,requestId:'REQ_DURABLE_CLAIM_12345678'});
 assert.equal(h.tables.Reservations.rows[1][5],key);
 h.ctx.study1AdminOwnerRequired_=()=>true;
 const r=h.ctx.study1OwnerE1RecoveryAudit(z.applicantId);
 assert.deepEqual(Array.from(r.transactionEvidence.events,x=>x.action),['JOIN','CLAIM']);
 assert.ok(r.transactionEvidence.events.every(x=>x.status==='COMMITTED_EVIDENCE'));
 const f=h.evidenceFiles.find(f=>f.raw.includes('"action":"CLAIM"'));f.raw=f.raw.replace('"CLAIM"','"CANCEL"');
 assert.throws(()=>h.ctx.study1OwnerE1RecoveryAudit(z.applicantId),/E1_TXN_FILE_EVIDENCE_INVALID/);
});
test('candidate consent issue and sign evidence ties original registry digest, not a new consent source',()=>{
 const h=harness();h.props.set('STUDY1_E1_TXN_EVIDENCE_APPROVED','true');
 const a=h.person('A'),p=h.proof(a),held=h.holdSlot(p,h.S1);
 const lock=h.locks.getScriptLock();assert.equal(lock.tryLock(),true);
 const entry={id:'CONSENT_DURABLE_12345678',state:'ISSUED',experiment:'E1',channel:'FORMAL_E1',binding:{applicantId:a.applicantId,reservationId:held.reservationId}};
 let registry={revision:0,records:[]};h.ctx.study1EConsentRegistry_=()=>registry;
 const issues=[h.ctx.study1FormalTxnSubject_('CONSENT',entry.id,null,entry)];
 const intent=h.ctx.study1FormalTxnPrepare_(a.applicantId,'CONSENT_ISSUE','REQ_DURABLE_ISSUE_12345678',issues,lock);
 registry={revision:1,records:[entry]};
 h.ctx.study1FormalTxnCommit_(a.applicantId,intent,issues,lock);
 const sign=h.ctx.study1FormalTxnPrepare_(a.applicantId,'CONSENT_SIGN','REQ_DURABLE_SIGN_12345678',[h.ctx.study1FormalTxnSubject_('CONSENT',entry.id,entry,undefined)],lock);
 const next={...entry,state:'CONFIRMED',signedPdf:{sha:'b'.repeat(64)}};
 registry={revision:2,records:[next]};
 h.ctx.study1FormalTxnCommit_(a.applicantId,sign,[h.ctx.study1FormalTxnSubject_('CONSENT',entry.id,entry,next)],lock);
 lock.releaseLock();
 const l=h.locks.getScriptLock();l.tryLock();
 const result=h.ctx.study1FormalTxnObserve_(a.applicantId,l,h.ctx.study1FormalSnapshot_(),registry);
 l.releaseLock();
 assert.ok(result.events.every(x=>x.status==='COMMITTED_EVIDENCE'));
 assert.equal(result.events.find(x=>x.action==='CONSENT_SIGN').currentObservation,'AFTER_OBSERVED');
});

test('write-before evidence captures competing external write; no operation is applied and unresolved intent blocks another session',()=>{
 const h=harness();h.props.set('STUDY1_E1_TXN_EVIDENCE_APPROVED','true');
 const a=h.person('A'),p=h.proof(a);
 h.evidenceCreateHook=f=>{if(f.raw.includes('"action":"HOLD"')&&f.raw.includes('"stage":"PREPARED"'))h.tables.Slots.rows[0][3]=2;};
 assert.throws(()=>h.holdSlot(p,h.S1),/E1_TXN_PREPARED_SOURCE_CHANGED/);
 assert.equal(h.tables.Reservations.rows.length,0);assert.equal(h.evidenceFiles.length,1);
 h.evidenceCreateHook=null;
 h.tables.Slots.rows[0][3]=1;
 assert.throws(()=>h.holdSlot(h.proof(a),h.S2,'REQ_NEW_SESSION_12345678'),/E1_TXN_UNRESOLVED/);
 assert.equal(h.tables.Reservations.rows.length,0);
});
test('missing COMMITTED evidence remains UNKNOWN even when original HOLD was persisted; no replay or new mutation',()=>{
 const h=harness();h.props.set('STUDY1_E1_TXN_EVIDENCE_APPROVED','true');
 const a=h.person('A'),p=h.proof(a);
 h.evidenceCreateHook=f=>{if(f.raw.includes('"stage":"COMMITTED"')){h.evidenceFiles.pop();throw Error('SYNTHETIC_COMMIT_EVIDENCE_NOT_PERSISTED');}};
 assert.throws(()=>h.holdSlot(p,h.S1),/SYNTHETIC_COMMIT_EVIDENCE_NOT_PERSISTED/);
 assert.equal(h.tables.Reservations.rows.length,1);
 h.evidenceCreateHook=null;h.ctx.study1AdminOwnerRequired_=()=>true;
 const audit=h.ctx.study1OwnerE1RecoveryAudit(a.applicantId);
 const e=audit.transactionEvidence.events[0];
 assert.equal(e.status,'UNKNOWN');assert.equal(e.currentObservation,'AFTER_OBSERVED');
 const n=h.mutations.length;
 assert.throws(()=>h.ctx.study1FormalCancel({emailProof:h.proof(a),reservationId:h.tables.Reservations.rows[0][0],requestId:'REQ_FRESH_CANCEL_12345678'}),/E1_TXN_UNRESOLVED/);
 assert.equal(h.mutations.length,n);
});

test('V08 evidence prepare detects changed unrelated original rows before any cancellation',()=>{
 const h=harness();h.props.set('STUDY1_E1_TXN_EVIDENCE_APPROVED','true');
 const a=h.person('A'),p=h.proof(a),held=h.holdSlot(p,h.S1);
 h.evidenceCreateHook=f=>{if(f.raw.includes('"action":"CANCEL"')&&f.raw.includes('"stage":"PREPARED"'))h.tables.Slots.rows[1][3]=2;};
 assert.throws(()=>h.ctx.study1FormalCancel({emailProof:p,reservationId:held.reservationId,requestId:'REQ_CANCEL_COMPETE_12345678'}),/PREPARED_SOURCE_CHANGED/);
 assert.equal(h.tables.Reservations.rows[0][3],'HELD');assert.equal(h.evidenceFiles.length,3);
});

const wsFilter={query:'',status:'ALL',eligibility:'ALL',slotId:'',offset:0};
function wsHarness(){
 const h=harness();h.ctx.study1AdminOwnerRequired_=()=>true;
 h.ctx.study1EConsentHash_=v=>crypto.createHash('sha256').update(v,'utf8').digest('hex');
 h.props.set('STUDY1_PARTICIPANT_DATA_USE_APPROVED','true');
 h.props.set('STUDY1_ECONSENT_LIVE_SHEETS_APPROVED','true');
 h.ctx.study1OwnerE1NoticeSnapshot_=()=>({rows:h.tables.Notifications.rows.map(r=>r.slice()),rowCount:h.tables.Notifications.rows.length+1});
 return h;
}
test('P0-B owner roster includes original pre-consent applicants with searchable filters and E1 slot occupancy',()=>{
 const h=wsHarness(),a=h.person('A'),z=h.person('B');
 h.tables.Applicants.rows[1][6]='PENDING_EMAIL';
 const held=h.holdSlot(h.proof(a),h.S1);
 const r=h.ctx.study1OwnerE1Workspace(wsFilter);
 assert.equal(r.total,2);assert.equal(r.slots.length,2);
 assert.equal(r.slots.find(s=>s.slotId===h.S1).remaining,0);
 assert.equal(r.participants.find(p=>p.applicantId===a.applicantId).bookingStatus,'HELD');
 assert.equal(r.participants.find(p=>p.applicantId===z.applicantId).bookingStatus,'NOT_BOOKED');
 assert.equal(h.ctx.study1OwnerE1Workspace({...wsFilter,query:z.applicantId,status:'PENDING_EMAIL'}).total,1);
 assert.equal(h.ctx.study1OwnerE1Workspace({...wsFilter,slotId:h.S1}).total,1);
 assert.doesNotMatch(JSON.stringify(r),/example.org|otp_hmac|idempotency_key|tokenHash|SLOT_E2/);
 h.tables.Screenings.rows[1][2]='OTHER_VERSION';
 const next=h.ctx.study1OwnerE1Workspace(wsFilter);assert.equal(next.total,1);assert.equal(next.excluded,1);
});
test('P0-B capacity, close and new slot preview check original history and revision without mutations',()=>{
 const h=wsHarness(),a=h.person('A');h.holdSlot(h.proof(a),h.S1);
 const r=h.ctx.study1OwnerE1Workspace(wsFilter),s=r.slots.find(x=>x.slotId===h.S1);
 const q={action:'UPDATE',revision:r.revision,slotId:s.slotId,startAtUtc:s.startAtUtc,endAtUtc:s.endAtUtc,capacity:2,locationCode:s.locationCode};
 const n=h.mutations.length;
 assert.equal(h.ctx.study1OwnerE1SlotChangePreview(q).written,false);
 assert.equal(h.ctx.study1OwnerE1SlotChangePreview({...q,action:'CLOSE',capacity:1}).after.status,'CLOSED');
 assert.throws(()=>h.ctx.study1OwnerE1SlotChangePreview({...q,locationCode:'OTHER_ROOM'}),/HISTORY_CONFLICT/);
 assert.throws(()=>h.ctx.study1OwnerE1SlotChangePreview({...q,capacity:0}),/DRAFT_INVALID/);
 assert.throws(()=>h.ctx.study1OwnerE1SlotChangePreview({...q,slotId:h.S3}),/SCOPE_INVALID/);
 assert.equal(h.ctx.study1OwnerE1SlotChangePreview({...q,action:'CREATE',slotId:'SLOT_NEW_12345678'}).after.status,'CLOSED');
 h.tables.Applicants.rows[0][1]='新姓名';
 assert.throws(()=>h.ctx.study1OwnerE1SlotChangePreview(q),/SOURCE_CHANGED/);
 assert.equal(h.mutations.length,n);
});
test('P0-B owner data gate, public denial and duplicate applicant fail closed',()=>{
 const h=wsHarness();h.person('A');const n=h.mutations.length;
 h.props.delete('STUDY1_PARTICIPANT_DATA_USE_APPROVED');
 assert.throws(()=>h.ctx.study1OwnerE1Workspace(wsFilter),/DATA_NOT_APPROVED/);
 h.props.set('STUDY1_PARTICIPANT_DATA_USE_APPROVED','true');
 h.ctx.study1AdminOwnerRequired_=()=>{throw Error('OWNER_REQUIRED');};
 assert.throws(()=>h.ctx.study1OwnerE1Workspace(wsFilter),/OWNER_REQUIRED/);
 h.ctx.study1AdminOwnerRequired_=()=>true;
 h.tables.Applicants.rows.push(h.tables.Applicants.rows[0].slice());
 assert.throws(()=>h.ctx.study1OwnerE1Workspace(wsFilter),/APPLICANT_DUPLICATE/);
 h.ctx.study1V2PublicRpcDeny_=()=>{throw Error('PUBLIC_READ_ONLY');};
 assert.throws(()=>h.ctx.study1OwnerE1Workspace(wsFilter),/PUBLIC_READ_ONLY/);
 assert.equal(h.mutations.length,n);
});

test('P0-B recruitment source is the original Index; no write or public read of owner RPC',()=>{
 const h=wsHarness(),n=h.mutations.length;
 h.ctx.HtmlService={createHtmlOutputFromFile:name=>{
  assert.equal(name,'Index');return {getContent:()=>fs.readFileSync(path.join(__dirname,'../gas/Index.html'),'utf8')};
 }};
 const r=h.ctx.study1OwnerE1RecruitmentDraft();
 const expected=require('../scripts/study1-v2-recruitment-copy.cjs').parseIndex(fs.readFileSync(path.join(__dirname,'../gas/Index.html'),'utf8'));
 assert.equal(r.title,expected.title);assert.equal(r.intro,expected.intro);assert.equal(r.actionAuthority,'DRAFT_ONLY');assert.equal(r.open,false);assert.equal(r.baseSha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../gas/Index.html'))).digest('hex'));
 h.ctx.study1V2PublicRpcDeny_=()=>{throw Error('PUBLIC_READ_ONLY');};
 assert.throws(()=>h.ctx.study1OwnerE1RecruitmentDraft(),/PUBLIC_READ_ONLY/);
 assert.equal(h.mutations.length,n);
});
function workspaceBrowser(server,options={}){
 const src=fs.readFileSync(path.join(__dirname,'../gas/AdminConsole.html'),'utf8');
 const begin=src.indexOf('/* P0-B recruitment copy:'),end=src.indexOf('function e1RecoverySetup_(){',begin);
 assert.ok(begin>=0&&end>begin);
 const nodes=new Map();
 function node(tag='div'){
  return {tag,children:[],value:'',textContent:'',disabled:false,handlers:{},
   appendChild(c){this.children.push(c);return c;},removeChild(c){this.children.splice(this.children.indexOf(c),1);},
   get firstChild(){return this.children[0]||null;},
   addEventListener(e,f){this.handlers[e]=f;},
   click(){if(!this.disabled&&this.handlers.click)this.handlers.click();}
  };
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 get('e1WsStatus').value='ALL';get('e1WsEligibility').value='ALL';
 let success,failure;const calls=[];
 const proxy=new Proxy({}, {get(_t,p){
  if(p==='withSuccessHandler')return f=>{success=f;return proxy;};
  if(p==='withFailureHandler')return f=>{failure=f;return proxy;};
  return (...args)=>{calls.push({method:p,args});const s=success,f=failure;const reply=()=>{try{s(server[p](...args));}catch(err){f(err);}};if(options.defer===p)pending.push(reply);else reply();};
 }});
 const pending=[],urls=[],revoked=[];
 vm.runInNewContext(src.slice(begin,end),{document:{getElementById:get,createElement:node},google:{script:{run:proxy}},Date,Number,JSON,Error,Uint8Array,
  atob:x=>Buffer.from(x,'base64').toString('latin1'),Blob:class {constructor(parts){this.parts=parts}},
  crypto:{subtle:{digest:async(_name,bytes)=>Uint8Array.from(crypto.createHash('sha256').update(bytes).digest()).buffer}},
  URL:{createObjectURL:()=>{const u='blob:case:'+urls.length;urls.push(u);return u;},revokeObjectURL:u=>revoked.push(u)}});
 return {get,calls,pending,urls,revoked};
}
test('P0-B browser workspace renders real joined roster, filters, selects slot and previews without a mutation',()=>{
 const h=wsHarness(),a=h.person('A');h.holdSlot(h.proof(a),h.S1);
 const b=workspaceBrowser(h.ctx),g=b.get,n=h.mutations.length;
 g('e1WsLoad').click();assert.equal(g('e1WsRows').children.length,1);assert.equal(g('e1WsSlots').children.length,2);
 assert.match(g('e1WsRows').children[0].children[5].textContent,/HELD/);
 const selected=g('e1WsSlots').children[0].children[8].children[0];selected.click();g('e1WsDraftCap').value='2';g('e1WsPreview').click();
 assert.match(g('e1WsDraftResult').textContent,/預檢通過（未儲存）/);
 assert.equal(b.calls.at(-1).method,'study1OwnerE1SlotChangePreview');
 assert.equal(b.calls.at(-1).args[0].startAtUtc,h.tables.Slots.rows[0][1]);
 assert.equal(b.calls.at(-1).args[0].endAtUtc,h.tables.Slots.rows[0][2]);
 g('e1WsQuery').value='NOT_PRESENT';g('e1WsLoad').click();assert.equal(g('e1WsRows').children.length,0);
 assert.equal(h.mutations.length,n);
 h.props.delete('STUDY1_PARTICIPANT_DATA_USE_APPROVED');g('e1WsLoad').click();
 assert.equal(g('e1WsRows').children.length,0);assert.equal(g('e1WsNew').disabled,true);
});
test('P0-B browser recruitment editing preview and review export never publish and reject HTML',()=>{
 const h=wsHarness();h.ctx.HtmlService={createHtmlOutputFromFile:()=>({getContent:()=>fs.readFileSync(path.join(__dirname,'../gas/Index.html'),'utf8')})};
 const b=workspaceBrowser(h.ctx),g=b.get;
 g('e1CopyLoad').click();assert.equal(g('e1CopyTitle').value,require('../scripts/study1-v2-recruitment-copy.cjs').parseIndex(fs.readFileSync(path.join(__dirname,'../gas/Index.html'),'utf8')).title);
 g('e1CopyTitle').value='審核中的招募標題';g('e1CopyPreview').click();
 assert.equal(g('e1CopyTitlePreview').textContent,'審核中的招募標題');
 g('e1CopyExport').click();
 const draft=JSON.parse(g('e1CopyDraft').value);assert.equal(draft.baseSha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../gas/Index.html'))).digest('hex'));assert.equal(draft.published,false);assert.equal(draft.open,false);assert.equal(draft.approved,false);
 g('e1CopyTitle').value='<script>';g('e1CopyTitle').handlers.input();g('e1CopyExport').click();
 assert.equal(g('e1CopyDraft').value,'');assert.match(g('e1CopyStatus').textContent,/不接受 HTML/);
 assert.deepEqual(b.calls.map(x=>x.method),['study1OwnerE1RecruitmentDraft']);
});

function slotDraft(h,slotId=h.S1,action='UPDATE',overrides={}){
 const w=h.ctx.study1OwnerE1Workspace(wsFilter),s=w.slots.find(x=>x.slotId===slotId)||w.slots[0];
 return {action,revision:w.revision,slotId,startAtUtc:s.startAtUtc,endAtUtc:s.endAtUtc,capacity:s.capacity,locationCode:s.locationCode,...overrides};
}
function approveSlot(h,q){
 const r=h.ctx.study1OwnerE1SlotChangePreview(q);
 h.props.set('OPEN','false');h.props.set('CONSENT_READY','false');
 h.props.set('STUDY1_E1_SLOT_MANAGEMENT_APPROVED','true');
 h.props.set('STUDY1_E1_SLOT_CHANGE_APPROVAL_V1',JSON.stringify({proposal:r.proposal,
  approvalRef:'PI_TEST_SLOT_001',reason:'合成核定資料',expiresAtUtc:ts(h.clock.now,3600000)}));
 const approved=h.ctx.study1OwnerE1SlotChangePreview(q);
 return {request:q,proposal:approved.proposal,confirmed:true};
}
test('P0-B authorized capacity update, create closed, open, close use original Slots and audit while preserving Reservations and E2 pins',()=>{
 const h=wsHarness(),person=h.person('A');h.holdSlot(h.proof(person),h.S1);
 const reservations=JSON.stringify(h.tables.Reservations),other=h.tables.Slots.rows[2].slice(),
  e2pin=JSON.parse(h.props.get('STUDY1_E1_SLOT_REGISTRY_V1'))[2];
 let q=slotDraft(h,h.S1,'UPDATE',{capacity:2}),request=approveSlot(h,q);
 assert.equal(h.ctx.study1OwnerE1SlotChangePreview(q).canCommit,true);
 assert.equal(h.ctx.study1OwnerE1SlotChangeCommit(request).written,true);
 assert.equal(h.tables.Slots.rows[0][3],2);
 assert.throws(()=>h.ctx.study1OwnerE1SlotChangeCommit(request),/SOURCE_CHANGED/);
 const id='SLOT_NEW_98765432';q=slotDraft(h,id,'CREATE',{startAtUtc:ts(h.clock.now,86400000),endAtUtc:ts(h.clock.now,90000000),capacity:3});
 assert.equal(h.ctx.study1OwnerE1SlotChangeCommit(approveSlot(h,q)).status,'CLOSED');
 q=slotDraft(h,id,'OPEN');assert.equal(h.ctx.study1OwnerE1SlotChangeCommit(approveSlot(h,q)).status,'OPEN');
 q=slotDraft(h,id,'CLOSE');assert.equal(h.ctx.study1OwnerE1SlotChangeCommit(approveSlot(h,q)).status,'CLOSED');
 assert.equal(h.tables.AuditLogs.rows.length,8);
 assert.deepEqual(h.tables.AuditLogs.rows.map(r=>r[4]),Array.from({length:4},()=>['E1_SLOT_CHANGE_PREPARED','E1_SLOT_CHANGE_COMMITTED']).flat());
 const logging=JSON.parse(h.tables.AuditLogs.rows[1][7]);assert.equal(logging.before[3],1);assert.equal(logging.after[3],2);assert.equal(logging.reason,'合成核定資料');
 assert.equal(JSON.stringify(h.tables.Reservations),reservations);assert.deepEqual(h.tables.Slots.rows[2],other);
 assert.deepEqual(JSON.parse(h.props.get('STUDY1_E1_SLOT_REGISTRY_V1'))[2],e2pin);
 assert.equal(h.ctx.study1OwnerE1Workspace(wsFilter).slots.find(s=>s.slotId===id).status,'CLOSED');
});
test('P0-B exact PI approval and closed intake are required; active holds cannot be stranded and stale/false confirmation cannot write',()=>{
 const h=wsHarness(),a=h.person('A');h.holdSlot(h.proof(a),h.S1);
 const q=slotDraft(h,h.S1,'UPDATE',{capacity:2}),no=h.ctx.study1OwnerE1SlotChangePreview(q);
 const n=h.mutations.length;
 assert.equal(no.canCommit,false);
 assert.throws(()=>h.ctx.study1OwnerE1SlotChangeCommit({request:q,proposal:no.proposal,confirmed:true}),/PI_APPROVAL_REQUIRED/);
 const r=approveSlot(h,q);
 assert.throws(()=>h.ctx.study1OwnerE1SlotChangeCommit({...r,confirmed:false}),/COMMIT_INVALID/);
 assert.throws(()=>h.ctx.study1OwnerE1SlotChangeCommit({...r,request:{...q,capacity:3}}),/PI_APPROVAL_REQUIRED/);
 h.props.set('OPEN','true');assert.throws(()=>h.ctx.study1OwnerE1SlotChangeCommit(r),/PI_APPROVAL_REQUIRED/);h.props.set('OPEN','false');
 const close=slotDraft(h,h.S1,'CLOSE'),cr=approveSlot(h,close);
 assert.equal(h.ctx.study1OwnerE1SlotChangePreview(close).canCommit,false);
 assert.throws(()=>h.ctx.study1OwnerE1SlotChangeCommit(cr),/NOT_SAFE/);
 assert.equal(h.mutations.length,n);
});
test('P0-B partial index write remains UNKNOWN, audit PREPARED remains, no later blind retry or reservation mutation',()=>{
 const h=wsHarness(),a=h.person('A');h.holdSlot(h.proof(a),h.S1);
 const reservations=JSON.stringify(h.tables.Reservations),q=slotDraft(h,h.S1,'UPDATE',{capacity:2}),r=approveSlot(h,q);
 h.propertyHook=()=>{throw Error('SYNTHETIC_PROPERTY_FAILURE');};
 assert.throws(()=>h.ctx.study1OwnerE1SlotChangeCommit(r),/UNKNOWN_REVIEW_REQUIRED/);
 assert.equal(h.tables.Slots.rows[0][3],2);
 assert.equal(h.tables.AuditLogs.rows.length,1);assert.equal(h.tables.AuditLogs.rows[0][4],'E1_SLOT_CHANGE_PREPARED');
 assert.equal(JSON.stringify(h.tables.Reservations),reservations);
 assert.throws(()=>h.ctx.study1OwnerE1Workspace(wsFilter),/SLOT_REGISTRY_STALE/);
 assert.throws(()=>h.ctx.study1OwnerE1SlotChangeCommit(r),/SLOT_REGISTRY_STALE/);
 assert.equal(h.tables.AuditLogs.rows.length,1);
});
test('P0-B after audit source drift prevents slot write and requires manual review even with fresh approval',()=>{
 const h=wsHarness(),q=slotDraft(h,h.S1,'UPDATE',{capacity:2}),r=approveSlot(h,q);
 const old=h.tables.Slots.rows[0].slice();
 h.intercept=()=>h.tables.Applicants.rows.push(['APP_UNLINKED_12345678','未連結','','',ts(h.clock.now,-5000),ts(h.clock.now,-5000),'PENDING_EMAIL']);
 assert.throws(()=>h.ctx.study1OwnerE1SlotChangeCommit(r),/UNKNOWN_REVIEW_REQUIRED/);
 assert.deepEqual(h.tables.Slots.rows[0],old);
 assert.equal(h.tables.AuditLogs.rows.length,1);
 const fresh=slotDraft(h,h.S1,'UPDATE',{capacity:3});
 const freshRequest=approveSlot(h,fresh);
 const preview=h.ctx.study1OwnerE1SlotChangePreview(fresh);
 assert.equal(preview.canCommit,false);assert.equal(preview.commitBlocker,'AUDIT_REVIEW_REQUIRED');
 assert.throws(()=>h.ctx.study1OwnerE1SlotChangeCommit(freshRequest),/AUDIT_UNRESOLVED_REVIEW_REQUIRED/);
});
test('P0-B browser commits approved exact slot draft once and reloads original capacity',()=>{
 const h=wsHarness(),q=slotDraft(h,h.S1,'UPDATE',{capacity:2});
 approveSlot(h,q);
 const b=workspaceBrowser(h.ctx),g=b.get;
 g('e1WsLoad').click();g('e1WsSlots').children[0].children[8].children[0].click();
 g('e1WsDraftCap').value='2';g('e1WsPreview').click();
 assert.equal(g('e1WsConfirm').disabled,false);assert.equal(g('e1WsCommit').disabled,true);
 g('e1WsConfirm').checked=true;g('e1WsConfirm').handlers.change();
 g('e1WsCommit').click();assert.match(g('e1WsCommitResult').textContent,/已儲存並回讀/);
 assert.equal(h.tables.Slots.rows[0][3],2);
 assert.equal(b.calls.filter(x=>x.method==='study1OwnerE1SlotChangeCommit').length,1);
 g('e1WsCommit').click();assert.equal(h.tables.AuditLogs.rows.length,2);
});

test('P0-B browser ambiguous slot-save response locks resubmission even after original readback',()=>{
 const h=wsHarness(),q=slotDraft(h,h.S1,'UPDATE',{capacity:2});approveSlot(h,q);
 const commit=h.ctx.study1OwnerE1SlotChangeCommit;
 h.ctx.study1OwnerE1SlotChangeCommit=input=>{commit(input);throw Error('SYNTHETIC_RESPONSE_LOST');};
 const b=workspaceBrowser(h.ctx),g=b.get;
 g('e1WsLoad').click();g('e1WsSlots').children[0].children[8].children[0].click();
 g('e1WsDraftCap').value='2';g('e1WsPreview').click();
 g('e1WsConfirm').checked=true;g('e1WsConfirm').handlers.change();g('e1WsCommit').click();
 assert.match(g('e1WsCommitResult').textContent,/結果未知/);
 assert.equal(h.tables.Slots.rows[0][3],2);assert.equal(h.tables.AuditLogs.rows.length,2);
 const next=slotDraft(h,h.S1,'UPDATE',{capacity:3});approveSlot(h,next);
 g('e1WsLoad').click();g('e1WsSlots').children[0].children[8].children[0].click();
 g('e1WsDraftCap').value='3';g('e1WsPreview').click();
 assert.equal(g('e1WsConfirm').disabled,true);assert.equal(g('e1WsCommit').disabled,true);
 g('e1WsCommit').click();assert.equal(b.calls.filter(x=>x.method==='study1OwnerE1SlotChangeCommit').length,1);
 assert.equal(h.tables.AuditLogs.rows.length,2);
});

function profileHarness(){
 const h=wsHarness(),a=h.person('A'),z=h.person('B');
 h.holdSlot(h.proof(a),h.S1);h.holdSlot(h.proof(z),h.S2,'REQ_HOLD_B_1234567890');
 return {h,a,z};
}
function profileRequest(h,id){return {applicantId:id,revision:h.ctx.study1OwnerE1Workspace(wsFilter).revision};}
function addCaseConsent(h,a){
 const row=h.tables.Reservations.rows.find(r=>r[1]===a.applicantId);
 const binding={schemaVersion:1,applicantId:a.applicantId,reservationId:row[0],slotId:row[2],challengeId:a.challengeId,
  screeningId:a.screeningId,experiment:'E1',documentSha:'a'.repeat(64),documentVersion:'E1-V1',
  identityEvidenceSha:'b'.repeat(64),eligibilityEvidenceSha:'c'.repeat(64),priorE1EvidenceSha:null,
  verifiedAtUtc:ts(h.clock.now,-120000),otpUsedAtUtc:ts(h.clock.now,-120000),holdUntilUtc:row[4],digest:''};
 binding.digest=h.ctx.study1BindingDigest_(binding);
 const c={id:'00000000-1111-4222-8333-000000123456',channel:'FORMAL_E1',experiment:'E1',researcherPresigned:true,
  binding,state:'CONFIRMED',documentSha:binding.documentSha,documentVersion:binding.documentVersion,tokenHash:'SENSITIVE_TOKEN_HASH',
  signedPdf:{id:'PRIVATE_FILE_1234567890',sha:'d'.repeat(64)},signature:{sha:'e'.repeat(64)},confirmation:{sha:'f'.repeat(64)}};
 h.ctx.study1EConsentRegistry_=()=>({revision:1,records:[c]});
 h.ctx.study1OwnerE1SignedPdfVerified_=entry=>({recordId:entry.id,experiment:'E1',researcherPreSigned:true,sourceSha256:entry.documentSha,
  signedPdfSha256:entry.signedPdf.sha,signedAtUtc:ts(h.clock.now,-1000),confirmedAtUtc:ts(h.clock.now,-500),bytes:200,mime:'application/pdf',base64:'SYNTHETIC_PDF_BYTES'});
 return c;
}
test('P0-B B04 same original B03 applicant, eight-source profile, reservation history and scope-limited contact',()=>{
 const {h,a,z}=profileHarness(),q=profileRequest(h,a.applicantId),n=h.mutations.length;
 h.tables.AuditLogs.rows.push(['AUD_TEST_A',ts(h.clock.now,-1000),'OWNER','owner@example.org','REVIEWED','APPLICANT',a.applicantId,'SECRET_RESULT','REQ_A']);
 h.tables.AuditLogs.rows.push(['AUD_TEST_B',ts(h.clock.now,-1000),'OWNER','owner@example.org','REVIEWED','APPLICANT',z.applicantId,'SECRET_RESULT_B','REQ_B']);
 const p=h.ctx.study1OwnerE1Profile(q);
 assert.equal(p.applicantId,a.applicantId);assert.equal(p.basic.email,h.tables.Applicants.rows[0][2]);
 assert.equal(p.eligibility.screeningId,a.screeningId);assert.equal(p.reservations.length,1);
 assert.equal(p.summary.bookingStatus,'HELD');assert.equal(p.nextAppointment.slotId,h.S1);
 assert.equal(p.execution.status,'SOURCE_NOT_CONNECTED');assert.equal(p.administration.status,'SOURCE_NOT_CONNECTED');
 assert.equal(p.history.length,1);assert.ok(p.timeline.some(e=>e.sourceId==='AUD_TEST_A'));
 assert.ok(!JSON.stringify(p).includes(z.applicantId));assert.doesNotMatch(JSON.stringify(p),/SECRET_RESULT|owner@example.org|idempotency_key|otp_hmac|tokenHash/);
 assert.equal(h.mutations.length,n);
});
test('P0-B B04 verified signed PDF and canonical notification stay separate from original reservation confirmation',()=>{
 const {h,a,z}=profileHarness(),c=addCaseConsent(h,a),id=c.binding.reservationId;
 const job='NTF_'+h.ctx.study1BindingHmac_(['E1_BOOKING_CONFIRMATION_NOTICE_V1',c.id,a.applicantId,id]).slice(0,28);
 h.tables.Notifications.rows.push([job,a.applicantId,id,'E1_RESERVATION_CONFIRMED','PROVIDER_ACCEPTED',1,ts(h.clock.now,-500),ts(h.clock.now,-100),'']);
 const q=profileRequest(h,a.applicantId),p=h.ctx.study1OwnerE1Profile(q);
 assert.equal(p.consent.pdfStatus,'PRIVATE_SHA_VERIFIED');assert.equal(p.summary.bookingStatus,'HELD');
 assert.equal(p.notices[0].status,'PROVIDER_ACCEPTED_NOT_DELIVERED');
 assert.ok(p.timeline.some(x=>x.source==='SIGNATURE'));assert.ok(p.timeline.some(x=>x.source==='Notifications'));
 assert.doesNotMatch(JSON.stringify(p),/SYNTHETIC_PDF_BYTES|SENSITIVE_TOKEN_HASH|PRIVATE_FILE_/);
 const pdf=h.ctx.study1OwnerE1ProfilePdf({...q,consentId:c.id});assert.equal(pdf.applicantId,a.applicantId);
 assert.throws(()=>h.ctx.study1OwnerE1ProfilePdf({...profileRequest(h,z.applicantId),consentId:c.id}),/PDF_NOT_VERIFIED/);
 h.ctx.study1OwnerE1SignedPdfVerified_=()=>{throw Error('PDF_SHA_MISMATCH')};
 assert.equal(h.ctx.study1OwnerE1Profile(q).consent.pdfStatus,'UNKNOWN_REQUIRES_REVIEW');
 assert.throws(()=>h.ctx.study1OwnerE1ProfilePdf({...q,consentId:c.id}),/PDF_NOT_VERIFIED/);
});
test('P0-B B04 refuses stale list, wrong consent ownership, non-E1, data gate and public access',()=>{
 const {h,a,z}=profileHarness(),q=profileRequest(h,a.applicantId);
 h.tables.Applicants.rows[0][1]='更新';assert.throws(()=>h.ctx.study1OwnerE1Profile(q),/STALE_LIST/);
 const c=addCaseConsent(h,a);c.binding.applicantId=z.applicantId;c.binding.digest=h.ctx.study1BindingDigest_(c.binding);
 assert.throws(()=>h.ctx.study1OwnerE1Profile(profileRequest(h,a.applicantId)),/CONSENT_BINDING_CONFLICT/);
 h.props.delete('STUDY1_PARTICIPANT_DATA_USE_APPROVED');
 assert.throws(()=>h.ctx.study1OwnerE1Profile(q),/DATA_NOT_APPROVED/);
 h.ctx.study1V2PublicRpcDeny_=()=>{throw Error('PUBLIC_READ_ONLY')};
 assert.throws(()=>h.ctx.study1OwnerE1Profile(q),/PUBLIC_READ_ONLY/);
 assert.throws(()=>h.ctx.study1OwnerE1ProfilePdf({...q,consentId:c.id}),/PUBLIC_READ_ONLY/);
});
test('P0-B B04 actual browser list row opens profile, tabs and timeline, returns without losing filters',()=>{
 const {h,a}=profileHarness(),b=workspaceBrowser(h.ctx),g=b.get;
 g('e1WsQuery').value=a.applicantId;g('e1WsLoad').click();
 assert.equal(g('e1WsRows').children.length,1);
 g('e1WsRows').children[0].children[9].children[0].click();
 assert.equal(g('e1Profile').hidden,false);
 assert.ok(g('e1ProfileSummary').children.some(x=>x.textContent.includes(a.applicantId)));
 g('e1ProfileTab').value='eligibility';g('e1ProfileTab').handlers.change();
 assert.ok(g('e1ProfileContent').children.some(x=>x.textContent.includes('E1_TEST_V1')));
 g('e1ProfileTimeline').children.find(x=>x.children[0].textContent.includes('原預約紀錄建立')).children[0].click();
 assert.equal(g('e1ProfileTab').value,'booking');
 g('e1ProfileBack').click();assert.equal(g('e1Profile').hidden,true);assert.equal(g('e1ProfileSummary').children.length,0);
 assert.equal(g('e1WsQuery').value,a.applicantId);assert.equal(g('e1WsRows').children.length,1);
});
test('P0-B B04 wrong case response and failed refresh clear selected private data',()=>{
 const {h}=profileHarness(),original=h.ctx.study1OwnerE1Profile,b=workspaceBrowser(h.ctx),g=b.get;
 h.ctx.study1OwnerE1Profile=q=>({...original(q),applicantId:'APP_WRONG_12345678'});
 g('e1WsLoad').click();g('e1WsRows').children[0].children[9].children[0].click();
 assert.equal(g('e1Profile').hidden,true);assert.equal(g('e1ProfileSummary').children.length,0);
 h.ctx.study1OwnerE1Profile=original;
 g('e1WsRows').children[0].children[9].children[0].click();assert.equal(g('e1Profile').hidden,false);
 h.props.delete('STUDY1_PARTICIPANT_DATA_USE_APPROVED');g('e1WsLoad').click();
 assert.equal(g('e1Profile').hidden,true);assert.equal(g('e1ProfileContent').children.length,0);assert.equal(g('e1WsRows').children.length,0);
});

test('P0-B B04 withdrawal timestamp is read from the original envelope and malformed time cannot invent a signing event',()=>{
 const {h,a}=profileHarness(),c=addCaseConsent(h,a);c.state='WITHDRAWN';c.withdrawal={sha:'9'.repeat(64)};
 const at=ts(h.clock.now,-200);
 h.ctx.study1EConsentEvent_=()=>({recordedAt:at,data:{signatureHash:c.signature.sha,confirmationHash:c.confirmation.sha}});
 const q=profileRequest(h,a.applicantId);
 let p=h.ctx.study1OwnerE1Profile(q);
 assert.equal(p.consent.withdrawalAtUtc,at);assert.ok(p.timeline.some(x=>x.source==='WITHDRAWAL'&&x.atUtc===at));
 const verified=h.ctx.study1OwnerE1SignedPdfVerified_;
 h.ctx.study1OwnerE1SignedPdfVerified_=x=>({...verified(x),confirmedAtUtc:'not-a-date'});
 p=h.ctx.study1OwnerE1Profile(q);
 assert.equal(p.consent.pdfStatus,'UNKNOWN_REQUIRES_REVIEW');assert.ok(!p.timeline.some(x=>x.source==='SIGNATURE'||x.source==='CONFIRMATION'));
});
test('P0-B B04 browser hashes exact selected private PDF, rejects mismatched bytes, revokes on leaving',async()=>{
 const {h,a}=profileHarness(),c=addCaseConsent(h,a),bytes=Buffer.from('%PDF-'+ 'synthetic private pdf '.repeat(10));
 c.signedPdf.sha=crypto.createHash('sha256').update(bytes).digest('hex');
 const verify=h.ctx.study1OwnerE1SignedPdfVerified_;
 h.ctx.study1OwnerE1SignedPdfVerified_=entry=>({...verify(entry),bytes:bytes.length,base64:bytes.toString('base64')});
 const b=workspaceBrowser(h.ctx),g=b.get;
 g('e1WsQuery').value=a.applicantId;g('e1WsLoad').click();g('e1WsRows').children[0].children[9].children[0].click();
 g('e1ProfileTab').value='consent';g('e1ProfileTab').handlers.change();g('e1ProfilePdf').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(g('e1ProfileDownload').hidden,false);assert.equal(b.urls.length,1);
 g('e1ProfileTab').value='basic';g('e1ProfileTab').handlers.change();assert.equal(g('e1ProfileDownload').hidden,true);assert.deepEqual(b.revoked,b.urls);
 const original=h.ctx.study1OwnerE1ProfilePdf;
 h.ctx.study1OwnerE1ProfilePdf=q=>({...original(q),base64:Buffer.alloc(bytes.length,65).toString('base64')});
 g('e1ProfileTab').value='consent';g('e1ProfileTab').handlers.change();g('e1ProfilePdf').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(g('e1ProfileDownload').hidden,true);assert.equal(b.urls.length,1);assert.match(g('e1ProfileStatus').textContent,/未核實/);
});
test('P0-B B04 delayed prior-case response cannot replace a new selection or reopen a closed profile',()=>{
 const {h,a,z}=profileHarness(),b=workspaceBrowser(h.ctx,{defer:'study1OwnerE1Profile'}),g=b.get;
 g('e1WsLoad').click();
 const rows=g('e1WsRows').children;
 rows[0].children[9].children[0].click();rows[1].children[9].children[0].click();
 assert.equal(b.pending.length,2);b.pending[1]();
 const selected=b.calls.filter(c=>c.method==='study1OwnerE1Profile')[1].args[0].applicantId;
 assert.ok(g('e1ProfileSummary').children.some(x=>x.textContent.includes(selected)));
 b.pending[0]();assert.ok(g('e1ProfileSummary').children.some(x=>x.textContent.includes(selected)));
 rows[0].children[9].children[0].click();g('e1ProfileBack').click();b.pending[2]();
 assert.equal(g('e1Profile').hidden,true);assert.equal(g('e1ProfileSummary').children.length,0);
});
