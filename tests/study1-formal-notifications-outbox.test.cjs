'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const intake=fs.readFileSync(path.join(__dirname,'../gas/Study1ParticipantIntake.js'),'utf8');
const sign=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
function setup(opts={}){
 const rows=[];let sends=0,pdfReads=0;
 const sourceSha='c'.repeat(64),signedSha='a'.repeat(64),
  signatureSha='d'.repeat(64),signedAt='2026-11-11T10:00:59.000Z';
 const entry={id:'CNS_1234567890',channel:'FORMAL_E1',experiment:'E1',
  researcherPresigned:true,state:opts.consentState||'CONFIRMED',
  signedPdf:{id:'SIGNED_PDF_ORIGINAL',sha:signedSha},
  participantSignedPdf:{id:'SIGNED_PDF_ORIGINAL',sha:signedSha},
  signature:{id:'sig',sha:signatureSha},confirmation:{id:'conf',sha:'e'.repeat(64)},
  documentSha:sourceSha,documentVersion:'V1',
  binding:{applicantId:'APP_1234567890',screeningId:'SCR_1234567890',
   challengeId:'CHL_1234567890',reservationId:'RSV_1234567890',
   slotId:'SLT_1234567890',experiment:'E1',
   documentSha:sourceSha,documentVersion:'V1',digest:'KNOWN_DIGEST'}};
 const reservation=[entry.binding.reservationId,entry.binding.applicantId,
  entry.binding.slotId,opts.bookingState||'CONFIRMED','2026-11-11T12:00:00.000Z',
  'key','2026-11-11T10:00:00.000Z','2026-11-11T10:01:00.000Z','',
  '2026-11-11T10:01:00.000Z'];
 const tab={getRange:(n,c,l,w)=>{
  assert.equal(c,1);assert.equal(l,1);assert.equal(w,9);
  return {getValues:()=>[rows[n-2].slice()],
   setValues:v=>{rows[n-2]=v[0].slice();}};
 }};
 const scope={
  LockService:{getScriptLock:()=>({
   tryLock:()=>true,hasLock:()=>true,releaseLock:()=>{}
  })},
  MailApp:{sendEmail:()=>{sends++;if(opts.sendError)throw Error('timeout');}},
  SpreadsheetApp:{openById:()=>({}),flush:()=>{}},
  study1ParticipantMailGate_:()=>true,study1FormalConsentGate_:()=>true,
  study1BindingId_:x=>{if(!x)throw Error('id');return x;},
  study1BindingEmail_:x=>String(x).trim().toLowerCase(),
  study1EConsentRegistry_:()=>({records:opts.duplicateConsent?
   [entry,{...entry,id:'CNS_OTHER_1234567890'}]:[entry]}),
  study1BindingDigest_:()=> 'KNOWN_DIGEST',
  study1PdfTaipeiDate_:()=> '2026/11/11',
  study1EConsentEvent_:(_,__,kind)=>({data:kind==='SIGNATURE'?{
   signedPdfSha256:opts.forgedEvent?'f'.repeat(64):signedSha,
   serverSignedAt:opts.signatureAfterBooking?
    '2026-11-11T10:02:00.000Z':signedAt,
   taipeiDate:'2026/11/11'}:{
   mode:'RESEARCHER_PRESIGNED_SOURCE',
   researcherSignedSourceSha256:sourceSha,signatureHash:signatureSha,
   participantSignedPdfSha256:signedSha,researcherSignedPdfSha256:signedSha
  }}),
  study1EConsentSignedPdfRead_:()=>{
   pdfReads++;if(opts.pdfTampered)throw Error('SIGNED_PDF_SHA_OR_ACL_CHANGED');
   return Array(200).fill(37);
  },
  study1SelfReportedAuthority_:()=>({
   verified:true,experiment:'E1',email:opts.email||'person@example.org'}),
  study1FormalSnapshot_:()=>({reservations:{rows:[reservation]}}),
  study1FormalValidateSnapshot_:()=>true,
  study1BindingSheetId_:()=> 'ORIGINAL_OPERATIONS',
  study1WizardTable_:(_,name,headers)=>{
   assert.equal(name,'Notifications');assert.equal(headers.length,9);
   return {tab,n:rows.length+1,headers};
  },
  study1WizardLookup_:(_,col,val)=>rows.map((r,i)=>
   r[col-1]===val?i+2:null).filter(Boolean),
  study1WizardAppend_:(_,row)=>{if(opts.appendError)throw Error('append');
   rows.push(row.slice());},
  study1BindingHmac_:()=> 'a'.repeat(64)
 };
 vm.createContext(scope);vm.runInContext(intake,scope);
 // GAS file declarations overwrite injected test doubles during evaluation.
 // Restore only the mail gate in this isolated harness; production gate stays intact.
 scope.study1ParticipantMailGate_=()=>true;
 return {scope,rows,entry,get sends(){return sends;},get pdfReads(){return pdfReads;}};
}
test('confirmed E1 writes a durable notification before one MailApp attempt',()=>{
 const f=setup(),res=f.scope.study1ParticipantBookingNotice_('person@example.org',f.entry.id);
 assert.equal(res.status,'PROVIDER_ACCEPTED');
 assert.equal(res.attempted,true);assert.equal(f.sends,1);assert.equal(f.pdfReads,1);
 assert.equal(f.rows.length,1);
 assert.equal(f.rows[0][4],'PROVIDER_ACCEPTED');
 assert.equal(f.rows[0][3],'E1_RESERVATION_CONFIRMED');
 assert.ok(f.rows[0][7].startsWith('20'));
});
test('repeated confirmation cannot send the same notification twice',()=>{
 const f=setup();
 f.scope.study1ParticipantBookingNotice_('person@example.org',f.entry.id);
 const again=f.scope.study1ParticipantBookingNotice_('person@example.org',f.entry.id);
 assert.equal(again.attempted,false);assert.equal(again.status,'PROVIDER_ACCEPTED');
 assert.equal(f.sends,1);assert.equal(f.rows.length,1);
});
test('MailApp timeout remains UNKNOWN without automatic retries',()=>{
 const f=setup({sendError:true});
 assert.equal(f.scope.study1ParticipantBookingNotice_('person@example.org',f.entry.id).status,'UNKNOWN');
 assert.equal(f.rows[0][8],'MAIL_PROVIDER_OUTCOME_UNKNOWN');
 assert.equal(f.scope.study1ParticipantBookingNotice_('person@example.org',f.entry.id).attempted,false);
 assert.equal(f.sends,1);
});
test('unconfirmed original reservation rejects mail and outbox write',()=>{
 const f=setup({bookingState:'HELD'});
 assert.throws(()=>f.scope.study1ParticipantBookingNotice_('person@example.org',f.entry.id),/NOT_CONFIRMED/);
 assert.equal(f.sends,0);assert.equal(f.rows.length,0);
});
test('wrong original OTP email rejects mail and outbox write',()=>{
 const f=setup({email:'other@example.org'});
 assert.throws(()=>f.scope.study1ParticipantBookingNotice_('person@example.org',f.entry.id),/EMAIL_CHANGED/);
 assert.equal(f.sends,0);assert.equal(f.rows.length,0);
});
test('unconfirmed signed PDF rejects mail and outbox write',()=>{
 const f=setup({consentState:'SIGNED'});
 assert.throws(()=>f.scope.study1ParticipantBookingNotice_('person@example.org',f.entry.id),/SIGNED_CONSENT_REQUIRED/);
 assert.equal(f.sends,0);assert.equal(f.rows.length,0);
});
test('an uncertain append cannot trigger external email',()=>{
 const f=setup({appendError:true});
 assert.throws(()=>f.scope.study1ParticipantBookingNotice_('person@example.org',f.entry.id),/append/);
 assert.equal(f.sends,0);assert.equal(f.rows.length,0);
});
test('changed private signed PDF SHA/ACL and forged SIGNATURE event fail before any outbox or MailApp',()=>{
 for(const opts of [{pdfTampered:true},{forgedEvent:true}]){
  const f=setup(opts);
  assert.throws(()=>f.scope.study1ParticipantBookingNotice_('person@example.org',f.entry.id),
   /SIGNED_PDF_SHA_OR_ACL_CHANGED|E1_NOTICE_SIGNED_PDF_EVIDENCE_CHANGED/);
  assert.equal(f.sends,0);assert.equal(f.rows.length,0);
 }
});
test('wrong final PDF identity and binding digest never issue a confirmation email',()=>{
 for(const change of [
  x=>{x.participantSignedPdf={id:'OTHER_PDF',sha:x.signedPdf.sha};},
  x=>{x.binding.digest='FORGED';},
  x=>{x.binding.documentVersion='OTHER_VERSION';}
 ]){
  const f=setup();change(f.entry);
  assert.throws(()=>f.scope.study1ParticipantBookingNotice_('person@example.org',f.entry.id),
   /E1_NOTICE_SIGNED_PDF_EVIDENCE_CHANGED/);
  assert.equal(f.sends,0);assert.equal(f.rows.length,0);
 }
});
test('booking confirmed before the signed PDF or duplicate consent binding must never send',()=>{
 for(const opts of [{signatureAfterBooking:true},{duplicateConsent:true}]){
  const f=setup(opts);
  assert.throws(()=>f.scope.study1ParticipantBookingNotice_('person@example.org',f.entry.id),
   /E1_NOTICE_ORIGINAL_BOOKING_CHRONOLOGY_INVALID|E1_NOTICE_RESERVATION_CONSENT_NOT_UNIQUE/);
  assert.equal(f.sends,0);assert.equal(f.rows.length,0);
 }
});
test('consent caller uses at-most-once outbox without claiming delivery',()=>{
 assert.match(sign,/study1ParticipantBookingNotice_\((?:contactEmail|verifiedContactEmail),changed\.id\)/);
 assert.ok(sign.includes('PROVIDER_ACCEPTED_NOT_DELIVERED'));
 assert.ok(!sign.includes("emailNotificationStatus='SENT'"));
});
