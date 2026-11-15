/**
 * Study1 §70-S.19: ORIGINAL E1 Slots/Reservations formal V05/V08 adapter.
 * Participant self-declaration + consumed email OTP are the only eligibility
 * evidence, never an ID/student-card check. No new Sheets, public demo, data
 * migration, automatic consent, or E2 intake.
 *
 * All mutating operations use the same GAS ScriptLock and original ten-column
 * Reservations table. Sheets is not ACID: on partial writes report UNKNOWN,
 * never quietly retry, roll back or claim completion.
 */
var STUDY1_FORMAL_HOLD_MS_=10*60000;
var STUDY1_FORMAL_QUOTE_MS_=2*60000;
function study1FormalKey_(r){
 if(typeof r!=='string'||!/^[A-Za-z0-9_-]{16,80}$/.test(r))
  throw Error('正式預約重送識別碼不合法');
 return r;
}
function study1FormalGate_(){
 study1WizardP0Gate_(); // PUBLIC E1 gates, not owner-only e-consent
 // Trust/REC/data-use source is independently checked by the intake gate.
 return true;
}
function study1FormalProof_(value){
 const p=study1ParticipantEmailProofRequest_(value);
 if(p.experiment!=='E1')throw Error('EXPERIMENT_NOT_OPEN');
 return p;
}
function study1FormalAuthenticateLocked_(proof,heldLock){
 if(!heldLock||heldLock.hasLock()!==true)
  throw Error('FORMAL_BOOKING_SHARED_LOCK_REQUIRED');
 const identity=study1SelfReportedAuthority_({
  applicantId:proof.applicantId,screeningId:proof.screeningId,
  challengeId:proof.challengeId,experiment:'E1'},heldLock);
 if(identity.verifiedAtUtc!==proof.usedAtUtc||
    identity.eligibilityEvidenceSource!=='PARTICIPANT_SELF_REPORT'||
    identity.emailControlSource!=='ORIGINAL_VERIFICATION_FG'||
    study1BindingHmac_(['MAIL_HASH_V1',identity.email])!==proof.emailHash)
  throw Error('FORMAL_BOOKING_EMAIL_PROOF_CHANGED');
 return identity;
}
function study1FormalValidateSnapshot_(snapshot,nowUtc){
 const current=bookingHoldSnapshot_({readSnapshot:()=>snapshot});
 bookingReadOnlyValidateTemporalCells_(current);
 bookingReadOnlyValidateCanonicalStatuses_(current);
 bookingReadOnlyValidateTextMetadata_(current);
 bookingComputeAvailability_(current.slots.rows,current.reservations.rows,nowUtc);
 const now=study1BindingUtc_(nowUtc);
 bookingHoldAssertUniqueActiveApplicants_(current.reservations.rows,now);
 bookingHoldAssertGlobalOccupancy_(current.slots.rows,current.reservations.rows,now);
 return current;
}
function study1FormalSnapshot_(){
 // Two full independently matching read-only passes + formula checks.
 const snapshot=bookingReadOnlySnapshot_(id=>SpreadsheetApp.openById(id));
 return snapshot;
}
function study1FormalWithLock_(untrustedProof,fn){
 study1FormalGate_();
 const proof=study1FormalProof_(untrustedProof);
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(5000)!==true)
  throw Error('FORMAL_BOOKING_LOCK_BUSY');
 try{
  if(lock.hasLock()!==true)throw Error('FORMAL_BOOKING_LOCK_LOST');
  study1FormalGate_();
  const identity=study1FormalAuthenticateLocked_(proof,lock);
  const nowUtc=new Date().toISOString(),snapshot=study1FormalSnapshot_();
  study1FormalValidateSnapshot_(snapshot,nowUtc);
  const ctx={proof,identity,nowUtc,snapshot,lock};
  const result=fn(ctx);
  if(lock.hasLock()!==true)throw Error('FORMAL_BOOKING_LOCK_LOST');
  return result;
 }finally{lock.releaseLock();}
}
function study1FormalSlot_(ctx,slotId){
 study1BindingId_(slotId);
 const matches=ctx.snapshot.slots.rows.filter(row=>row[0]===slotId);
 if(matches.length!==1)throw Error('SLOT_NOT_FOUND');
 const row=matches[0];
 // Registry is OWNER-reviewed, HMAC-bound, and pins the full original row.
 study1WizardSlotCheck_({slotId,experiment:'E1'},row,ctx.lock);
 if(row[5]!=='OPEN'||study1BindingUtc_(row[1])<=Date.now()||
    study1BindingUtc_(row[2])<=study1BindingUtc_(row[1]))
  throw Error('SLOT_NOT_BOOKABLE');
 return row;
}
function study1FormalQueue_(snapshot,slotId){
 // Same-millisecond entries retain original append order, not random
 // HMAC/UUID lexical ordering; that is the only auditable FIFO tie-break.
 return snapshot.reservations.rows.map((row,index)=>({row,index}))
  .filter(x=>x.row[2]===slotId&&x.row[3]==='WAITLISTED')
  .sort((a,b)=>a.row[6].localeCompare(b.row[6])||a.index-b.index)
  .map(x=>x.row);
}
function study1FormalRemaining_(ctx,row){
 return row[3]-bookingHoldCount_(ctx.snapshot.reservations.rows,
  row[0],study1BindingUtc_(ctx.nowUtc));
}
/** Never rewrite the original HELD audit row for temporal expiry. */
function study1FormalEffectiveStatus_(row,asOfUtc){
 return row[3]==='HELD'&&study1BindingUtc_(row[4])<=study1BindingUtc_(asOfUtc)?
  'EXPIRED':row[3];
}
function study1FormalRowsFor_(ctx){
 return ctx.snapshot.reservations.rows.filter(x=>x[1]===ctx.identity.applicantId)
  .map(x=>({reservationId:x[0],slotId:x[2],
   status:study1FormalEffectiveStatus_(x,ctx.nowUtc),
   holdUntilUtc:x[4],createdAtUtc:x[6]}));
}
function study1FormalV05Slots(emailProof){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 return study1FormalWithLock_(emailProof,ctx=>{
  // Missing/invalid registry is NOT an empty calendar: fail closed.
  const p=PropertiesService.getScriptProperties();
  if(p.getProperty('STUDY1_E1_SLOT_REGISTRY_APPROVED')!=='true')
   throw Error('SLOT_EXPERIMENT_SOURCE_NOT_CONFIGURED');
  const list=[];
  for(const row of ctx.snapshot.slots.rows){
   if(row[5]!=='OPEN'||study1BindingUtc_(row[1])<=Date.now())continue;
   try{study1WizardSlotAuthority_({slotId:row[0],experiment:'E1'},row,ctx.lock);}
   catch(error){
    if(String(error.message)==='SLOT_EXPERIMENT_MISMATCH')continue;
    throw error; // expired/HMAC-invalid/stale E1 mapping blocks output
   }
   const queue=study1FormalQueue_(ctx.snapshot,row[0]);
   const remaining=study1FormalRemaining_(ctx,row);
   list.push({slotId:row[0],startAtUtc:row[1],endAtUtc:row[2],
    capacity:row[3],remaining,waitlistCount:queue.length,
    bookable:remaining>0&&queue.length===0});
  }
  list.sort((a,b)=>a.startAtUtc.localeCompare(b.startAtUtc)||
   a.slotId.localeCompare(b.slotId));
  return {experiment:'E1',asOfUtc:ctx.nowUtc,slots:list,
   selfReportedEligible:true,emailVerified:true};
 });
}
function study1FormalQuoteHold(input){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!=='emailProof,requestId,slotId')
  throw Error('V05_QUOTE_REQUEST_INVALID');
 study1FormalKey_(input.requestId);
 return study1FormalWithLock_(input.emailProof,ctx=>{
  const slot=study1FormalSlot_(ctx,input.slotId);
  if(study1FormalRemaining_(ctx,slot)<1||
     study1FormalQueue_(ctx.snapshot,input.slotId).length)
   return {allowed:false,reason:'FULL_OR_WAITLIST'};
  const now=study1BindingUtc_(ctx.nowUtc);
  const until=Math.min(now+STUDY1_FORMAL_HOLD_MS_,
   study1BindingUtc_(slot[1])-1000);
  if(until<=now+60000)return {allowed:false,reason:'TOO_CLOSE_TO_START'};
  const document=study1EConsentReadyDocument_('E1');
  if(!document||document.experiment!=='E1'||
     !/^[a-f0-9]{64}$/.test(document.sha256||''))
   throw Error('E1_DOCUMENT_NOT_READY');
  const q={version:1,applicantId:ctx.identity.applicantId,
   screeningId:ctx.identity.screeningId,challengeId:ctx.identity.challengeId,
   experiment:'E1',slotId:slot[0],requestId:input.requestId,
   issuedAtUtc:ctx.nowUtc,
   expiresAtUtc:new Date(now+STUDY1_FORMAL_QUOTE_MS_).toISOString(),
   holdUntilUtc:new Date(until).toISOString(),
   documentSha:document.sha256,documentVersion:document.version};
  q.signature=study1BindingHmac_(['E1_V05_HOLD_QUOTE_V1',
   ctx.proof.signature,...Object.keys(q).sort().map(k=>q[k])]);
  return {allowed:true,quote:q};
 });
}
/** Persistent no-new-reservation fence after the original consent issue has
 * committed. It is derived under the same mutation lock, not from a tab,
 * browser-held bearer, or a new storage source. Withdrawal has its own path. */
function study1FormalNoPriorConsent_(applicantId,lock){
 if(!lock||lock.hasLock()!==true)throw Error('E1_CONSENT_FENCE_LOCK_REQUIRED');
 const registry=study1EConsentRegistry_();
 if(!registry||!Array.isArray(registry.records))
  throw Error('E1_CONSENT_FENCE_SOURCE_INVALID');
 if(registry.records.some(x=>x&&x.binding&&x.binding.applicantId===applicantId))
  throw Error('E1_EXISTING_CONSENT_REQUIRES_OWNER_REVIEW');
 if(lock.hasLock()!==true)throw Error('E1_CONSENT_FENCE_LOCK_LOST');
}
function study1FormalHoldSlot(input){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!=='emailProof,quote')
  throw Error('V05_HOLD_REQUEST_INVALID');
 const quote=input.quote;
 const keys='applicantId,challengeId,documentSha,documentVersion,experiment,expiresAtUtc,holdUntilUtc,issuedAtUtc,requestId,screeningId,signature,slotId,version';
 if(!quote||Array.isArray(quote)||typeof quote!=='object'||
    Object.keys(quote).sort().join(',')!==keys||
    quote.version!==1||quote.experiment!=='E1'||
    typeof quote.signature!=='string'||!/^[a-f0-9]{64}$/.test(quote.signature))
  throw Error('V05_QUOTE_INVALID');
 const expires=study1BindingUtc_(quote.expiresAtUtc);
 const issued=study1BindingUtc_(quote.issuedAtUtc);
 study1BindingUtc_(quote.holdUntilUtc);
 study1FormalKey_(quote.requestId);
 if(expires-issued!==STUDY1_FORMAL_QUOTE_MS_||
    expires<=Date.now()||issued>Date.now())
  throw Error('V05_QUOTE_EXPIRED');
 let ok=false;
 study1FormalWithLock_(input.emailProof,ctx=>{
  if(quote.applicantId!==ctx.identity.applicantId||
     quote.screeningId!==ctx.identity.screeningId||
     quote.challengeId!==ctx.identity.challengeId)
   throw Error('V05_QUOTE_OWNER_MISMATCH');
  const untrusted={...quote};delete untrusted.signature;
  const expected=study1BindingHmac_(['E1_V05_HOLD_QUOTE_V1',
   ctx.proof.signature,...Object.keys(untrusted).sort().map(k=>untrusted[k])]);
  if(expected!==quote.signature)throw Error('V05_QUOTE_HMAC_INVALID');
  study1FormalNoPriorConsent_(ctx.identity.applicantId,ctx.lock);
  study1FormalSlot_(ctx,quote.slotId);
  const document=study1EConsentReadyDocument_('E1');
  if(document.sha256!==quote.documentSha||
     document.version!==quote.documentVersion)
   throw Error('V05_QUOTE_DOCUMENT_CHANGED');
  ok=true;
  return true;
 });
 if(!ok)throw Error('V05_QUOTE_RECHECK_FAILED');
 // Existing BookingHoldOnceLocked_ reacquires ScriptLock, globally rechecks
 // capacity/ownership/FIFO and appends exactly one original reservation row.
 return study1WizardHoldBound_({
  applicantId:quote.applicantId,screeningId:quote.screeningId,
  challengeId:quote.challengeId,experiment:'E1',slotId:quote.slotId,
  documentSha:quote.documentSha,documentVersion:quote.documentVersion,
  holdUntilUtc:quote.holdUntilUtc,requestId:quote.requestId},study1FormalNoPriorConsent_);
}
function study1FormalManageSource_(ctx,reservationId){
 study1BindingId_(reservationId);
 const rows=ctx.snapshot.reservations.rows.filter(r=>r[0]===reservationId);
 if(rows.length!==1||rows[0][1]!==ctx.identity.applicantId)
  throw Error('V08_RESERVATION_NOT_OWNED');
 study1FormalSlot_(ctx,rows[0][2]);
 return rows[0];
}
function study1FormalSame_(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
 return a.every((v,i)=>{
  const x=Object.prototype.toString.call(v)==='[object Date]'?v.toISOString():v;
  const y=Object.prototype.toString.call(b[i])==='[object Date]'?
   b[i].toISOString():b[i];
  return x===y;
 });
}
function study1FormalWriteExisting_(ctx,before,after){
 if(study1FormalTxnEnabled_()){
  const fresh=study1FormalSnapshot_();
  for(const name of ['slots','reservations']){
   const original=ctx.snapshot[name],current=fresh[name];
   if(!study1FormalSame_(current.headers,original.headers)||current.rows.length!==original.rows.length||
      current.rows.some((r,i)=>!study1FormalSame_(r,original.rows[i])))
    throw Error('E1_TXN_PREPARED_SOURCE_CHANGED');
  }
 }
 const book=SpreadsheetApp.openById(study1BindingSheetId_('reservations'));
 const tab=book.getSheetByName('Reservations');
 const ix=ctx.snapshot.reservations.rows.findIndex(r=>r[0]===before[0]);
 if(ix<0||!tab||tab.getLastColumn()!==BOOKING_RESERVATION_HEADERS_.length)
  throw Error('V08_STORAGE_CHANGED');
 const range=tab.getRange(ix+2,1,1,BOOKING_RESERVATION_HEADERS_.length);
 if(!study1FormalSame_(range.getValues()[0],before))
  throw Error('V08_CONCURRENT_CHANGE');
 if(!ctx.lock||ctx.lock.hasLock()!==true)
  throw Error('V08_LOCK_LOST');
 range.setValues([after]);
 SpreadsheetApp.flush();
 if(!study1FormalSame_(range.getValues()[0],after))
  throw Error('V08_MUTATION_OUTCOME_UNKNOWN');
 return true;
}
function study1FormalAppend_(ctx,newRow){
 if(study1FormalTxnEnabled_()){
  const current=study1FormalSnapshot_();
  bookingHoldAssertSlotsStable_(ctx.snapshot.slots.rows,current.slots.rows);
  const old=ctx.snapshot.reservations.rows;
  if(current.reservations.rows.length!==old.length)throw Error('E1_TXN_PREPARED_SOURCE_CHANGED');
  const expected=ctx.txnMoveAfter||null;
  if(current.reservations.rows.some((r,i)=>!study1FormalSame_(r,expected&&old[i][0]===expected[0]?expected:old[i])))
   throw Error('E1_TXN_PREPARED_SOURCE_CHANGED');
 }
 const book=SpreadsheetApp.openById(study1BindingSheetId_('reservations'));
 const tab=book.getSheetByName('Reservations');
 if(!tab||tab.getLastColumn()!==BOOKING_RESERVATION_HEADERS_.length||
    tab.getLastRow()!==ctx.snapshot.reservations.rows.length+1)
  throw Error('V08_STORAGE_CHANGED');
 if(!ctx.lock||ctx.lock.hasLock()!==true)throw Error('V08_LOCK_LOST');
 tab.appendRow(newRow);SpreadsheetApp.flush();
 const row=tab.getRange(tab.getLastRow(),1,1,newRow.length).getValues()[0];
 if(!study1FormalSame_(row,newRow))throw Error('V08_MUTATION_OUTCOME_UNKNOWN');
 return true;
}
function study1FormalAfterMutation_(original,expected){
 const updated=study1FormalSnapshot_();
 study1FormalValidateSnapshot_(updated,new Date().toISOString());
 bookingHoldAssertSlotsStable_(original.slots.rows,updated.slots.rows);
 for(const [id,row] of expected){
  const matches=updated.reservations.rows.filter(r=>r[0]===id);
  if(matches.length!==1||!study1FormalSame_(matches[0],row))
   throw Error('V08_MUTATION_OUTCOME_UNKNOWN');
 }
 return updated;
}
function study1FormalStatus(emailProof){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 return study1FormalWithLock_(emailProof,ctx=>({
  experiment:'E1',asOfUtc:ctx.nowUtc,reservations:study1FormalRowsFor_(ctx)
 }));
}
/** One read-only causality check for a missing HOLD RPC response.
 * An absent row is UNKNOWN, NEVER a reason to replay the original write.
 */
function study1FormalHoldOutcome(input){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 if(!input||typeof input!=='object'||Array.isArray(input))
  throw Error('V05_HOLD_OUTCOME_REQUEST_INVALID');
 const keys=Object.keys(input).sort().join(',');
 const signed=keys==='emailProof,quote,requestId,slotId';
 if(!signed&&keys!=='emailProof,requestId,slotId')
  throw Error('V05_HOLD_OUTCOME_REQUEST_INVALID');
 study1FormalKey_(input.requestId);study1BindingId_(input.slotId);
 return study1FormalWithLock_(input.emailProof,ctx=>{
  // Read-only: the original WZ_ key must use the DOCUMENT AT HOLD TIME,
  // not a newly published version. An expired signed quote remains usable
  // solely for finding the ORIGINAL request outcome; it cannot issue a hold.
  let documentSha,documentVersion;
  if(signed){
   const q=input.quote;
   const expectedKeys='applicantId,challengeId,documentSha,documentVersion,experiment,expiresAtUtc,holdUntilUtc,issuedAtUtc,requestId,screeningId,signature,slotId,version';
   if(!q||typeof q!=='object'||Array.isArray(q)||
      Object.keys(q).sort().join(',')!==expectedKeys||
      q.version!==1||q.experiment!=='E1'||q.slotId!==input.slotId||
      q.requestId!==input.requestId||q.applicantId!==ctx.identity.applicantId||
      q.challengeId!==ctx.identity.challengeId||
      q.screeningId!==ctx.identity.screeningId||
      !/^[a-f0-9]{64}$/.test(q.documentSha||'')||
      typeof q.documentVersion!=='string'||!q.documentVersion||
      !/^[a-f0-9]{64}$/.test(q.signature||'')||
      study1BindingUtc_(q.expiresAtUtc)-study1BindingUtc_(q.issuedAtUtc)!==
       STUDY1_FORMAL_QUOTE_MS_||
      study1BindingUtc_(q.holdUntilUtc)<=study1BindingUtc_(q.issuedAtUtc))
    throw Error('V05_HOLD_OUTCOME_QUOTE_INVALID');
   const unsigned={...q};delete unsigned.signature;
   const proof=study1BindingHmac_(['E1_V05_HOLD_QUOTE_V1',
    ctx.proof.signature,...Object.keys(unsigned).sort().map(k=>unsigned[k])]);
   if(proof!==q.signature)throw Error('V05_HOLD_OUTCOME_QUOTE_HMAC_INVALID');
   documentSha=q.documentSha;documentVersion=q.documentVersion;
  }else{
   // Legacy read-only callers without the exact signed quote cannot
   // safely recover a hold across document changes.
   const doc=study1EConsentReadyDocument_('E1');
   if(!doc||doc.experiment!=='E1'||!/^[a-f0-9]{64}$/.test(doc.sha256||''))
    throw Error('V05_HOLD_OUTCOME_DOCUMENT_NOT_READY');
   documentSha=doc.sha256;documentVersion=doc.version;
  }
  const issuedKey='WZ_'+study1BindingHmac_([
   'STUDY1_WIZARD_BOOKING_V1',ctx.identity.applicantId,
   ctx.identity.challengeId,ctx.identity.screeningId,'E1',input.slotId,
   documentSha,documentVersion,input.requestId
  ]);
  const rows=ctx.snapshot.reservations.rows.filter(x=>x[5]===issuedKey);
  if(!rows.length)return {resolved:false,status:'UNKNOWN',reason:'NOT_FOUND_IN_SNAPSHOT',
   asOfUtc:ctx.nowUtc};
  if(rows.length!==1)throw Error('V05_HOLD_OUTCOME_DUPLICATE_KEY');
  const r=rows[0];
  if(r[1]!==ctx.identity.applicantId||r[2]!==input.slotId)
   throw Error('V05_HOLD_OUTCOME_BINDING_MISMATCH');
  const status=study1FormalEffectiveStatus_(r,ctx.nowUtc);
  if(!['HELD','EXPIRED','CONFIRMED','CANCELLED'].includes(status))
   return {resolved:false,status:'UNKNOWN',reason:'NON_HOLD_STATUS',asOfUtc:ctx.nowUtc};
  return {resolved:true,status,reservationId:r[0],slotId:r[2],
   holdUntilUtc:r[4],asOfUtc:ctx.nowUtc};
 });
}

/** V08 reconciliation is strictly read-only. MOVE/JOIN carry a persisted HMAC
 * key; CANCEL/CLAIM retain the original row key, so only current state can
 * be observed, not causality of the particular request. */
function study1FormalV08Outcome(input){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!=='action,emailProof,newSlotId,requestId,reservationId,slotId'||
    !['JOIN','CLAIM','CANCEL','MOVE'].includes(input.action))
  throw Error('V08_OUTCOME_REQUEST_INVALID');
 study1FormalKey_(input.requestId);study1BindingId_(input.slotId);
 if(input.action==='JOIN'){
  if(input.reservationId!==''||input.newSlotId!=='')throw Error('V08_OUTCOME_REQUEST_INVALID');
 }else{
  study1BindingId_(input.reservationId);
  if(input.action==='MOVE'){
   study1BindingId_(input.newSlotId);
   if(input.newSlotId===input.slotId)throw Error('V08_OUTCOME_REQUEST_INVALID');
  }else if(input.newSlotId!=='')throw Error('V08_OUTCOME_REQUEST_INVALID');
 }
 return study1FormalWithLock_(input.emailProof,ctx=>{
  const rows=ctx.snapshot.reservations.rows,app=ctx.identity.applicantId;
  const base={readOnly:true,experiment:'E1',action:input.action,requestId:input.requestId,
   originalReservationId:input.reservationId,slotId:input.slotId,newSlotId:input.newSlotId};
  const unknown=reason=>({...base,resolved:false,status:'UNKNOWN',reason});
  const active=rows.filter(r=>r[1]===app&&
   ['WAITLISTED','HELD','CONFIRMED'].includes(study1FormalEffectiveStatus_(r,ctx.nowUtc)));
  const result=(r,status,evidence)=>({...base,resolved:true,status,evidence,
   reservation:r?{reservationId:r[0],slotId:r[2],status,holdUntilUtc:r[4]}:null});
  study1FormalSlot_(ctx,input.slotId);
  if(input.action==='JOIN'){
   const key='WQ_'+study1BindingHmac_(['E1_V08_WAITLIST_V1',app,input.slotId,input.requestId]).slice(0,42);
   const id='RSV_'+study1BindingHmac_(['E1_V08_WAITLIST_ROW_V1',app,input.slotId,key]).slice(0,28);
   const found=rows.filter(r=>r[5]===key||r[0]===id);
   if(found.length!==1)return unknown('EXACT_JOIN_NOT_UNIQUE');
   const r=found[0];
   if(r[0]!==id||r[5]!==key||r[1]!==app||r[2]!==input.slotId||r[3]!=='WAITLISTED'||
      active.length!==1||active[0]!==r)return unknown('JOIN_STATE_MISMATCH');
   return result(r,'WAITLISTED','ORIGINAL_REQUEST_KEY');
  }
  const original=study1FormalManageSource_(ctx,input.reservationId);
  if(original[2]!==input.slotId)return unknown('ORIGINAL_SLOT_MISMATCH');
  if(input.action==='MOVE'){
   study1FormalSlot_(ctx,input.newSlotId);
   const key='MV_'+study1BindingHmac_(['E1_V08_MOVE_V1',app,original[0],input.newSlotId,input.requestId]).slice(0,42);
   const id='RSV_'+study1BindingHmac_(['E1_V08_MOVE_ROW_V1',app,original[0],key]).slice(0,28);
   const found=rows.filter(r=>r[5]===key||r[0]===id);
   if(found.length!==1)return unknown(original[3]==='CANCELLED'?'PARTIAL_OR_UNKNOWN':'EXACT_MOVE_NOT_UNIQUE');
   const r=found[0];
   if(original[3]!=='CANCELLED'||r[0]!==id||r[5]!==key||r[1]!==app||r[2]!==input.newSlotId||
      r[4]!==original[4]||r[6]!==original[8]||
      study1FormalEffectiveStatus_(r,ctx.nowUtc)!=='HELD'||active.length!==1||active[0]!==r)
    return unknown('MOVE_PAIR_MISMATCH');
   return result(r,'HELD','ORIGINAL_REQUEST_KEY');
  }
  const status=study1FormalEffectiveStatus_(original,ctx.nowUtc);
  if(input.action==='CANCEL'&&status==='CANCELLED'&&active.length===0)
   return result(original,'CANCELLED','ORIGINAL_ROW_STATE_ONLY');
  if(input.action==='CLAIM'&&status==='HELD'&&original[5].startsWith('WQ_')&&
     active.length===1&&active[0]===original)
   return result(original,'HELD','ORIGINAL_ROW_STATE_ONLY');
  return unknown('ORIGINAL_ROW_STATE_NOT_RESOLVED');
 });
}

function study1FormalWaitlistGate_(){
 study1FormalGate_();
 if(PropertiesService.getScriptProperties()
    .getProperty('STUDY1_E1_WAITLIST_POLICY_REVIEWED')!=='true')
  throw Error('E1_WAITLIST_POLICY_NOT_READY');
}
function study1FormalWaitlistJoin(input){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!=='emailProof,requestId,slotId')
  throw Error('V08_WAITLIST_REQUEST_INVALID');
 study1FormalWaitlistGate_();study1FormalKey_(input.requestId);
 return study1FormalWithLock_(input.emailProof,ctx=>{
  study1FormalWaitlistGate_();
  study1FormalNoPriorConsent_(ctx.identity.applicantId,ctx.lock);
  const slot=study1FormalSlot_(ctx,input.slotId),queue=study1FormalQueue_(ctx.snapshot,input.slotId);
  const key='WQ_'+study1BindingHmac_(['E1_V08_WAITLIST_V1',
   ctx.identity.applicantId,slot[0],input.requestId]).slice(0,42);
  const existing=ctx.snapshot.reservations.rows.filter(r=>r[5]===key);
  if(existing.length>1)throw Error('V08_WAITLIST_DUPLICATE_KEY');
  if(existing.length===1){
   const r=existing[0];
   if(r[1]!==ctx.identity.applicantId||r[2]!==slot[0])
    throw Error('V08_WAITLIST_REPLAY_CHANGED');
   return {joined:r[3]==='WAITLISTED',status:r[3],
    reservationId:r[0],reason:'REPLAY'};
  }
  const mine=ctx.snapshot.reservations.rows.filter(r=>r[1]===ctx.identity.applicantId);
  if(mine.some(r=>r[3]==='WAITLISTED'))
   return {joined:false,reason:'EXISTING_WAITLIST'};
  if(mine.some(r=>r[2]===slot[0]&&
     bookingHoldActive_(r,study1BindingUtc_(ctx.nowUtc))))
   return {joined:false,reason:'ALREADY_BOOKED'};
  if(study1FormalRemaining_(ctx,slot)>0&&queue.length===0)
   return {joined:false,reason:'SEAT_AVAILABLE'};
  const reservationId='RSV_'+study1BindingHmac_([
   'E1_V08_WAITLIST_ROW_V1',ctx.identity.applicantId,slot[0],key]).slice(0,28);
  if(ctx.snapshot.reservations.rows.some(r=>r[0]===reservationId))
   throw Error('V08_RESERVATION_ID_COLLISION');
  const row=[reservationId,ctx.identity.applicantId,slot[0],'WAITLISTED',
   '',key,ctx.nowUtc,'','',ctx.nowUtc];
  const evidence=study1FormalTxnEnabled_()?[study1FormalTxnSubject_('RESERVATION',reservationId,null,row)]:null;
  const prepared=study1FormalTxnPrepare_(ctx.identity.applicantId,'JOIN',input.requestId,evidence,ctx.lock);
  study1FormalAppend_(ctx,row);
  study1FormalAfterMutation_(ctx.snapshot,[[reservationId,row]]);
  study1FormalTxnCommit_(ctx.identity.applicantId,prepared,evidence,ctx.lock);
  return {joined:true,status:'WAITLISTED',reservationId,
   position:queue.length+1,reason:'CREATED'};
 });
}
function study1FormalWaitlistClaim(input){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!=='emailProof,requestId,reservationId')
  throw Error('V08_WAITLIST_CLAIM_INVALID');
 study1FormalWaitlistGate_();study1FormalKey_(input.requestId);
 return study1FormalWithLock_(input.emailProof,ctx=>{
  study1FormalWaitlistGate_();
  study1FormalNoPriorConsent_(ctx.identity.applicantId,ctx.lock);
  const r=study1FormalManageSource_(ctx,input.reservationId);
  if(r[3]==='HELD'&&study1BindingUtc_(r[4])>Date.now())
   return {held:true,reason:'ALREADY_CLAIMED',reservationId:r[0],holdUntilUtc:r[4]};
  if(r[3]!=='WAITLISTED')return {held:false,reason:'NOT_WAITLISTED'};
  const head=study1FormalQueue_(ctx.snapshot,r[2])[0];
  if(!head||head[0]!==r[0])return {held:false,reason:'WAITLIST_FIFO'};
  const slot=study1FormalSlot_(ctx,r[2]);
  if(study1FormalRemaining_(ctx,slot)<1)
   return {held:false,reason:'FULL'};
  if(ctx.snapshot.reservations.rows.some(x=>
     x[1]===ctx.identity.applicantId&&x[0]!==r[0]&&
     bookingHoldActive_(x,study1BindingUtc_(ctx.nowUtc))))
   return {held:false,reason:'EXISTING_ACTIVE_HOLD'};
  const now=study1BindingUtc_(ctx.nowUtc);
  const until=Math.min(now+STUDY1_FORMAL_HOLD_MS_,
   study1BindingUtc_(slot[1])-1000);
  if(until<=now+60000)return {held:false,reason:'TOO_CLOSE_TO_START'};
  const after=r.slice();after[3]='HELD';
  after[4]=new Date(until).toISOString();after[9]=ctx.nowUtc;
  const evidence=study1FormalTxnEnabled_()?[study1FormalTxnSubject_('RESERVATION',r[0],r,after)]:null;
  const prepared=study1FormalTxnPrepare_(ctx.identity.applicantId,'CLAIM',input.requestId,evidence,ctx.lock);
  study1FormalWriteExisting_(ctx,r,after);
  study1FormalAfterMutation_(ctx.snapshot,[[r[0],after]]);
  study1FormalTxnCommit_(ctx.identity.applicantId,prepared,evidence,ctx.lock);
  return {held:true,reason:'CLAIMED',reservationId:r[0],
   slotId:r[2],holdUntilUtc:after[4]};
 });
}
function study1FormalCancel(input){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!=='emailProof,requestId,reservationId')
  throw Error('V08_CANCEL_REQUEST_INVALID');
 study1FormalKey_(input.requestId);
 return study1FormalWithLock_(input.emailProof,ctx=>{
  study1FormalNoPriorConsent_(ctx.identity.applicantId,ctx.lock);
  const r=study1FormalManageSource_(ctx,input.reservationId);
  if(r[3]==='CANCELLED')return {cancelled:true,reason:'ALREADY_CANCELLED',
   reservationId:r[0],status:'CANCELLED'};
  if(r[3]!=='WAITLISTED'&&
     !(r[3]==='HELD'&&study1BindingUtc_(r[4])>Date.now()))
   return {cancelled:false,reason:'NOT_CANCELLABLE'};
  // Confirmed attendance and study participation are deliberately excluded.
  const after=r.slice();after[3]='CANCELLED';after[8]=ctx.nowUtc;
  after[9]=ctx.nowUtc;
  const evidence=study1FormalTxnEnabled_()?[study1FormalTxnSubject_('RESERVATION',r[0],r,after)]:null;
  const prepared=study1FormalTxnPrepare_(ctx.identity.applicantId,'CANCEL',input.requestId,evidence,ctx.lock);
  study1FormalWriteExisting_(ctx,r,after);
  study1FormalAfterMutation_(ctx.snapshot,[[r[0],after]]);
  study1FormalTxnCommit_(ctx.identity.applicantId,prepared,evidence,ctx.lock);
  return {cancelled:true,reason:'CANCELLED',reservationId:r[0],
   status:'CANCELLED'};
 });
}
function study1FormalMove(input){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!==
    'emailProof,newSlotId,requestId,reservationId')
  throw Error('V08_MOVE_REQUEST_INVALID');
 study1FormalKey_(input.requestId);
 return study1FormalWithLock_(input.emailProof,ctx=>{
  study1FormalNoPriorConsent_(ctx.identity.applicantId,ctx.lock);
  const previous=study1FormalManageSource_(ctx,input.reservationId);
  const target=study1FormalSlot_(ctx,input.newSlotId);
  if(previous[2]===target[0])return {moved:false,reason:'UNCHANGED'};
  const key='MV_'+study1BindingHmac_(['E1_V08_MOVE_V1',
   ctx.identity.applicantId,previous[0],target[0],input.requestId]).slice(0,42);
  const newId='RSV_'+study1BindingHmac_([
   'E1_V08_MOVE_ROW_V1',ctx.identity.applicantId,previous[0],key]).slice(0,28);
  const already=ctx.snapshot.reservations.rows.filter(r=>r[5]===key);
  if(already.length>1)throw Error('V08_MOVE_DUPLICATE_KEY');
  if(already.length===1){
   const r=already[0];
   if(r[0]!==newId||r[1]!==ctx.identity.applicantId||
      previous[3]!=='CANCELLED')
    throw Error('V08_MUTATION_PARTIAL_REQUIRES_REVIEW');
   return {moved:r[3]==='HELD',reason:'REPLAY',
    reservationId:newId,slotId:target[0],holdUntilUtc:r[4]};
  }
  if(previous[3]==='CANCELLED')
   throw Error('V08_MUTATION_PARTIAL_REQUIRES_REVIEW');
  if(previous[3]!=='HELD'||
     study1BindingUtc_(previous[4])<=Date.now())
   return {moved:false,reason:'NOT_ACTIVE_HELD'};
  if(study1FormalQueue_(ctx.snapshot,target[0]).length)
   return {moved:false,reason:'WAITLIST_FIFO'};
  if(study1FormalRemaining_(ctx,target)<1)
   return {moved:false,reason:'FULL'};
  if(study1BindingUtc_(previous[4])>study1BindingUtc_(target[1]))
   return {moved:false,reason:'HOLD_EXTENDS_PAST_START'};
  const oldCancelled=previous.slice();
  oldCancelled[3]='CANCELLED';oldCancelled[8]=ctx.nowUtc;oldCancelled[9]=ctx.nowUtc;
  const newRow=[newId,ctx.identity.applicantId,target[0],
   'HELD',previous[4],key,ctx.nowUtc,'','',ctx.nowUtc];
  if(ctx.snapshot.reservations.rows.some(x=>x[0]===newId))
   throw Error('V08_RESERVATION_ID_COLLISION');
  // Two Sheet mutations are not ACID. If append fails after cancellation,
  // report PARTIAL/UNKNOWN and require manual reconciliation, never re-run.
  const evidence=study1FormalTxnEnabled_()?[study1FormalTxnSubject_('RESERVATION',previous[0],previous,oldCancelled),
   study1FormalTxnSubject_('RESERVATION',newId,null,newRow)]:null;
  const prepared=study1FormalTxnPrepare_(ctx.identity.applicantId,'MOVE',input.requestId,evidence,ctx.lock);
  study1FormalWriteExisting_(ctx,previous,oldCancelled);
  ctx.txnMoveAfter=oldCancelled;
  try{study1FormalAppend_(ctx,newRow);}
  catch(_){throw Error('V08_MUTATION_PARTIAL_REQUIRES_REVIEW');}
  study1FormalAfterMutation_(ctx.snapshot,[[previous[0],oldCancelled],[newId,newRow]]);
  study1FormalTxnCommit_(ctx.identity.applicantId,prepared,evidence,ctx.lock);
  return {moved:true,reason:'MOVED',
   reservationId:newId,slotId:target[0],holdUntilUtc:newRow[4]};
 });
}


/**
 * §70-S.23: OWNER-only, post-dual-PDF ORIGINAL Reservations completion.
 * The signed consent registry is stored separately from the operations Sheet:
 * NEVER confirm the seat before the independent PDF registry has committed.
 * Afterward, recheck the complete source under the shared ScriptLock, then
 * CAS only that existing HELD row to CONFIRMED, and read it back. A failure
 * leaves a real signed PDF intact but booking status explicitly unconfirmed.
 * This is a deliberately one-way, idempotent repairable transaction; it does
 * NOT change the HELD/quote policy or silently resurrect expired bookings.
 */
/** Private original-source HMAC receipt for one OWNER consent/booking preflight. */
function study1FormalReconcileReceipt_(registry,entry,original){
 if(!Number.isSafeInteger(registry.revision)||registry.revision<0||
    !entry||!entry.binding||!Array.isArray(original)||original.length!==10)
  throw Error('FORMAL_BOOKING_RECONCILE_SOURCE_INVALID');
 return study1BindingHmac_(['E1_OWNER_SIGNED_BOOKING_RECONCILE_V1',
  registry.revision,entry.id,entry.tokenHash,entry.documentSha,
  entry.documentVersion,entry.binding.digest,...original]);
}
function study1FormalFinalizeSignedE1Booking_(consentId,capabilityToken,ownerAction){
 // OWNER can reconcile legacy records; a valid participant token can only
 // close its own already-signed, owner-uploaded pre-signed E1 PDF transaction.
 const participantPath=typeof capabilityToken==='string';
 if(ownerAction!==undefined){
  if(participantPath||!ownerAction||typeof ownerAction!=='object'||
     Array.isArray(ownerAction)||!['PREFLIGHT','COMMIT'].includes(ownerAction.mode))
   throw Error('FORMAL_BOOKING_RECONCILE_MODE_INVALID');
  const keys=Object.keys(ownerAction).sort().join(',');
  if(ownerAction.mode==='PREFLIGHT'&&keys!=='mode')
   throw Error('FORMAL_BOOKING_RECONCILE_MODE_INVALID');
  if(ownerAction.mode==='COMMIT'&&
     (keys!=='consentRevision,mode,receipt'||
      !Number.isSafeInteger(ownerAction.consentRevision)||
      ownerAction.consentRevision<0||
      !/^[a-f0-9]{64}$/.test(ownerAction.receipt||'')))
   throw Error('FORMAL_BOOKING_RECONCILE_MODE_INVALID');
 }
 if(!participantPath)study1AdminOwnerRequired_();
 study1FormalConsentGate_();
 study1BindingId_(consentId);
 const lock=LockService.getScriptLock();
 if(!lock||typeof lock.tryLock!=='function'||lock.tryLock(10000)!==true)
  throw Error('FORMAL_BOOKING_FINALIZE_LOCK_BUSY');
 try{
  if(lock.hasLock()!==true)throw Error('FORMAL_BOOKING_FINALIZE_LOCK_LOST');
  if(!participantPath)study1AdminOwnerRequired_();
  study1FormalConsentGate_();
  const registry=study1EConsentRegistry_();
  const matches=registry.records.filter(x=>x.id===consentId);
  if(matches.length!==1)throw Error('FORMAL_BOOKING_CONSENT_NOT_UNIQUE');
  const entry=matches[0],bound=entry.binding;
  // A conflicting consent bound to the same original reservation cannot
  // silently pick a winner, even if one record has valid PDF evidence.
  if(bound&&registry.records.some(x=>x&&x.id!==entry.id&&
      x.channel==='FORMAL_E1'&&x.experiment==='E1'&&x.binding&&
      x.binding.reservationId===bound.reservationId))
   throw Error('FORMAL_BOOKING_RESERVATION_CONSENT_NOT_UNIQUE');
  const researcherPreSigned=entry.researcherPresigned===true;
  if(participantPath){
   const holder=study1EConsentEntry_(capabilityToken,registry);
   if(holder.id!==entry.id||holder.tokenHash!==entry.tokenHash||
      !researcherPreSigned)throw Error('FORMAL_BOOKING_OWNER_OR_SELF_TOKEN_REQUIRED');
  }
  if(entry.state!=='CONFIRMED'||entry.channel!=='FORMAL_E1'||
     entry.experiment!=='E1'||entry.researcherPresigned!==true||
     !bound||bound.experiment!=='E1'||
     !entry.signature||!entry.confirmation||!entry.participantSignedPdf||
     !entry.signedPdf)
   throw Error('FORMAL_BOOKING_DUAL_PDF_NOT_CONFIRMED');
  const doc=study1EConsentReadyDocument_('E1');
  const rec=study1FormalConsentRecScope_();
  if(researcherPreSigned&&doc.researcherPresigned!==true)
   throw Error('FORMAL_BOOKING_RESEARCHER_PRESIGNED_SOURCE_CHANGED');
  if(doc.id!==rec.consentDocumentId||
     doc.sha256!==rec.consentDocumentSha256||
     doc.sha256!==entry.documentSha||doc.version!==entry.documentVersion||
     bound.documentSha!==doc.sha256||bound.documentVersion!==doc.version||
     study1BindingDigest_(bound)!==bound.digest)
   throw Error('FORMAL_BOOKING_CONSENT_SOURCE_CHANGED');
  const signature=study1EConsentEvent_(entry.signature,entry,'SIGNATURE').data;
  const confirmation=study1EConsentEvent_(entry.confirmation,entry,'CONFIRMATION').data;
  if(researcherPreSigned&&
     (confirmation.mode!=='RESEARCHER_PRESIGNED_SOURCE'||
      confirmation.researcherSignedSourceSha256!==entry.documentSha||
      entry.participantSignedPdf.id!==entry.signedPdf.id))
   throw Error('FORMAL_BOOKING_PRESIGNED_SOURCE_EVIDENCE_MISMATCH');
  if(signature.signedPdfSha256!==entry.participantSignedPdf.sha||
     confirmation.signatureHash!==entry.signature.sha||
     confirmation.participantSignedPdfSha256!==entry.participantSignedPdf.sha||
     confirmation.researcherSignedPdfSha256!==entry.signedPdf.sha)
   throw Error('FORMAL_BOOKING_DUAL_PDF_HASH_MISMATCH');
  study1EConsentSignedPdfRead_(entry.participantSignedPdf,entry);
  study1EConsentSignedPdfRead_(entry.signedPdf,entry);
  const nowUtc=new Date().toISOString(),snapshot=study1FormalSnapshot_();
  study1FormalValidateSnapshot_(snapshot,nowUtc);
  const originals=snapshot.reservations.rows.filter(r=>r[0]===bound.reservationId);
  if(originals.length!==1)throw Error('FORMAL_BOOKING_ORIGINAL_RESERVATION_NOT_UNIQUE');
  const original=originals[0],ctx={snapshot,nowUtc,lock};
  if(original[1]!==bound.applicantId||original[2]!==bound.slotId)
   throw Error('FORMAL_BOOKING_IDENTITY_SLOT_CHANGED');
  // The same PI-signed original E1 slot row remains the only authority.
  study1FormalSlot_(ctx,original[2]);
  if(original[3]==='CONFIRMED'){
   if(!original[7]||original[8])
    throw Error('FORMAL_BOOKING_CONFIRMATION_INCONSISTENT');
   if(ownerAction&&ownerAction.mode==='PREFLIGHT')
    return {readOnly:true,disposition:'ALREADY_CONFIRMED',
     bookingConfirmed:true,bookingStatus:'CONFIRMED',
     consentId:entry.id,reservationId:original[0],
     consentRevision:registry.revision};
   return {bookingConfirmed:true,reason:'ALREADY_CONFIRMED',
    reservationId:original[0],bookingStatus:'CONFIRMED',readOnlyReplay:true};
  }
  if(original[3]!=='HELD'||study1BindingUtc_(original[4])<=Date.now()){
   if(ownerAction&&ownerAction.mode==='PREFLIGHT')
    return {readOnly:true,disposition:'MANUAL_REVIEW_ONLY',
     bookingConfirmed:false,bookingStatus:original[3]==='HELD'?'EXPIRED':original[3],
     consentId:entry.id,reservationId:original[0],
     consentRevision:registry.revision};
   throw Error('FORMAL_BOOKING_HELD_EXPIRED_OR_CHANGED');
  }
  // Verify the actual self-reported applicant and consumed Email OTP afresh.
  const adapter=study1EConsentBindingAdapter_('PUBLIC_E1');
  study1BindingRecheck_(bound,doc,adapter,nowUtc,lock);
  if(lock.hasLock()!==true)throw Error('FORMAL_BOOKING_FINALIZE_LOCK_LOST');
  if(ownerAction){
   const receipt=study1FormalReconcileReceipt_(registry,entry,original);
   if(ownerAction.mode==='PREFLIGHT')
    return {readOnly:true,disposition:'REPAIRABLE_HELD',
     bookingConfirmed:false,bookingStatus:'HELD',
     consentId:entry.id,reservationId:original[0],
     consentRevision:registry.revision,receipt};
   if(registry.revision!==ownerAction.consentRevision||
      receipt!==ownerAction.receipt)
    throw Error('FORMAL_BOOKING_RECONCILE_PREFLIGHT_STALE');
  }
  const changed=original.slice();
  changed[3]='CONFIRMED';changed[7]=nowUtc;changed[9]=nowUtc;
  const evidence=study1FormalTxnEnabled_()?[study1FormalTxnSubject_('RESERVATION',original[0],original,changed)]:null;
  const prepared=study1FormalTxnPrepare_(bound.applicantId,'BOOKING_CONFIRM',
   'CONFIRM_'+study1BindingHmac_(['E1_BOOKING_CONFIRM_TXN',entry.id]).slice(0,40),evidence,lock);
  study1FormalWriteExisting_(ctx,original,changed);
  study1FormalAfterMutation_(snapshot,[[original[0],changed]]);
  study1FormalTxnCommit_(bound.applicantId,prepared,evidence,lock);
  return {bookingConfirmed:true,reason:'CONFIRMED_AFTER_DUAL_PDF',
   reservationId:original[0],bookingStatus:'CONFIRMED',readOnlyReplay:false};
 }finally{lock.releaseLock();}
}


/**
 * OWNER-only E1 signed-PDF/booking status audit. No writes, owner-only IDs
 * and no claim of booked seating based solely on a CONFIRMED consent event.
 * Uses the ORIGINAL doubly-read Reservations snapshot and existing validator.
 */
function study1OwnerE1ConsentBookingAudit(){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 study1AdminOwnerRequired_();
 const lock=LockService.getScriptLock();
 if(!lock||typeof lock.tryLock!=='function'||lock.tryLock(10000)!==true)
  throw Error('OWNER_E1_BOOKING_AUDIT_LOCK_BUSY');
 try{
  if(lock.hasLock()!==true)throw Error('OWNER_E1_BOOKING_AUDIT_LOCK_LOST');
  study1AdminOwnerRequired_();
  const registry=study1EConsentRegistry_();
  const snapshot=study1FormalSnapshot_(),asOfUtc=new Date().toISOString();
  study1FormalValidateSnapshot_(snapshot,asOfUtc);
  return study1OwnerE1BookingProject_(registry,snapshot,asOfUtc,lock);
 }finally{lock.releaseLock();}
}

/** The ORIGINAL Reservations status projection; the caller has ScriptLock.
 * Shared by the existing standalone audit and the joined OWNER audit.
 * This helper never reads a source, sends email or writes a row.
 */
function study1OwnerE1BookingProject_(registry,snapshot,asOfUtc,lock){
  if(!snapshot||!snapshot.reservations||
     !Array.isArray(snapshot.reservations.rows)||
     !Array.isArray(registry.records)||
     !Number.isSafeInteger(registry.revision))
   throw Error('OWNER_E1_BOOKING_AUDIT_SOURCE_INVALID');
  const matched=new Map();
  for(const row of snapshot.reservations.rows){
   if(!Array.isArray(row)||row.length!==10||typeof row[0]!=='string')
    throw Error('OWNER_E1_BOOKING_AUDIT_ROW_INVALID');
   const group=matched.get(row[0])||[];
   group.push(row);matched.set(row[0],group);
  }
  const formal=registry.records.filter(x=>x&&x.channel==='FORMAL_E1'&&
   x.experiment==='E1');
  // A reservation cannot independently confirm more than one consent record.
  // Ambiguous bindings remain UNKNOWN; never pick a winner by row order.
  const bindingCounts=new Map();
  for(const entry of formal){
   const b=entry.binding;
   if(b&&typeof b.reservationId==='string')
    bindingCounts.set(b.reservationId,(bindingCounts.get(b.reservationId)||0)+1);
  }
  const records=formal.map(x=>{
    const unknown={id:x.id,bookingStatus:'UNKNOWN',bookingConfirmed:false};
    const b=x.binding;
    if(!b||b.experiment!=='E1'||typeof b.reservationId!=='string'||
       typeof b.applicantId!=='string'||typeof b.slotId!=='string')
     return unknown;
    if(bindingCounts.get(b.reservationId)!==1)return unknown;
    const found=matched.get(b.reservationId)||[];
    if(found.length!==1)return unknown;
    const row=found[0];
    if(row[1]!==b.applicantId||row[2]!==b.slotId)return unknown;
    if(row[3]==='CONFIRMED'){
     if(typeof row[7]!=='string'||!row[7]||row[8])
      return unknown;
     return {id:x.id,bookingStatus:'CONFIRMED',bookingConfirmed:true};
    }
    if(row[3]==='HELD'){
     const heldUntil=study1BindingUtc_(row[4]);
     return {id:x.id,bookingStatus:heldUntil>Date.now()?'HELD':'EXPIRED',
      bookingConfirmed:false};
    }
    if(row[3]==='CANCELLED')
     return {id:x.id,bookingStatus:'CANCELLED',bookingConfirmed:false};
    return unknown;
   });
  if(lock.hasLock()!==true)throw Error('OWNER_E1_BOOKING_AUDIT_LOCK_LOST');
  return {readOnly:true,source:'ORIGINAL_RESERVATIONS',
   consentRevision:registry.revision,asOfUtc,records};
}

/** OWNER-only coherent E1 read: one ScriptLock and two full passes over
 * original consent, Slots/Reservations and Notifications. Matching the consent
 * revision by itself cannot detect changes to the two external Sheets.
 * This is a bounded double-read, not an ACID snapshot against external writers.
 */
function study1OwnerE1OperationsAudit(){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 study1AdminOwnerRequired_();
 const lock=LockService.getScriptLock();
 if(!lock||typeof lock.tryLock!=='function'||lock.tryLock(10000)!==true)
  throw Error('OWNER_E1_OPERATIONS_LOCK_BUSY');
 try{
  if(lock.hasLock()!==true)throw Error('OWNER_E1_OPERATIONS_LOCK_LOST');
  study1AdminOwnerRequired_();
  const consentA=study1EConsentRegistry_();
  const originalA=study1FormalSnapshot_();
  const noticesA=study1OwnerE1NoticeSnapshot_();
  if(lock.hasLock()!==true)throw Error('OWNER_E1_OPERATIONS_LOCK_LOST');
  const consentB=study1EConsentRegistry_();
  const originalB=study1FormalSnapshot_();
  const noticesB=study1OwnerE1NoticeSnapshot_();
  if(lock.hasLock()!==true)throw Error('OWNER_E1_OPERATIONS_LOCK_LOST');
  if(!consentA||!consentB||
     !Number.isSafeInteger(consentA.revision)||consentA.revision<0||
     consentA.revision!==consentB.revision||
     !Array.isArray(consentA.records)||!Array.isArray(consentB.records)||
     JSON.stringify(consentA.records)!==JSON.stringify(consentB.records))
   throw Error('OWNER_E1_OPERATIONS_CONSENT_DRIFT');
  // Exact original headers and full rows: booking status alone is insufficient.
  function exactOriginal(x){
   if(!x||!x.slots||!x.reservations||
      !Array.isArray(x.slots.headers)||!Array.isArray(x.slots.rows)||
      !Array.isArray(x.reservations.headers)||!Array.isArray(x.reservations.rows))
    throw Error('OWNER_E1_OPERATIONS_ORIGINAL_SOURCE_INVALID');
   return JSON.stringify([x.slots.headers,x.slots.rows,
    x.reservations.headers,x.reservations.rows]);
  }
  if(exactOriginal(originalA)!==exactOriginal(originalB))
   throw Error('OWNER_E1_OPERATIONS_RESERVATIONS_DRIFT');
  if(!noticesA||!noticesB||
     !Number.isSafeInteger(noticesA.rowCount)||
     noticesA.rowCount!==noticesB.rowCount||
     JSON.stringify(noticesA.rows)!==JSON.stringify(noticesB.rows))
   throw Error('OWNER_E1_OPERATIONS_NOTIFICATIONS_DRIFT');
  const asOfUtc=new Date().toISOString();
  study1FormalValidateSnapshot_(originalA,asOfUtc);
  study1FormalValidateSnapshot_(originalB,asOfUtc);
  const booking=study1OwnerE1BookingProject_(consentA,originalA,asOfUtc,lock);
  const notice=study1OwnerE1NoticeProject_(consentA,noticesA.rows,lock);
  if(booking.consentRevision!==notice.consentRevision||
     booking.consentRevision!==consentA.revision||
     booking.records.length!==notice.records.length)
   throw Error('OWNER_E1_OPERATIONS_REVISION_OR_KEYS_CHANGED');
  const bookingIds=new Set(booking.records.map(x=>x.id));
  if(bookingIds.size!==booking.records.length||
     notice.records.some(x=>!bookingIds.has(x.id)))
   throw Error('OWNER_E1_OPERATIONS_REVISION_OR_KEYS_CHANGED');
  if(lock.hasLock()!==true)throw Error('OWNER_E1_OPERATIONS_LOCK_LOST');
  // Snapshot observations do not authorize later writes. External writers
  // may race AFTER the last pass (or perform an undetectable A->B->A change).
  // A repair still requires its own fresh server-side preflight and CAS.
  return {readOnly:true,source:'ORIGINAL_E1_OPERATIONS',
   snapshotConsistency:'SAME_LOCK_DOUBLE_READ',
   actionAuthority:'NONE',externalWriterGuarantee:false,asOfUtc,
   consentRevision:consentA.revision,booking,notice};
 }finally{lock.releaseLock();}
}

/** No writes: OWNER verifies exact signed PDF/event chain, OTP, current PI
 * slot and original Reservations. A candidate is never an actual booking.
 */
function study1OwnerE1SignedBookingPreflight(consentId){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 study1AdminOwnerRequired_();study1BindingId_(consentId);
 return study1FormalFinalizeSignedE1Booking_(consentId,undefined,{mode:'PREFLIGHT'});
}
/** Explicit OWNER only, one original HELD -> CONFIRMED CAS with current receipt.
 * Does not re-sign, rebook, or send/resend a notification. Ambiguous response:
 * STOP and independently read original Reservations; never POST automatically.
 */
function study1OwnerE1SignedBookingRepair(input){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 study1AdminOwnerRequired_();
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!=='consentId,consentRevision,receipt'||
    !Number.isSafeInteger(input.consentRevision)||input.consentRevision<0||
    typeof input.receipt!=='string'||!/^[a-f0-9]{64}$/.test(input.receipt))
  throw Error('OWNER_E1_SIGNED_BOOKING_REPAIR_REQUEST_INVALID');
 study1BindingId_(input.consentId);
 const result=study1FormalFinalizeSignedE1Booking_(
  input.consentId,undefined,{mode:'COMMIT',
   consentRevision:input.consentRevision,receipt:input.receipt});
 if(result.bookingConfirmed!==true||result.bookingStatus!=='CONFIRMED')
  throw Error('OWNER_E1_SIGNED_BOOKING_REPAIR_NOT_CONFIRMED');
 return {bookingConfirmed:true,bookingStatus:'CONFIRMED',
  consentId:input.consentId,reservationId:result.reservationId,
  readOnlyReplay:result.readOnlyReplay===true,
  notification:'NOT_SENT_BY_RECONCILIATION',
  next:'VERIFY_ORIGINAL_RESERVATIONS_AND_OUTBOX'};
}

/** OWNER-only lost browser case lookup. Applicant ID is a reference, never
 * authentication. Observe original rows and index only, never reconstruct a
 * lost bearer, resend mail, or infer operation causality from missing rows. */
function study1OwnerE1RecoveryAudit(applicantId){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 study1AdminOwnerRequired_();
 study1BindingId_(applicantId);
 if(!/^APP_[A-Za-z0-9_-]{12,76}$/.test(applicantId))throw Error('E1_RECOVERY_REFERENCE_INVALID');
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(10000)!==true)throw Error('E1_RECOVERY_LOCK_BUSY');
 try{
  if(lock.hasLock()!==true)throw Error('E1_RECOVERY_LOCK_LOST');
  study1AdminOwnerRequired_();
  return study1FormalRecoveryObservationLocked_(applicantId,lock);
 }finally{lock.releaseLock();}
}

/** Internal observation only, called under the verified OWNER or recovery OTP lock. */
function study1FormalRecoveryObservationLocked_(applicantId,lock){
 if(!lock||lock.hasLock()!==true)throw Error('E1_RECOVERY_LOCK_REQUIRED');
  const read=()=>{
   const s=study1FormalSnapshot_(),c=study1EConsentRegistry_();
   if(!c||!Number.isSafeInteger(c.revision)||!Array.isArray(c.records))
    throw Error('E1_RECOVERY_SOURCE_INVALID');
   return {s,c};
  };
  const a=read(),b=read();
  if(JSON.stringify([a.s.slots.headers,a.s.slots.rows,a.s.reservations.headers,a.s.reservations.rows,a.c.revision,a.c.records])!==
     JSON.stringify([b.s.slots.headers,b.s.slots.rows,b.s.reservations.headers,b.s.reservations.rows,b.c.revision,b.c.records]))
   throw Error('E1_RECOVERY_SOURCE_CHANGED');
  const asOfUtc=new Date().toISOString();
  study1FormalValidateSnapshot_(a.s,asOfUtc);
  const rows=a.s.reservations.rows.filter(r=>r[1]===applicantId);
  for(const r of rows){
   const slot=a.s.slots.rows.filter(s=>s[0]===r[2]);
   if(slot.length!==1)throw Error('E1_RECOVERY_SLOT_NOT_UNIQUE');
   study1WizardSlotAuthority_({experiment:'E1',slotId:r[2]},slot[0],lock);
  }
  const consent=a.c.records.filter(x=>x&&x.binding&&x.binding.applicantId===applicantId);
  if(consent.length>1||consent.some(x=>x.channel!=='FORMAL_E1'||x.experiment!=='E1'||
     x.binding.experiment!=='E1'||!['ISSUED','CONFIRMED','SIGNED','WITHDRAWN'].includes(x.state)))
   throw Error('E1_RECOVERY_CONSENT_SOURCE_MISMATCH');
  if(lock.hasLock()!==true)throw Error('E1_RECOVERY_LOCK_LOST');
  return {readOnly:true,experiment:'E1',applicantId,asOfUtc,
   evidence:'CURRENT_ORIGINAL_SOURCES_ONLY',actionAuthority:'NONE',
   reservations:rows.map(r=>({reservationId:r[0],slotId:r[2],
    status:study1FormalEffectiveStatus_(r,asOfUtc),holdUntilUtc:r[4],
    createdAtUtc:r[6],cancelledAtUtc:r[8],updatedAtUtc:r[9]})),
   consents:consent.map(x=>({consentId:x.id,reservationId:x.binding.reservationId,state:x.state})),
   transactionEvidence:study1FormalTxnObserve_(applicantId,lock,a.s,a.c),
   disposition:'OWNER_REVIEW_REQUIRED'};
}

/** Candidate durable transaction evidence: private original consent evidence
 * folder, never an alternative booking/consent source. No file write until
 * independently approved; retain original ten-column Reservations and registry.
 * Drive is not WORM: HMAC detects modified bytes, not deletion/rollback.
 */
function study1FormalTxnEnabled_(){
 return PropertiesService.getScriptProperties().getProperty('STUDY1_E1_TXN_EVIDENCE_APPROVED')==='true';
}
function study1FormalTxnLock_(lock){
 if(!lock||lock.hasLock()!==true)throw Error('E1_TXN_LOCK_REQUIRED');
}
function study1FormalTxnDigest_(value){
 return study1BindingHmac_(['E1_TRANSACTION_SUBJECT_V1',JSON.stringify(value)]);
}
function study1FormalTxnPrefix_(applicantId){
 study1BindingId_(applicantId);
 return 'Study1_E1_Txn_'+study1BindingHmac_(['E1_TXN_APP_V1',applicantId]).slice(0,40)+'_';
}
function study1FormalTxnName_(prefix,event){
 return prefix+event.key+'_'+event.stage+'.json';
}
function study1FormalTxnMac_(event){
 const data={...event};delete data.mac;
 return study1BindingHmac_(['E1_TXN_EVIDENCE_V1',JSON.stringify(data)]);
}
function study1FormalTxnReadFile_(file,prefix){
 if(!file||file.getSharingAccess()!==DriveApp.Access.PRIVATE||
    file.getMimeType()!=='application/json'||file.getSize()<100||file.getSize()>20000)
  throw Error('E1_TXN_FILE_PRIVATE_OR_SIZE_INVALID');
 const parents=file.getParents();let inside=false;
 while(parents.hasNext())if(parents.next().getId()===STUDY1_CONSENT_DOC_FOLDER_)inside=true;
 if(!inside)throw Error('E1_TXN_FILE_PARENT_INVALID');
 const raw=file.getBlob().getDataAsString();let e;
 try{e=JSON.parse(raw);}catch(_){throw Error('E1_TXN_FILE_JSON_INVALID');}
 const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
 if(!e||JSON.stringify(e)!==raw||Array.isArray(e)||e.schema!==1||!hex(e.key)||!hex(e.mac)||
    e.mac!==study1FormalTxnMac_(e)||e.prefix!==prefix||
    !['HOLD','MOVE','CANCEL','JOIN','CLAIM','CONSENT_ISSUE','CONSENT_SIGN','BOOKING_CONFIRM'].includes(e.action)||
    !['PREPARED','COMMITTED'].includes(e.stage)||file.getName()!==study1FormalTxnName_(prefix,e)||
    Object.keys(e).sort().join(',')!=='action,atUtc,key,mac,prefix,prepareMac,schema,stage,subjects'||
    !Array.isArray(e.subjects)||e.subjects.length<1||e.subjects.length>2||
    new Set(e.subjects.map(x=>x.kind+':'+x.id)).size!==e.subjects.length||
    e.subjects.some(x=>!x||Object.keys(x).sort().join(',')!=='after,before,id,kind'||
     !['RESERVATION','CONSENT'].includes(x.kind)||typeof x.id!=='string'||
     !/^[A-Za-z0-9_-]{8,80}$/.test(x.id)||!hex(x.before)||(x.after!==null&&!hex(x.after)))||
    (e.stage==='PREPARED'?e.prepareMac!==null:!hex(e.prepareMac)||e.subjects.some(x=>x.after===null)))
  throw Error('E1_TXN_FILE_EVIDENCE_INVALID');
 study1BindingUtc_(e.atUtc);
 return e;
}
function study1FormalTxnScan_(applicantId,lock){
 study1FormalTxnLock_(lock);
 const prefix=study1FormalTxnPrefix_(applicantId),folder=study1EConsentFolder_();
 const iterator=folder.searchFiles("title contains '"+prefix+"' and trashed = false");
 const map=new Map();let count=0;
 while(iterator.hasNext()){
  if(++count>400)throw Error('E1_TXN_EVIDENCE_LIMIT_REVIEW_REQUIRED');
  const f=iterator.next();
  if(!f.getName().startsWith(prefix))throw Error('E1_TXN_SEARCH_MISMATCH');
  const e=study1FormalTxnReadFile_(f,prefix);
  const pair=map.get(e.key)||{};
  if(pair[e.stage])throw Error('E1_TXN_DUPLICATE_EVIDENCE');
  pair[e.stage]=e;map.set(e.key,pair);
 }
 for(const pair of map.values()){
  const p=pair.PREPARED,c=pair.COMMITTED;
  if(!p||c&&(c.prepareMac!==p.mac||c.action!==p.action||c.atUtc<p.atUtc||
     c.subjects.length!==p.subjects.length||
     c.subjects.some((x,i)=>x.id!==p.subjects[i].id||x.kind!==p.subjects[i].kind||
      x.before!==p.subjects[i].before||(p.subjects[i].after!==null&&x.after!==p.subjects[i].after))))
   throw Error('E1_TXN_CHAIN_INVALID');
 }
 study1FormalTxnLock_(lock);return {prefix,folder,map};
}
function study1FormalTxnStore_(folder,event,lock){
 study1FormalTxnLock_(lock);
 if(!study1FormalTxnEnabled_())throw Error('E1_TXN_EVIDENCE_NOT_APPROVED');
 const name=study1FormalTxnName_(event.prefix,event);
 if(folder.getFilesByName(name).hasNext())throw Error('E1_TXN_EVIDENCE_ALREADY_EXISTS');
 event.mac=study1FormalTxnMac_(event);
 const raw=JSON.stringify(event);
 const f=folder.createFile(Utilities.newBlob(raw,'application/json',name));
 // Never trash an uncertain write. A later read must adjudicate it.
 f.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.VIEW);
 if(JSON.stringify(study1FormalTxnReadFile_(f,event.prefix))!==raw)
  throw Error('E1_TXN_EVIDENCE_WRITEBACK_UNKNOWN');
 const it=folder.getFilesByName(name);
 if(!it.hasNext()||it.next().getId()!==f.getId()||it.hasNext())
  throw Error('E1_TXN_EVIDENCE_NOT_UNIQUE');
 study1FormalTxnLock_(lock);
 return event;
}
function study1FormalTxnSubject_(kind,id,before,after){
 return {kind,id,before:study1FormalTxnDigest_(before),
  after:after===undefined?null:study1FormalTxnDigest_(after)};
}
function study1FormalTxnPrepare_(applicantId,action,requestId,subjects,lock){
 if(!study1FormalTxnEnabled_())return null;
 study1FormalTxnLock_(lock);study1FormalKey_(requestId);
 const scan=study1FormalTxnScan_(applicantId,lock);
 const key=study1BindingHmac_(['E1_TXN_REQUEST_V1',applicantId,requestId]);
 if(scan.map.has(key)||[...scan.map.values()].some(p=>!p.COMMITTED))
  throw Error('E1_TXN_UNRESOLVED_OR_REPLAY_REQUIRES_OWNER');
 const event={schema:1,prefix:scan.prefix,key,action,stage:'PREPARED',
  atUtc:new Date().toISOString(),prepareMac:null,subjects};
 return study1FormalTxnStore_(scan.folder,event,lock);
}
function study1FormalTxnCurrentSubjects_(subjects,applicantId,snapshot,registry){
 return subjects.map(x=>{
  const rows=x.kind==='RESERVATION'?snapshot.reservations.rows:registry.records;
  const matches=rows.filter(r=>x.kind==='RESERVATION'?r[0]===x.id:r.id===x.id);
  if(matches.length>1||matches.some(r=>x.kind==='RESERVATION'?r[1]!==applicantId:
    !r.binding||r.binding.applicantId!==applicantId||r.channel!=='FORMAL_E1'||r.experiment!=='E1'))
   throw Error('E1_TXN_SUBJECT_BINDING_INVALID');
  return study1FormalTxnDigest_(matches.length?matches[0]:null);
 });
}
function study1FormalTxnCommit_(applicantId,prepared,subjects,lock){
 if(!prepared)return;
 study1FormalTxnLock_(lock);
 const scan=study1FormalTxnScan_(applicantId,lock),pair=scan.map.get(prepared.key);
 if(!pair||pair.COMMITTED||JSON.stringify(pair.PREPARED)!==JSON.stringify(prepared)||
    prepared.subjects.length!==subjects.length||
    subjects.some((x,i)=>x.kind!==prepared.subjects[i].kind||x.id!==prepared.subjects[i].id||
     x.before!==prepared.subjects[i].before||x.after===null||
     (prepared.subjects[i].after!==null&&x.after!==prepared.subjects[i].after)))
  throw Error('E1_TXN_PREPARED_EVIDENCE_CHANGED');
 const snapshot=study1FormalSnapshot_(),registry=study1EConsentRegistry_();
 study1FormalValidateSnapshot_(snapshot,new Date().toISOString());
 const current=study1FormalTxnCurrentSubjects_(subjects,applicantId,snapshot,registry);
 if(current.some((x,i)=>x!==subjects[i].after))
  throw Error('E1_TXN_ORIGINAL_READBACK_UNKNOWN');
 study1FormalTxnStore_(scan.folder,{schema:1,prefix:scan.prefix,key:prepared.key,
  action:prepared.action,stage:'COMMITTED',atUtc:new Date().toISOString(),
  prepareMac:prepared.mac,subjects},lock);
}
function study1FormalTxnObserve_(applicantId,lock,snapshot,registry){
 if(!study1FormalTxnEnabled_())return {mode:'NOT_APPROVED',events:[]};
 const scan=study1FormalTxnScan_(applicantId,lock),events=[];
 for(const pair of scan.map.values()){
  const p=pair.PREPARED,c=pair.COMMITTED;
  const current=study1FormalTxnCurrentSubjects_(c?c.subjects:p.subjects,applicantId,snapshot,registry);
  const observation=current.every((x,i)=>x===p.subjects[i].before)?'BEFORE_OBSERVED':
    current.every((x,i)=>x===(c?c.subjects[i].after:p.subjects[i].after))?'AFTER_OBSERVED':'PARTIAL_OR_CHANGED';
  events.push({eventKey:p.key.slice(0,24),action:p.action,preparedAtUtc:p.atUtc,
   committedAtUtc:c?c.atUtc:null,status:c?'COMMITTED_EVIDENCE':'UNKNOWN',
   currentObservation:observation,subjects:p.subjects.map(x=>({kind:x.kind,id:x.id}))});
 }
 return {mode:'APPROVED_EVIDENCE_ONLY',events};
}

/** P0-B original-source OWNER workspace. Read-only operations plus validated
 * slot change preview, not a second database or authorization to change Slots.
 * Exact current screening policy scopes E1; unknown historical versions are
 * not guessed. The private data-use gate is independent of intake OPEN. */
function study1OwnerE1WorkspaceGate_(){
 study1AdminOwnerRequired_();
 const p=PropertiesService.getScriptProperties();
 if(p.getProperty('STUDY1_PARTICIPANT_DATA_USE_APPROVED')!=='true'||
    p.getProperty('STUDY1_ECONSENT_LIVE_SHEETS_APPROVED')!=='true')
  throw Error('E1_WORKSPACE_DATA_NOT_APPROVED');
}
function study1OwnerE1WorkspaceRead_(lock){
 if(!lock||lock.hasLock()!==true)throw Error('E1_WORKSPACE_LOCK_REQUIRED');
 study1OwnerE1WorkspaceGate_();
 const p=PropertiesService.getScriptProperties();
 const policy=study1ParticipantVerifiedPolicy_(study1ParticipantRecPolicy_());
 const read=()=>{
  const personalId=study1BindingSheetId_('applicants'),personal=SpreadsheetApp.openById(personalId);
  if(!personal||personal.getId()!==personalId)throw Error('E1_WORKSPACE_PERSONAL_SOURCE_MISMATCH');
  return {apps:bookingReadOnlyTab_(personal,'Applicants',STUDY1_BINDING_SCHEMA_.applicants),
   screenings:bookingReadOnlyTab_(personal,'Screenings',STUDY1_BINDING_SCHEMA_.screenings),
   booking:study1FormalSnapshot_(),consent:study1EConsentRegistry_(),
   notices:study1OwnerE1NoticeSnapshot_(),
   raw:p.getProperty('STUDY1_E1_SLOT_REGISTRY_V1'),mac:p.getProperty('STUDY1_E1_SLOT_REGISTRY_HMAC'),
   approved:p.getProperty('STUDY1_E1_SLOT_REGISTRY_APPROVED')};
 };
 const first=read(),second=read();
 if(JSON.stringify(first)!==JSON.stringify(second)||lock.hasLock()!==true)
  throw Error('E1_WORKSPACE_SOURCE_CHANGED');
 const now=new Date().toISOString();
 study1FormalValidateSnapshot_(first.booking,now);
 if(first.approved!=='true'||typeof first.raw!=='string'||first.raw.length>200000||
    study1BindingHmac_(['STUDY1_E1_SLOT_REGISTRY_V1',first.raw])!==first.mac)
  throw Error('E1_WORKSPACE_SLOT_REGISTRY_NOT_VERIFIED');
 const registry=JSON.parse(first.raw);
 if(!Array.isArray(registry)||new Set(registry.map(x=>x.slotId)).size!==registry.length||
    registry.some(x=>!x||!['E1','E2'].includes(x.experiment)))
  throw Error('E1_WORKSPACE_SLOT_REGISTRY_INVALID');
 const e1=new Set(registry.filter(x=>x.experiment==='E1').map(x=>x.slotId));
 const slots=first.booking.slots.rows.filter(r=>e1.has(r[0]));
 if(slots.length!==e1.size)throw Error('E1_WORKSPACE_SLOT_MISSING');
 for(const row of slots)study1WizardSlotAuthority_({experiment:'E1',slotId:row[0]},row,lock);
 const appIds=new Set(),screenIds=new Set(),byApp=new Map();
 for(const a of first.apps.rows){
  study1BindingId_(a[0]);
  if(appIds.has(a[0]))throw Error('E1_WORKSPACE_APPLICANT_DUPLICATE');
  appIds.add(a[0]);
 }
 for(const s of first.screenings.rows){
  study1BindingId_(s[0]);
  if(screenIds.has(s[0])||!appIds.has(s[1]))throw Error('E1_WORKSPACE_SCREENING_MISMATCH');
  screenIds.add(s[0]);
  const rows=byApp.get(s[1])||[];rows.push(s);byApp.set(s[1],rows);
 }
 const formal=first.consent.records.filter(x=>x&&x.channel==='FORMAL_E1'&&x.experiment==='E1');
 const notices=study1OwnerE1NoticeProject_(first.consent,first.notices.rows,lock);
 const bookings=study1OwnerE1BookingProject_(first.consent,first.booking,now,lock);
 const byNotice=new Map(notices.records.map(x=>[x.id,x])),byBooking=new Map(bookings.records.map(x=>[x.id,x]));
 const rows=[];let excluded=0;
 for(const app of first.apps.rows){
  const screens=byApp.get(app[0])||[];
  if(screens.length!==1||screens[0][2]!==policy.screeningVersion||screens[0][5]!=='PARTICIPANT_SELF_REPORT'){
   excluded++;continue;
  }
  const screening=screens[0];
  study1BindingUtc_(screening[4]);
  if(typeof app[1]!=='string'||!['PENDING_EMAIL','EMAIL_VERIFIED'].includes(app[6])||
     !['ELIGIBLE','INELIGIBLE'].includes(screening[3])){excluded++;continue;}
  const related=first.booking.reservations.rows.filter(r=>r[1]===app[0]&&e1.has(r[2]));
  const cs=formal.filter(x=>x.binding&&x.binding.applicantId===app[0]);
  const c=cs.length===1?cs[0]:null;
  const consentMatches=c&&related.some(r=>r[0]===c.binding.reservationId&&r[2]===c.binding.slotId);
  const active=related.filter(r=>['HELD','CONFIRMED','WAITLISTED'].includes(study1FormalEffectiveStatus_(r,now)));
  const recent=related.slice().sort((a,z)=>String(z[9]||z[6]).localeCompare(String(a[9]||a[6])))[0];
  const displayed=active.length===1?active[0]:active.length===0?recent:null;
  rows.push({applicantId:app[0],name:app[1],applicationStatus:app[6],eligibility:screening[3],
   screenedAtUtc:screening[4],bookingStatus:active.length>1?'UNKNOWN':displayed?study1FormalEffectiveStatus_(displayed,now):'NOT_BOOKED',
   slotId:displayed?displayed[2]:null,consentState:cs.length===0?'NOT_ISSUED':consentMatches?c.state:'UNKNOWN',
   consentBookingStatus:consentMatches?(byBooking.get(c.id)||{}).bookingStatus||'UNKNOWN':'NOT_VERIFIED',
   noticeStatus:cs.length===0?'NOT_QUEUED':consentMatches?(byNotice.get(c.id)||{}).noticeStatus||'UNKNOWN':'SOURCE_MISMATCH'});
 }
 const calendar=slots.map(r=>{
  study1BindingUtc_(r[1]);study1BindingUtc_(r[2]);
  const linked=first.booking.reservations.rows.filter(x=>x[2]===r[0]);
  const held=linked.filter(x=>study1FormalEffectiveStatus_(x,now)==='HELD').length;
  const confirmed=linked.filter(x=>x[3]==='CONFIRMED').length;
  return {slotId:r[0],startAtUtc:r[1],endAtUtc:r[2],capacity:r[3],locationCode:r[4],status:r[5],
   held,confirmed,waitlisted:linked.filter(x=>x[3]==='WAITLISTED').length,
   remaining:r[3]-held-confirmed,historicalCount:linked.length};
 });
 study1OwnerE1WorkspaceGate_();
 if(lock.hasLock()!==true)throw Error('E1_WORKSPACE_LOCK_LOST');
 return {first,rows,calendar,excluded,now,revision:study1BindingHmac_(['E1_WORKSPACE_REV_V1',JSON.stringify(first)])};
}
function study1OwnerE1Workspace(input){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 study1AdminOwnerRequired_();
 study1OwnerE1WorkspaceGate_();
 if(!input||Object.keys(input).sort().join(',')!=='eligibility,offset,query,slotId,status'||
    typeof input.query!=='string'||input.query.length>80||!Number.isSafeInteger(input.offset)||input.offset<0||
    !['ALL','PENDING_EMAIL','EMAIL_VERIFIED'].includes(input.status)||
    !['ALL','ELIGIBLE','INELIGIBLE'].includes(input.eligibility)||
    typeof input.slotId!=='string'||input.slotId.length>64)throw Error('E1_WORKSPACE_FILTER_INVALID');
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(10000)!==true)throw Error('E1_WORKSPACE_BUSY');
 try{
  const x=study1OwnerE1WorkspaceRead_(lock),query=input.query.trim().toLowerCase();
  const found=x.rows.filter(r=>(input.status==='ALL'||r.applicationStatus===input.status)&&
   (input.eligibility==='ALL'||r.eligibility===input.eligibility)&&(!input.slotId||r.slotId===input.slotId)&&
   (!query||r.applicantId.toLowerCase().includes(query)||r.name.toLowerCase().includes(query)))
   .sort((a,z)=>String(z.screenedAtUtc).localeCompare(String(a.screenedAtUtc))||a.applicantId.localeCompare(z.applicantId));
  return {mode:'OWNER_E1_WORKSPACE',experiment:'E1',revision:x.revision,asOfUtc:x.now,
   total:found.length,excluded:x.excluded,offset:input.offset,pageSize:50,
   participants:found.slice(input.offset,input.offset+50),slots:x.calendar,
   actionAuthority:'READ_AND_PREVIEW_ONLY'};
 }finally{lock.releaseLock();}
}
/** Same draft validation for preview and actual approved save. */
function study1OwnerE1SlotDraftInput_(input){
 if(!input||Object.keys(input).sort().join(',')!=='action,capacity,endAtUtc,locationCode,revision,slotId,startAtUtc'||
    !['CREATE','UPDATE','CLOSE','OPEN'].includes(input.action)||!/^[a-f0-9]{64}$/.test(input.revision||'')||
    !Number.isSafeInteger(input.capacity)||input.capacity<1||
    typeof input.locationCode!=='string'||input.locationCode.length<1||input.locationCode.length>80||
    input.locationCode!==input.locationCode.trim()||/^[=+\-@]/.test(input.locationCode)||/[<>\x00-\x1f]/.test(input.locationCode))
  throw Error('E1_SLOT_DRAFT_INVALID');
 study1BindingId_(input.slotId);
 const start=study1BindingUtc_(input.startAtUtc),end=study1BindingUtc_(input.endAtUtc);
 if(end<=start)throw Error('E1_SLOT_DRAFT_TIME_INVALID');
 return {action:input.action,revision:input.revision,slotId:input.slotId,
  startAtUtc:input.startAtUtc,endAtUtc:input.endAtUtc,capacity:input.capacity,locationCode:input.locationCode};
}
function study1OwnerE1SlotDraftProject_(input,x){
 if(x.revision!==input.revision)throw Error('E1_SLOT_DRAFT_SOURCE_CHANGED');
 const existing=x.calendar.find(r=>r.slotId===input.slotId);
 const original=x.first.booking.slots.rows.find(r=>r[0]===input.slotId);
 if(input.action==='CREATE'?(original||study1BindingUtc_(input.startAtUtc)<=Date.now()):!existing)
  throw Error('E1_SLOT_DRAFT_SCOPE_INVALID');
 if(existing&&(!['OPEN','CLOSED'].includes(existing.status)||input.capacity<existing.held+existing.confirmed))
  throw Error('E1_SLOT_DRAFT_CAPACITY_OR_STATE_INVALID');
 if(existing&&existing.historicalCount>0&&(input.startAtUtc!==existing.startAtUtc||
   input.endAtUtc!==existing.endAtUtc||input.locationCode!==existing.locationCode))
  throw Error('E1_SLOT_DRAFT_HISTORY_CONFLICT');
 if(['CLOSE','OPEN'].includes(input.action)&&(input.capacity!==existing.capacity||
   input.startAtUtc!==existing.startAtUtc||input.endAtUtc!==existing.endAtUtc||input.locationCode!==existing.locationCode))
  throw Error('E1_SLOT_DRAFT_CLOSE_ONLY');
 if(input.action==='OPEN'&&(existing.status!=='CLOSED'||study1BindingUtc_(input.startAtUtc)<=Date.now()))
  throw Error('E1_SLOT_DRAFT_OPEN_INVALID');
 const after={slotId:input.slotId,startAtUtc:input.startAtUtc,endAtUtc:input.endAtUtc,
  locationCode:input.locationCode,capacity:input.capacity,status:input.action==='OPEN'?'OPEN':
   input.action==='CLOSE'?'CLOSED':existing?existing.status:'CLOSED'};
 const proposal=study1BindingHmac_(['E1_SLOT_CHANGE_PROPOSAL_V1',JSON.stringify(input),JSON.stringify(after)]);
 return {mode:'E1_SLOT_CHANGE_PREVIEW',revision:x.revision,action:input.action,
  before:existing||null,after,preservesReservations:true,requiresPiApproval:true,
  actionAuthority:'NONE',written:false,proposal};
}
function study1OwnerE1SlotApproval_(proposal){
 // Independently provisioned by authorized administrator against actual PI
 // approval. This RPC never sets approval, accepts an attestation checkbox as
 // PI authority, or exposes its HMAC key. The hash pins the exact draft and
 // source revision, not an unbounded slot permission.
 const p=PropertiesService.getScriptProperties();
 if(p.getProperty('STUDY1_E1_SLOT_MANAGEMENT_APPROVED')!=='true'||
    p.getProperty('OPEN')!=='false'||p.getProperty('CONSENT_READY')!=='false'||
    p.getProperty('FORMAL_READY')==='true'||p.getProperty('LIVE_INTAKE_ENABLED')==='true')
  return null;
 const raw=p.getProperty('STUDY1_E1_SLOT_CHANGE_APPROVAL_V1');
 if(typeof raw!=='string'||raw.length>2000)return null;
 let a;try{a=JSON.parse(raw);}catch(_){return null;}
 if(!a||Object.keys(a).sort().join(',')!=='approvalRef,expiresAtUtc,proposal,reason'||
    a.proposal!==proposal.proposal||
    typeof a.approvalRef!=='string'||!/^[A-Za-z0-9_.:/-]{8,120}$/.test(a.approvalRef)||
    typeof a.reason!=='string'||!a.reason.trim()||a.reason.length>300||
    /[<>\x00-\x1f]/.test(a.reason))return null;
 let expires;try{expires=study1BindingUtc_(a.expiresAtUtc);}catch(_){return null;}
 if(expires<=Date.now()||expires>Date.now()+24*3600000)return null;
 return {raw,approvalRef:a.approvalRef,reason:a.reason,expiresAtUtc:a.expiresAtUtc};
}
function study1OwnerE1SlotCanSave_(project){
 // A closed slot cannot service the existing HOLD/CLAIM paths. Do not silently
 // cancel, move or strand outstanding holds or waitlist entries.
 if(project.action==='CLOSE'&&project.before&&(project.before.held||project.before.waitlisted))
  return false;
 if(project.before&&project.before.status===project.after.status&&
    project.before.capacity===project.after.capacity&&project.before.startAtUtc===project.after.startAtUtc&&
    project.before.endAtUtc===project.after.endAtUtc&&project.before.locationCode===project.after.locationCode)
  return false;
 return true;
}
function study1OwnerE1SlotChangePreview(input){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 study1AdminOwnerRequired_();
 study1OwnerE1WorkspaceGate_();
 const q=study1OwnerE1SlotDraftInput_(input);
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(10000)!==true)throw Error('E1_WORKSPACE_BUSY');
 try{
  const project=study1OwnerE1SlotDraftProject_(q,study1OwnerE1WorkspaceRead_(lock));
  const approval=study1OwnerE1SlotApproval_(project);
  return {...project,canCommit:!!approval&&study1OwnerE1SlotCanSave_(project),
   approvalRef:approval?approval.approvalRef:null,approvalReason:approval?approval.reason:null};
 }finally{lock.releaseLock();}
}
var STUDY1_E1_SLOT_AUDIT_HEADERS_=Object.freeze(['event_id','occurred_at_utc','actor_type','actor_id','action','target_type','target_id','result','request_id']);
function study1OwnerE1SlotAuditRead_(book){
 return bookingReadOnlyTab_(book,'AuditLogs',STUDY1_E1_SLOT_AUDIT_HEADERS_);
}
function study1OwnerE1SlotAuditPending_(audit){
 const events=new Map(),ids=new Set();
 for(const row of audit.rows){
  if(typeof row[0]!=='string'||!row[0]||ids.has(row[0]))throw Error('E1_SLOT_AUDIT_INVALID');
  ids.add(row[0]);
  if(!['E1_SLOT_CHANGE_PREPARED','E1_SLOT_CHANGE_COMMITTED'].includes(row[4]))continue;
  const stage=row[4].endsWith('PREPARED')?'PREPARED':'COMMITTED';
  if(row[5]!=='SLOT'||!/^[a-f0-9]{64}$/.test(row[8]||'')||
     row[0]!=='AUD_'+study1BindingHmac_(['E1_SLOT_AUDIT_EVENT_V1',row[8],stage]).slice(0,40))
   throw Error('E1_SLOT_AUDIT_INVALID');
  const entry=events.get(row[8])||{};
  if(entry[stage]||stage==='COMMITTED'&&!entry.PREPARED||stage==='COMMITTED'&&
     (entry.PREPARED[6]!==row[6]||entry.PREPARED[3]!==row[3]))throw Error('E1_SLOT_AUDIT_INVALID');
  entry[stage]=row;events.set(row[8],entry);
 }
 if([...events.values()].some(x=>!x.COMMITTED))
  throw Error('E1_SLOT_AUDIT_UNRESOLVED_REVIEW_REQUIRED');
 return events;
}
function study1OwnerE1SlotAuditAppend_(book,before,row){
 const now=study1OwnerE1SlotAuditRead_(book);
 if(!bookingReadOnlySameTab_(now,before))throw Error('E1_SLOT_AUDIT_CHANGED');
 book.getSheetByName('AuditLogs').appendRow(row);
 SpreadsheetApp.flush();
 const expected={headers:before.headers,rows:before.rows.concat([row])};
 const after=study1OwnerE1SlotAuditRead_(book);
 if(!bookingReadOnlySameTab_(after,expected))throw Error('E1_SLOT_AUDIT_READBACK_FAILED');
 return after;
}
/** Approved slot management: original Slots, existing signed registry and
 * ORIGINAL AuditLogs only. Sheets/Properties are not a database transaction.
 * Before any slot write append a traceable PREPARED audit record, then confirm
 * original Slots + Reservations + registry, and append COMMITTED last.
 * No automatic retry or rollback. External writers remain an operational
 * limitation, and the intake must be closed during this initial MVP operation.
 */
function study1OwnerE1SlotChangeCommit(input){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 study1AdminOwnerRequired_();
 study1OwnerE1WorkspaceGate_();
 if(!input||Object.keys(input).sort().join(',')!=='confirmed,proposal,request'||input.confirmed!==true||
    !/^[a-f0-9]{64}$/.test(input.proposal||''))throw Error('E1_SLOT_COMMIT_INVALID');
 const q=study1OwnerE1SlotDraftInput_(input.request);
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(10000)!==true)throw Error('E1_WORKSPACE_BUSY');
 let attempted=false;
 try{
  const before=study1OwnerE1WorkspaceRead_(lock);
  const project=study1OwnerE1SlotDraftProject_(q,before);
  const approval=study1OwnerE1SlotApproval_(project);
  if(input.proposal!==project.proposal||!approval)throw Error('E1_SLOT_PI_APPROVAL_REQUIRED');
  if(!study1OwnerE1SlotCanSave_(project))throw Error('E1_SLOT_CHANGE_NOT_SAFE_OR_NO_CHANGE');
  const p=PropertiesService.getScriptProperties();
  const book=SpreadsheetApp.openById(study1BindingSheetId_('slots'));
  if(!book||book.getId()!==study1BindingSheetId_('slots'))throw Error('E1_SLOT_SOURCE_MISMATCH');
  const audit=study1OwnerE1SlotAuditRead_(book),events=study1OwnerE1SlotAuditPending_(audit);
  if(events.has(project.proposal))throw Error('E1_SLOT_CHANGE_ALREADY_RECORDED');
  const original=before.first.booking.slots;
  const at=original.rows.findIndex(r=>r[0]===q.slotId);
  const old=at<0?null:original.rows[at];
  const actor=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  if(!actor||/^[=+\-@]/.test(actor))throw Error('E1_SLOT_OWNER_REQUIRED');
  const now=new Date().toISOString();
  const afterRow=[q.slotId,q.startAtUtc,q.endAtUtc,q.capacity,q.locationCode,project.after.status,old?old[6]:actor,now];
  const rows=original.rows.map(r=>r.slice());
  if(at<0)rows.push(afterRow);else rows[at]=afterRow;
  const expected={slots:{headers:original.headers,rows},reservations:before.first.booking.reservations};
  study1FormalValidateSnapshot_(expected,now);
  const registry=JSON.parse(before.first.raw);
  // Preserve every other original registry entry byte-for-value, including E2.
  // Refuse to propagate preexisting unrelated stale or missing pins.
  for(const e of registry){
   const prior=original.rows.find(r=>r[0]===e.slotId);
   if(!prior||e.slotRowSha256!==study1BindingHmac_(['STUDY1_E1_ORIGINAL_SLOT_ROW_V1',...prior]))
    throw Error('E1_SLOT_REGISTRY_OTHER_PIN_STALE');
  }
  const newEntry={experiment:'E1',slotId:q.slotId,slotRowSha256:study1BindingHmac_(['STUDY1_E1_ORIGINAL_SLOT_ROW_V1',...afterRow])};
  const index=registry.findIndex(e=>e.slotId===q.slotId);
  if(at<0){if(index>=0)throw Error('E1_SLOT_REGISTRY_SOURCE_CONFLICT');registry.push(newEntry);}
  else{if(index<0||registry[index].experiment!=='E1')throw Error('E1_SLOT_REGISTRY_SOURCE_CONFLICT');registry[index]=newEntry;}
  const raw=JSON.stringify(registry);
  // All fields are restricted ASCII; conservative cap below GAS property quota.
  if(raw.length>8000||registry.length>10000)throw Error('E1_SLOT_REGISTRY_CAPACITY_REVIEW_REQUIRED');
  const mac=study1BindingHmac_(['STUDY1_E1_SLOT_REGISTRY_V1',raw]);
  const auditRow=stage=>['AUD_'+study1BindingHmac_(['E1_SLOT_AUDIT_EVENT_V1',project.proposal,stage]).slice(0,40),
    new Date().toISOString(),'OWNER',actor,'E1_SLOT_CHANGE_'+stage,'SLOT',q.slotId,
    JSON.stringify({status:stage,operation:q.action,approvalRef:approval.approvalRef,reason:approval.reason,
      before:old,after:afterRow}),project.proposal];
  // Check before first durable mutation. Recheck whole original sources after
  // preparing, not just the selected row. A change leaves an unresolved audit.
  if(study1OwnerE1WorkspaceRead_(lock).revision!==before.revision||
     (study1OwnerE1SlotApproval_(project)||{}).raw!==approval.raw)
   throw Error('E1_SLOT_COMMIT_SOURCE_CHANGED');
  attempted=true;
  const prepared=study1OwnerE1SlotAuditAppend_(book,audit,auditRow('PREPARED'));
  if(study1OwnerE1WorkspaceRead_(lock).revision!==before.revision||
     (study1OwnerE1SlotApproval_(project)||{}).raw!==approval.raw)
   throw Error('E1_SLOT_COMMIT_SOURCE_CHANGED');
  const tab=book.getSheetByName('Slots');
  if(!bookingReadOnlySameTab_(bookingReadOnlyTab_(book,'Slots',BOOKING_SLOT_HEADERS_),original)||
     !bookingReadOnlySameTab_(study1OwnerE1SlotAuditRead_(book),prepared)||lock.hasLock()!==true)
   throw Error('E1_SLOT_COMMIT_SOURCE_CHANGED');
  if(at<0)tab.appendRow(afterRow);else tab.getRange(at+2,1,1,8).setValues([afterRow]);
  SpreadsheetApp.flush();
  const saved=study1FormalSnapshot_();
  const matches=s=>bookingReadOnlySameTab_(s.slots,expected.slots)&&
    bookingReadOnlySameTab_(s.reservations,expected.reservations);
  if(!matches(saved)||p.getProperty('STUDY1_E1_SLOT_REGISTRY_V1')!==before.first.raw||
     p.getProperty('STUDY1_E1_SLOT_REGISTRY_HMAC')!==before.first.mac||
     (study1OwnerE1SlotApproval_(project)||{}).raw!==approval.raw||lock.hasLock()!==true)
   throw Error('E1_SLOT_COMMIT_READBACK_FAILED');
  p.setProperties({STUDY1_E1_SLOT_REGISTRY_V1:raw,STUDY1_E1_SLOT_REGISTRY_HMAC:mac},false);
  if(p.getProperty('STUDY1_E1_SLOT_REGISTRY_V1')!==raw||
     p.getProperty('STUDY1_E1_SLOT_REGISTRY_HMAC')!==mac||
     !matches(study1FormalSnapshot_())||lock.hasLock()!==true)
   throw Error('E1_SLOT_COMMIT_READBACK_FAILED');
  study1WizardSlotAuthority_({experiment:'E1',slotId:q.slotId},afterRow,lock);
  study1OwnerE1SlotAuditAppend_(book,prepared,auditRow('COMMITTED'));
  return {mode:'E1_SLOT_CHANGE_COMMITTED',proposal:project.proposal,action:q.action,
   slotId:q.slotId,status:project.after.status,capacity:q.capacity,written:true,
   reservationsPreserved:true,registryReadback:true,auditReadback:true};
 }catch(e){
  if(attempted)throw Error('E1_SLOT_CHANGE_UNKNOWN_REVIEW_REQUIRED');
  throw e;
 }finally{lock.releaseLock();}
}

/** Original Index source, not sandbox text and not an alternate public site.
 * Only extract plain headline/intro text from the current bundled homepage.
 * No writes / no HTML submitted by the owner / no publication authority. */
function study1OwnerE1RecruitmentDraft(){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 study1AdminOwnerRequired_();
 const html=HtmlService.createHtmlOutputFromFile('Index').getContent();
 const hero=html.match(/<section id="home" class="hero">([\s\S]*?)<div class="actions">/g);
 if(!hero||hero.length!==1)throw Error('E1_RECRUITMENT_ORIGINAL_SOURCE_MISMATCH');
 const parts=hero[0].match(/<h1>([\s\S]*?)<\/h1><p>([\s\S]*?)<\/p>/);
 if(!parts)throw Error('E1_RECRUITMENT_ORIGINAL_SOURCE_MISMATCH');
 const plain=value=>{
  const text=value.replace(/<br\s*\/?\s*>/gi,'').replace(/<\/?span>/g,'').trim();
  if(!text||/[<>\x00-\x1f]/.test(text))throw Error('E1_RECRUITMENT_ORIGINAL_TEXT_INVALID');
  return text;
 };
 return {mode:'OWNER_RECRUITMENT_DRAFT',source:'gas/Index.html',
  revision:study1BindingHmac_(['E1_RECRUITMENT_INDEX_V1',html]),
  title:plain(parts[1]),intro:plain(parts[2]),open:false,
  actionAuthority:'DRAFT_ONLY'};
}
