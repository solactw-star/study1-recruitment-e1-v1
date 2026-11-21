'use strict';

// V2 formal booking receipt and notice integration. The original public RPCs,
// OTP proof, gates, signed-PDF checks and once-only notification writer remain
// intact. Post-confirmation links have a separate, explicitly approved scope.
// This module never changes a live switch or a private policy.
const runtime=String.raw`

/** Confirmed-booking capabilities are separate from enrollment, PDF and the
 * read-only recovery OTP. Policy is PRIVATE and independently approved. */
function study1V2ManagementPolicy_(){
 study1V2FormalEntryRequired_();study1ParticipantMailGate_();study1FormalConsentGate_();study1FormalGate_();
 const p=PropertiesService.getScriptProperties(),raw=p.getProperty('STUDY1_E1_BOOKING_MANAGEMENT_POLICY_V1');
 if(p.getProperty('STUDY1_E1_BOOKING_MANAGEMENT_POLICY_APPROVED')!=='true'||typeof raw!=='string'||raw.length>300)throw Error('MANAGEMENT_UNAVAILABLE');
 const q=JSON.parse(raw);
 if(!q||Array.isArray(q)||Object.keys(q).sort().join(',')!=='cancelBeforeMinutes,cancelMode,linkMinutes,moveMode,version'||q.version!==1||
    !Number.isSafeInteger(q.linkMinutes)||q.linkMinutes<10||q.linkMinutes>4320||!Number.isSafeInteger(q.cancelBeforeMinutes)||q.cancelBeforeMinutes<1||q.cancelBeforeMinutes>10080||
    !['REQUEST_REVIEW','DIRECT_APPROVED'].includes(q.cancelMode)||q.moveMode!=='REQUEST_REVIEW')throw Error('MANAGEMENT_UNAVAILABLE');
 return {...q,policyMac:study1BindingHmac_(['E1_BOOKING_MANAGEMENT_POLICY_V1',raw])};
}
function study1V2ManagementEqual_(a,b){
 if(!/^[a-f0-9]{64}$/.test(a||'')||!/^([a-f0-9]{64})$/.test(b||''))return false;
 let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
function study1V2ManagementContext_(id,lock,policy){
 if(!lock||lock.hasLock()!==true)throw Error('MANAGEMENT_UNAVAILABLE');
 const registry=study1EConsentRegistry_(),entries=registry.records.filter(x=>x.id===id);
 if(entries.length!==1)throw Error('MANAGEMENT_UNAVAILABLE');
 const entry=entries[0],b=entry.binding;
 if(entry.channel!=='FORMAL_E1'||entry.experiment!=='E1'||entry.state!=='CONFIRMED'||entry.withdrawal||!b||b.experiment!=='E1'||b.documentSha!==entry.documentSha||b.documentVersion!==entry.documentVersion||study1BindingDigest_(b)!==b.digest||
    registry.records.filter(x=>x.binding&&x.binding.applicantId===b.applicantId).length!==1)throw Error('MANAGEMENT_UNAVAILABLE');
 // Immutable signed evidence is independently validated. It is never returned.
 study1OwnerE1SignedPdfVerified_(entry);
 const book=SpreadsheetApp.openById(study1BindingSheetId_('applicants'));
 const apps=study1WizardTable_(book,'Applicants',STUDY1_BINDING_SCHEMA_.applicants);
 const matches=study1WizardLookup_(apps,1,b.applicantId,true);
 if(matches.length!==1)throw Error('MANAGEMENT_UNAVAILABLE');
 const a=study1BindingOtpRow_(apps.tab,matches[0],7),email=study1BindingEmail_(a[2]);
 if(a[0]!==b.applicantId||a[6]!=='EMAIL_VERIFIED'||study1WizardLookup_(apps,3,email,false).length!==1)throw Error('MANAGEMENT_UNAVAILABLE');
 const screen=study1BindingSheetRow_(book,'Screenings',STUDY1_BINDING_SCHEMA_.screenings,b.screeningId).rows[0];
 const otp=study1BindingSheetRow_(book,'Verification',STUDY1_BINDING_SCHEMA_.verification,b.challengeId).rows[0];
 const issued=study1BindingUtc_(otp[8]),used=study1BindingUtc_(otp[6]),expires=study1BindingUtc_(otp[4]);
 if(screen[0]!==b.screeningId||screen[1]!==a[0]||screen[3]!=='ELIGIBLE'||screen[5]!=='PARTICIPANT_SELF_REPORT'||otp[0]!==b.challengeId||otp[1]!==a[0]||otp[2]!==OTP_RULES_.emailPurpose||
    study1BindingEmail_(otp[7])!==email||!/^([a-f0-9]{64})$/.test(otp[3]||'')||!Number.isInteger(Number(otp[5]))||Number(otp[5])<1||Number(otp[5])>OTP_RULES_.maxAttempts||issued>used||used>=expires||expires-issued>OTP_RULES_.ttlMinutes*60000||used>Date.now())throw Error('MANAGEMENT_UNAVAILABLE');
 const rec=study1ParticipantVerifiedPolicy_(study1ParticipantRecPolicy_());
 if(rec.approved!==true||screen[2]!==rec.screeningVersion||study1BindingUtc_(screen[4])<study1BindingUtc_(a[4])||issued<study1BindingUtc_(screen[4])||b.otpUsedAtUtc!==otp[6]||b.verifiedAtUtc!==otp[6])throw Error('MANAGEMENT_UNAVAILABLE');
 const eligibility=study1BindingHmac_(['E1_SELF_DECLARED_SCREENING_V1',a[0],b.screeningId,rec.screeningVersion,screen[4],rec.documentSha256]);
 const identity=study1BindingHmac_(['E1_CONSUMED_EMAIL_OTP_V1',a[0],b.screeningId,b.challengeId,email,otp[6],eligibility]);
 if(!study1V2ManagementEqual_(b.eligibilityEvidenceSha,eligibility)||!study1V2ManagementEqual_(b.identityEvidenceSha,identity))throw Error('MANAGEMENT_UNAVAILABLE');
 const snapshot=study1FormalSnapshot_(),nowUtc=new Date().toISOString();study1FormalValidateSnapshot_(snapshot,nowUtc);
 const rows=snapshot.reservations.rows.filter(r=>r[0]===b.reservationId);
 if(rows.length!==1||rows[0][1]!==a[0]||rows[0][2]!==b.slotId||!['CONFIRMED','CANCELLED'].includes(rows[0][3])||!rows[0][7]||
    (rows[0][3]==='CONFIRMED'&&rows[0][8])||(rows[0][3]==='CANCELLED'&&!rows[0][8])||study1BindingUtc_(rows[0][7])<used)throw Error('MANAGEMENT_UNAVAILABLE');
 const row=rows[0],schedule=study1V2ReceiptSchedule_(snapshot,row[2],lock);
 const scope=study1BindingHmac_(['E1_BOOKING_MANAGEMENT_SCOPE_V1',entry.id,b.digest,row[0],row[2],row[7],email]);
 return {entry,b,email,row,schedule,snapshot,lock,nowUtc,policy,scope,identity:{applicantId:a[0]}};
}
function study1V2ManagementLink_(ctx){
 const url=study1V2SelfWebUrl_();if(!url||!url.endsWith('/exec')||ctx.row[3]!=='CONFIRMED')throw Error('MANAGEMENT_UNAVAILABLE');
 const issued=Date.now(),signature=study1BindingHmac_(['E1_BOOKING_MANAGEMENT_LINK_V1',ctx.entry.id,issued,ctx.scope,ctx.policy.policyMac]);
 // Never place the capability in a query string or return it in an RPC response.
 return {url:url+'?view=apply#M1.'+ctx.entry.id+'.'+issued+'.'+ctx.scope+'.'+signature,
  expiresAtUtc:new Date(issued+ctx.policy.linkMinutes*60000).toISOString()};
}
function study1V2ManagementWithLink_(token,fn){
 const policy=study1V2ManagementPolicy_();
 const t=typeof token==='string'&&token.match(/^M1\.([-a-f0-9]{30,40})\.([0-9]{13})\.([a-f0-9]{64})\.([a-f0-9]{64})$/i);
 if(!t)throw Error('MANAGEMENT_UNAVAILABLE');
 const issued=Number(t[2]),now=Date.now(),expires=issued+policy.linkMinutes*60000;
 if(!Number.isSafeInteger(issued)||issued>now||now>=expires||!study1V2ManagementEqual_(t[4],study1BindingHmac_(['E1_BOOKING_MANAGEMENT_LINK_V1',t[1],issued,t[3],policy.policyMac])))throw Error('MANAGEMENT_UNAVAILABLE');
 const lock=LockService.getScriptLock();if(!lock||lock.tryLock(5000)!==true)throw Error('MANAGEMENT_UNAVAILABLE');
 try{
  const again=study1V2ManagementPolicy_();if(again.policyMac!==policy.policyMac||Date.now()>=expires)throw Error('MANAGEMENT_UNAVAILABLE');
  const ctx=study1V2ManagementContext_(t[1],lock,again);
  if(!study1V2ManagementEqual_(ctx.scope,t[3])||Date.now()>=expires)throw Error('MANAGEMENT_UNAVAILABLE');
  ctx.expiresAtUtc=new Date(expires).toISOString();return fn(ctx);
 }finally{lock.releaseLock();}
}
function study1V2ManagementRequestName_(ctx){return 'Study1_E1_BookingChange_'+study1BindingHmac_(['E1_BOOKING_CHANGE_NAME_V1',ctx.row[0]])+'.json';}
function study1V2ManagementRequestMac_(record){const e={...record};delete e.mac;return study1BindingHmac_(['E1_BOOKING_CHANGE_REQUEST_V1',JSON.stringify(e)]);}
function study1V2ManagementRequestRead_(ctx){
 const name=study1V2ManagementRequestName_(ctx),folder=study1EConsentFolder_(),it=folder.getFilesByName(name);
 if(!it.hasNext())return null;
 const f=it.next();if(it.hasNext()||f.getSharingAccess()!==DriveApp.Access.PRIVATE||f.getMimeType()!=='application/json'||f.getSize()>4000)throw Error('MANAGEMENT_UNAVAILABLE');
 const raw=f.getBlob().getDataAsString(),r=JSON.parse(raw);
 if(!r||JSON.stringify(r)!==raw||Object.keys(r).sort().join(',')!=='action,atUtc,mac,originalDigest,policyMac,requestId,reservationId,scope,slotId,targetSlotId,version'||r.version!==1||r.reservationId!==ctx.row[0]||r.slotId!==ctx.row[2]||r.scope!==ctx.scope||!['MOVE','CANCEL'].includes(r.action)||!study1V2ManagementEqual_(r.mac,study1V2ManagementRequestMac_(r))||study1BindingUtc_(r.atUtc)>Date.now())throw Error('MANAGEMENT_UNAVAILABLE');
 return r;
}
function study1V2ManagementProject_(ctx){
 const pending=study1V2ManagementRequestRead_(ctx),options=[];
 if(!pending&&ctx.row[3]==='CONFIRMED'&&study1BindingUtc_(ctx.schedule.startAtUtc)>Date.now())for(const r of ctx.snapshot.slots.rows){
  if(r[0]===ctx.row[2]||r[5]!=='OPEN'||study1BindingUtc_(r[1])<=Date.now()||study1FormalQueue_(ctx.snapshot,r[0]).length||study1FormalRemaining_(ctx,r)<1)continue;
  try{options.push({slotId:r[0],...study1V2ReceiptSchedule_(ctx.snapshot,r[0],ctx.lock)});}catch(_){}
 }
 const cutoff=study1BindingUtc_(ctx.schedule.startAtUtc)-ctx.policy.cancelBeforeMinutes*60000;
 return {scope:'CONFIRMED_E1_BOOKING_ONLY',reservationId:ctx.row[0],status:ctx.row[3],schedule:ctx.schedule,expiresAtUtc:ctx.expiresAtUtc,
  revision:study1BindingHmac_(['E1_BOOKING_MANAGEMENT_REVISION_V1',ctx.scope,ctx.policy.policyMac,JSON.stringify(ctx.row),JSON.stringify(pending)]),
  pending:pending?{action:pending.action,targetSlotId:pending.targetSlotId,submittedAtUtc:pending.atUtc,state:ctx.row[3]==='CANCELLED'?'CANCELLED_ORIGINAL_ROW':'OWNER_REVIEW_REQUIRED'}:null,
  cancellationMode:ctx.policy.cancelMode==='DIRECT_APPROVED'&&study1FormalTxnEnabled_()&&Date.now()<cutoff?'DIRECT_APPROVED':'REQUEST_REVIEW',
  canRequest:!pending&&ctx.row[3]==='CONFIRMED'&&study1BindingUtc_(ctx.schedule.startAtUtc)>Date.now(),options};
}
function study1E1BookingManagementRead(token){
 try{return study1V2ManagementWithLink_(token,study1V2ManagementProject_);}catch(_){return {scope:'UNAVAILABLE'};}
}
function study1E1BookingManagementChange(input){
 if(!input||Array.isArray(input)||Object.keys(input).sort().join(',')!=='action,requestId,revision,targetSlotId,token'||!['CANCEL','MOVE'].includes(input.action)||!/^REQ_[a-f0-9]{40}$/.test(input.requestId||'')||!/^([a-f0-9]{64})$/.test(input.revision||'')||typeof input.targetSlotId!=='string'||(input.action==='CANCEL'&&input.targetSlotId!==''))return {scope:'UNAVAILABLE'};
 try{return study1V2ManagementWithLink_(input.token,ctx=>{
  const view=study1V2ManagementProject_(ctx);
  if(!view.canRequest||view.revision!==input.revision||input.action==='MOVE'&&!view.options.some(o=>o.slotId===input.targetSlotId))return {scope:'UNAVAILABLE'};
  if(study1V2ManagementPolicy_().policyMac!==ctx.policy.policyMac||ctx.lock.hasLock()!==true||Date.parse(ctx.expiresAtUtc)<=Date.now())return {scope:'UNAVAILABLE'};
  // Preserve the signed reservation/slot forever. One durable change request
  // per original booking. A failed/unknown write is not safe to retry.
  const request={version:1,reservationId:ctx.row[0],slotId:ctx.row[2],scope:ctx.scope,requestId:input.requestId,
   action:input.action,targetSlotId:input.targetSlotId,atUtc:ctx.nowUtc,policyMac:ctx.policy.policyMac,
   originalDigest:study1FormalTxnDigest_(ctx.row)};
  request.mac=study1V2ManagementRequestMac_(request);
  const name=study1V2ManagementRequestName_(ctx),folder=study1EConsentFolder_();
  if(folder.getFilesByName(name).hasNext())return {scope:'UNAVAILABLE'};
  const f=folder.createFile(Utilities.newBlob(JSON.stringify(request),'application/json',name));
  f.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.VIEW);
  if(JSON.stringify(study1V2ManagementRequestRead_(ctx))!==JSON.stringify(request)||ctx.lock.hasLock()!==true)throw Error('MANAGEMENT_OUTCOME_UNKNOWN');
  if(input.action==='CANCEL'&&view.cancellationMode==='DIRECT_APPROVED'){
   // Separate explicit policy. Never withdraw consent or erase signed evidence.
   if(study1V2ManagementPolicy_().policyMac!==ctx.policy.policyMac||Date.now()>=study1BindingUtc_(ctx.schedule.startAtUtc)-ctx.policy.cancelBeforeMinutes*60000||!study1FormalTxnEnabled_())throw Error('MANAGEMENT_OUTCOME_UNKNOWN');
   const after=ctx.row.slice();after[3]='CANCELLED';after[8]=new Date().toISOString();after[9]=after[8];
   const evidence=[study1FormalTxnSubject_('RESERVATION',ctx.row[0],ctx.row,after)];
   const prepared=study1FormalTxnPrepare_(ctx.identity.applicantId,'CANCEL',request.requestId,evidence,ctx.lock);
   study1FormalWriteExisting_(ctx,ctx.row,after);study1FormalAfterMutation_(ctx.snapshot,[[ctx.row[0],after]]);
   study1FormalTxnCommit_(ctx.identity.applicantId,prepared,evidence,ctx.lock);
  }
  // Return a fresh independent projection. The request is not a new booking.
  const fresh=study1V2ManagementContext_(ctx.entry.id,ctx.lock,ctx.policy);fresh.expiresAtUtc=ctx.expiresAtUtc;
  return study1V2ManagementProject_(fresh);
 });}catch(_){return {scope:'OUTCOME_UNKNOWN'};}
}

/** Link reissue: same existing human verification, private original mailbox,
 * generic acknowledgment, durable at-most-once outbox and rate limit. */
function study1E1BookingManagementRequestLink(input){
 const ack={accepted:true,delivery:'UNVERIFIED'};
 try{
  const policy=study1V2ManagementPolicy_();
  if(!input||Array.isArray(input)||Object.keys(input).sort().join(',')!=='email,humanToken,requestId'||!/^REQ_[a-f0-9]{40}$/.test(input.requestId||''))return ack;
  const email=study1BindingEmail_(input.email),grant=study1ParticipantAbuseProtection_(input);
  const lock=LockService.getScriptLock();if(!lock||lock.tryLock(5000)!==true)return ack;
  try{
   study1ParticipantAbuseRecheck_(grant,input);if(study1V2ManagementPolicy_().policyMac!==policy.policyMac)return ack;
   const book=SpreadsheetApp.openById(study1BindingSheetId_('applicants')),apps=study1WizardTable_(book,'Applicants',STUDY1_BINDING_SCHEMA_.applicants);
   const match=study1WizardLookup_(apps,3,email,false);if(match.length!==1)return ack;
   const a=study1BindingOtpRow_(apps.tab,match[0],7),cs=study1EConsentRegistry_().records.filter(x=>x.binding&&x.binding.applicantId===a[0]&&x.channel==='FORMAL_E1'&&x.experiment==='E1'&&x.state==='CONFIRMED');
   if(cs.length!==1)return ack;
   const ctx=study1V2ManagementContext_(cs[0].id,lock,policy);if(ctx.email!==email||ctx.row[3]!=='CONFIRMED'||Date.parse(ctx.schedule.startAtUtc)<=Date.now())return ack;
   const source=study1WizardTable_(SpreadsheetApp.openById(study1BindingSheetId_('reservations')),'Notifications',STUDY1_E1_NOTIFICATION_HEADERS_);
   const id='NTF_'+study1BindingHmac_(['E1_BOOKING_MANAGEMENT_LINK_REQUEST_V1',ctx.row[0],input.requestId]).slice(0,28);
   if(study1WizardLookup_(source,1,id,true).length)return ack;
   const now=Date.now(),history=study1WizardLookup_(source,3,ctx.row[0],true).map(n=>source.tab.getRange(n,1,1,9).getValues()[0]).filter(r=>r[3]==='E1_BOOKING_MANAGEMENT_LINK');
   if(history.some(r=>r[1]!==a[0]||!['DISPATCHING','PROVIDER_ACCEPTED','UNKNOWN'].includes(r[4])||r[5]!==1))return ack;
   const last=history.map(r=>study1BindingUtc_(r[6]));if(last.some(t=>t>now||now-t<3600000)||last.filter(t=>now-t<86400000).length>=3)return ack;
   const link=study1V2ManagementLink_(ctx),row=[id,a[0],ctx.row[0],'E1_BOOKING_MANAGEMENT_LINK','DISPATCHING',1,new Date(now).toISOString(),'',''];
   study1WizardAppend_(source,row);
   if(lock.hasLock()!==true||study1V2ManagementPolicy_().policyMac!==policy.policyMac)return ack;
   let accepted=false;try{MailApp.sendEmail({to:ctx.email,subject:'Study1｜限時預約管理連結',body:'請在期限內使用原網站管理實驗一預約：\n'+link.url+'\n本連結只限原預約，不可轉寄，也不授權簽署或下載 PDF。有效至（臺灣）：'+Utilities.formatDate(new Date(link.expiresAtUtc),'Asia/Taipei','yyyy/MM/dd HH:mm')+'。'});accepted=true;}catch(_){}
   const range=source.tab.getRange(source.n+1,1,1,9);if(lock.hasLock()!==true||JSON.stringify(range.getValues()[0])!==JSON.stringify(row))return ack;
   const updated=row.slice();updated[4]=accepted?'PROVIDER_ACCEPTED':'UNKNOWN';updated[7]=accepted?new Date().toISOString():'';updated[8]=accepted?'':'MAIL_PROVIDER_OUTCOME_UNKNOWN';range.setValues([updated]);SpreadsheetApp.flush();
   if(JSON.stringify(range.getValues()[0])!==JSON.stringify(updated))return ack;
  }finally{lock.releaseLock();}
 }catch(_){}return ack;
}

/** OWNER-only projection of requests. No mutation, links, emails or PDF bytes. */
function study1OwnerE1BookingChangeRequests(){
 study1SiteFormalWorkspaceReadGate_();const lock=LockService.getScriptLock();if(!lock||lock.tryLock(5000)!==true)throw Error('MANAGEMENT_UNAVAILABLE');
 try{
  study1SiteFormalWorkspaceReadGate_();const registry=study1EConsentRegistry_(),snapshot=study1FormalSnapshot_(),rows=[];
  for(const e of registry.records){if(e.channel!=='FORMAL_E1'||e.experiment!=='E1'||!e.binding)continue;
   const b=e.binding,r=snapshot.reservations.rows.filter(x=>x[0]===b.reservationId&&x[1]===b.applicantId&&x[2]===b.slotId);if(r.length!==1)continue;
   const name=study1V2ManagementRequestName_({row:r[0]}),it=study1EConsentFolder_().getFilesByName(name);if(!it.hasNext())continue;
   const file=it.next();if(it.hasNext()||file.getSharingAccess()!==DriveApp.Access.PRIVATE||file.getMimeType()!=='application/json'||file.getSize()>4000)throw Error('MANAGEMENT_UNAVAILABLE');
   const raw=file.getBlob().getDataAsString(),q=JSON.parse(raw);
   if(!q||JSON.stringify(q)!==raw||q.version!==1||q.reservationId!==r[0][0]||q.slotId!==r[0][2]||!['MOVE','CANCEL'].includes(q.action)||!study1V2ManagementEqual_(q.mac,study1V2ManagementRequestMac_(q)))throw Error('MANAGEMENT_UNAVAILABLE');
   rows.push({reservationId:q.reservationId,slotId:q.slotId,action:q.action,targetSlotId:q.targetSlotId,submittedAtUtc:q.atUtc,bookingStatus:r[0][3],consentState:e.state});
  }
  study1SiteFormalWorkspaceReadGate_();if(lock.hasLock()!==true)throw Error('MANAGEMENT_UNAVAILABLE');return {readOnly:true,experiment:'E1',rows};
 }finally{lock.releaseLock();}
}

/** Only the exact approved original slot may be displayed or mailed. */
function study1V2ReceiptSchedule_(snapshot,slotId,lock){
 if(!lock||lock.hasLock()!==true)throw Error('E1_RECEIPT_LOCK_REQUIRED');
 const rows=snapshot.slots.rows.filter(r=>r[0]===slotId);
 if(rows.length!==1)throw Error('E1_RECEIPT_SLOT_NOT_UNIQUE');
 const row=rows[0];
 study1WizardSlotAuthority_({slotId,experiment:'E1'},row,lock);
 const start=study1BindingUtc_(row[1]),end=study1BindingUtc_(row[2]);
 if(end<=start||typeof row[4]!=='string'||!row[4].trim()||row[4].length>80||
    row[4]!==row[4].trim()||/[<>\x00-\x1f]/.test(row[4]))
  throw Error('E1_RECEIPT_SLOT_INVALID');
 return {startAtUtc:new Date(start).toISOString(),endAtUtc:new Date(end).toISOString(),locationCode:row[4]};
}

/** Minimized read-only lookup of this authenticated applicant's exact notice.
 * Missing or contradictory evidence is never interpreted as permission to send. */
function study1V2ReceiptNoticeStatus_(ctx,row){
 try{
  if(ctx.lock.hasLock()!==true||row[1]!==ctx.identity.applicantId||
     row[3]!=='CONFIRMED'||!row[7]||row[8])return 'UNKNOWN';
  const entries=study1EConsentRegistry_().records.filter(x=>
   x&&x.binding&&x.binding.reservationId===row[0]);
  if(entries.length!==1)return 'UNKNOWN';
  const entry=entries[0],b=entry.binding;
  if(entry.channel!=='FORMAL_E1'||entry.experiment!=='E1'||entry.state!=='CONFIRMED'||
     entry.researcherPresigned!==true||!entry.signature||!entry.confirmation||
     !entry.signedPdf||!entry.participantSignedPdf||
     b.experiment!=='E1'||b.applicantId!==ctx.identity.applicantId||
     b.screeningId!==ctx.identity.screeningId||b.challengeId!==ctx.identity.challengeId||
     b.slotId!==row[2]||b.documentSha!==entry.documentSha||b.documentVersion!==entry.documentVersion||
     study1BindingDigest_(b)!==b.digest||entry.participantSignedPdf.id!==entry.signedPdf.id||
     entry.participantSignedPdf.sha!==entry.signedPdf.sha)return 'UNKNOWN';
  const jobId='NTF_'+study1BindingHmac_(['E1_BOOKING_CONFIRMATION_NOTICE_V1',entry.id,
   b.applicantId,b.reservationId]).slice(0,28);
  const book=SpreadsheetApp.openById(study1BindingSheetId_('reservations'));
  if(!book||book.getId()!==study1BindingSheetId_('reservations'))return 'UNKNOWN';
  const source=study1WizardTable_(book,'Notifications',STUDY1_E1_NOTIFICATION_HEADERS_);
  const get=()=>study1WizardLookup_(source,3,b.reservationId,true).map(n=>
   source.tab.getRange(n,1,1,9).getValues()[0]);
  const a=get(),again=get();
  if(JSON.stringify(a)!==JSON.stringify(again)||ctx.lock.hasLock()!==true||
     source.tab.getLastRow()!==source.n||
     a.some(n=>!Array.isArray(n)||n.length!==9||n[2]!==b.reservationId))return 'UNKNOWN';
  const matches=a.filter(n=>n[3]==='E1_RESERVATION_CONFIRMED');
  if(matches.length===0)return study1WizardLookup_(source,1,jobId,true).length?'UNKNOWN':'NOT_QUEUED';
  if(matches.length!==1)return 'UNKNOWN';
  const n=matches[0];
  if(n[0]!==jobId||n[1]!==b.applicantId||n[5]!==1||
     study1BindingUtc_(n[6])<study1BindingUtc_(row[7]))return 'UNKNOWN';
  if(n[4]==='PROVIDER_ACCEPTED'&&n[7]&&!n[8]&&
     study1BindingUtc_(n[7])>=study1BindingUtc_(n[6]))return 'PROVIDER_ACCEPTED';
  if(n[4]==='DISPATCHING'&&!n[7]&&!n[8])return 'DISPATCHING';
  if(n[4]==='UNKNOWN'&&!n[7]&&n[8]==='MAIL_PROVIDER_OUTCOME_UNKNOWN')return 'UNKNOWN';
  return 'UNKNOWN';
 }catch(_){return 'UNKNOWN';}
}

function study1V2ConfirmationReceipts_(ctx){
 if(!ctx.lock||ctx.lock.hasLock()!==true)throw Error('E1_RECEIPT_LOCK_REQUIRED');
 return ctx.snapshot.reservations.rows.filter(r=>r[1]===ctx.identity.applicantId&&
    r[3]==='CONFIRMED'&&r[7]&&!r[8]).map(row=>{
  let schedule=null;
  try{schedule=study1V2ReceiptSchedule_(ctx.snapshot,row[2],ctx.lock);}catch(_){}
  return {reservationId:row[0],slotId:row[2],schedule,
   noticeStatus:study1V2ReceiptNoticeStatus_(ctx,row)};
 });
}
`;

const edits={
 Study1FormalBooking:[
  ['    capacity:row[3],remaining,waitlistCount:queue.length,',
   '    capacity:row[3],locationCode:row[4],remaining,waitlistCount:queue.length,'],
  ["  experiment:'E1',asOfUtc:ctx.nowUtc,reservations:study1FormalRowsFor_(ctx)\n }));",
   String.raw`  experiment:'E1',asOfUtc:ctx.nowUtc,reservations:study1FormalRowsFor_(ctx).map(row=>{
   let schedule=null;
   if(['HELD','WAITLISTED'].includes(row.status))try{schedule=study1V2ReceiptSchedule_(ctx.snapshot,row.slotId,ctx.lock);}catch(_){}
   return {...row,schedule};
  }),
  confirmationReceipts:study1V2ConfirmationReceipts_(ctx)
 }));`]
 ],
 Study1ParticipantIntake:[
  ["  return {ready:true,experiment:'E1',siteKey:antiBot.siteKey,\n   recoveryReady:",
   "  let managementReady=false;try{study1V2ManagementPolicy_();managementReady=true;}catch(_){}\n  return {ready:true,experiment:'E1',siteKey:antiBot.siteKey,managementReady,\n   recoveryReady:"],
  ["   delivery:'UNVERIFIED'};",
   "   delivery:'UNVERIFIED',expiresAtUtc:new Date(expires).toISOString()};"],
  ["   throw Error('E1_NOTICE_ORIGINAL_BOOKING_CHRONOLOGY_INVALID');\n  const book=SpreadsheetApp.openById(study1BindingSheetId_('reservations'));",
   String.raw`   throw Error('E1_NOTICE_ORIGINAL_BOOKING_CHRONOLOGY_INVALID');
  const schedule=study1V2ReceiptSchedule_(snapshot,binding.slotId,lock);
  const local=utc=>Utilities.formatDate(new Date(utc),'Asia/Taipei','yyyy/MM/dd HH:mm');
  if(!Number.isSafeInteger(entry.expires))throw Error('E1_NOTICE_COPY_EXPIRY_INVALID');
  const copyUntil=new Date(entry.expires);
  if(!Number.isFinite(copyUntil.getTime()))throw Error('E1_NOTICE_COPY_EXPIRY_INVALID');
  let managementLine='如需改期、取消或重新取得管理連結，請聯絡研究團隊。';
  try{
   const managed=study1V2ManagementContext_(entry.id,lock,study1V2ManagementPolicy_());
   if(managed.email!==to)throw Error('MANAGEMENT_UNAVAILABLE');
   const link=study1V2ManagementLink_(managed);
   managementLine='原預約專用限時管理連結（勿轉寄）：\n'+link.url+'\n有效至（臺灣）：'+local(link.expiresAtUtc)+'。只限此預約，不授權簽署或下載 PDF。';
  }catch(_){} // Management policy must not suppress a valid original confirmation notice.
  // Prepare before creating the existing at-most-once DISPATCHING row.
  const confirmationBody=[
   '您的 Study1 實驗一報名與預約已確認。',
   '開始時間（臺灣）：'+local(schedule.startAtUtc),
   '結束時間（臺灣）：'+local(schedule.endAtUtc),
   '地點：'+schedule.locationCode,
   '預約編號：'+binding.reservationId,
   '您已完成研究者預簽知情同意書的本人簽署。請於原報名頁有效驗證期間下載完整副本；副本存取期限至（臺灣）：'+local(copyUntil)+ '。',
   managementLine,
   '本信不附私人 PDF 或簽署憑證。若有疑問請聯絡研究團隊；不要重新報名。'
  ].join('\n');
  const book=SpreadsheetApp.openById(study1BindingSheetId_('reservations'));`],
  ["    body:'您的Study1實驗一報名與時段預約已確認。研究者事先簽署的知情同意書已由您於報名網站完成簽名。完整簽署PDF已存入研究團隊私人資料庫；您可在原報名頁面的有效驗證期間下載副本。如需協助請聯絡研究團隊。'});",
   '    body:confirmationBody});']
 ],
 AdminSandbox:[
  ['  participantSignedPdfSha256:x.signedPdf.sha,dualSigned:true,\n  base64:Utilities.base64Encode(bytes),mime:',
   '  participantSignedPdfSha256:x.signedPdf.sha,dualSigned:true,\n  copyExpiresAtUtc:new Date(x.expires).toISOString(),\n  base64:Utilities.base64Encode(bytes),mime:']
 ],
 Study1FormalConsent:[
  ["   documentSha256:document.sha256,researcherPresigned:true,\n   recovery:'ORIGINAL_REGISTRY_READ_ONLY'};",
   "   documentSha256:document.sha256,researcherPresigned:true,\n   expiresAtUtc:new Date(entry.expires).toISOString(),serverNowUtc:new Date().toISOString(),\n   recovery:'ORIGINAL_REGISTRY_READ_ONLY'};"],
  ['      token,expiresAtUtc:new Date(old.expires).toISOString(),',
   '      token,expiresAtUtc:new Date(old.expires).toISOString(),serverNowUtc:new Date().toISOString(),'],
  ['   token,expiresAtUtc:new Date(expires).toISOString(),',
   '   token,expiresAtUtc:new Date(expires).toISOString(),serverNowUtc:new Date().toISOString(),'],
  ['  sourceSha256:entry.documentSha,expiresAtUtc:new Date(entry.expires).toISOString(),',
   '  sourceSha256:entry.documentSha,expiresAtUtc:new Date(entry.expires).toISOString(),\n  serverNowUtc:new Date().toISOString(),']
 ],
 Study1Visitor:[
  ['<p id="formalRecoveryRef" class="help" hidden></p>',
   String.raw`<section class="step" id="step-manage" hidden>
<h2>實驗一｜已確認預約管理</h2><p class="help">只核對原預約。改期須由研究團隊確認；取消預約不等同撤回研究同意或刪除已簽同意書。請勿轉寄限時連結。</p>
<p id="managementSummary" class="box" role="status" aria-live="polite">正在核對連結及原預約…</p>
<p id="managementExpiry" class="help"></p>
<div id="managementControls" hidden><label for="managementAction" class="field">選擇操作</label><select id="managementAction"><option value="CANCEL">取消預約</option><option value="MOVE">申請改期（待研究團隊確認）</option></select>
<label for="managementTarget" id="managementTargetLabel" class="field" hidden>希望改至的場次（非保留名額）</label><select id="managementTarget" hidden></select>
<label class="check"><input id="managementConfirm" type="checkbox">我已核對本人原預約，並確認提交上述操作。</label><button id="managementSubmit" type="button" disabled>提交一次</button></div>
<button id="managementRefresh" type="button" class="ghost" hidden>唯讀重新核對原預約與申請</button>
<p class="help">連結逾期或遺失時，請回到原報名頁，使用原信箱及人機驗證重新申請管理連結，或聯絡研究團隊。</p>
</section>
<p id="formalRecoveryRef" class="help" hidden></p>`],
  [" for(const name of ['choose','screen','ineligible','otp','slots','confirm','consent','done']){",
   " for(const name of ['choose','screen','ineligible','otp','slots','confirm','consent','done','manage']){"],
  ["({choose:'研究選擇',screen:'資格初篩',otp:'電子郵件驗證',slots:'時段與資格確認'}[step]||step);",
   "({choose:'研究選擇',screen:'資格初篩',otp:'電子郵件驗證',slots:'時段與資格確認',manage:'已確認預約管理'}[step]||step);"],
  ['<div id="formalExistingCase" class="box" hidden>',
   '<div class="box" id="formalManageLinkBox" hidden><strong>已完成預約？重新取得限時管理連結</strong><p class="help">只填上方原電子郵件並完成人機驗證。回應不顯示帳號是否存在；不要重新申請研究。</p><button type="button" id="formalManageLinkSend" disabled>請求一次給原信箱的管理連結</button></div>\n<div id="formalExistingCase" class="box" hidden>'],
  ["   state.recoveryReady=state.ready&&result.recoveryReady===true;",
   "   state.recoveryReady=state.ready&&result.recoveryReady===true;\n   state.managementReady=state.ready&&result.managementReady===true;\n   el('formalManageLinkBox').hidden=!state.managementReady;el('formalManageLinkSend').disabled=!state.managementReady;"],
  ["el('formalRecoverySend').addEventListener('click',()=>{",
   String.raw`el('formalManageLinkSend').addEventListener('click',()=>{
 if(!state.managementReady||state.busy||state.app||state.beginUnknown||state.recoveryCase||!state.humanToken)return;
 const email=el('formalEmail').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254){status('請填原報名信箱。');return;}
 const requestId=genRequest(),humanToken=state.humanToken;state.humanToken='';state.beginUnknown=true;
 if(window.turnstile&&state.captchaWidget!==null)window.turnstile.reset(state.captchaWidget);
 for(const id of ['formalManageLinkSend','screenNext','formalRecoverySend','formalEmail'])el(id).disabled=true;
 const done=()=>status('如符合管理連結核發條件，原信箱將收到郵件。實際送達未核實，請勿連續送出；若未收到請聯絡研究團隊。');
 rpc('study1E1BookingManagementRequestLink',{email,humanToken,requestId},done,done);
});
el('formalRecoverySend').addEventListener('click',()=>{`],
  ["if(typeof google!=='undefined'&&google.script&&google.script.run){\n google.script.run.withFailureHandler(()=>{",
   "function formalInitialReadiness_(){\nif(typeof google!=='undefined'&&google.script&&google.script.run){\n google.script.run.withFailureHandler(()=>{"],
  [" status('目前尚未開放線上報名。');\n}\n\n// V05 + V08 formal UI",
   " status('目前尚未開放線上報名。');\n}\n}\n\n// V05 + V08 formal UI"],
  ['<div id="otpInputWrap" hidden>',
   '<button id="formalOtpLookup" type="button" class="ghost" hidden disabled>唯讀核對本次驗證碼狀態</button>\n<div id="otpInputWrap" hidden>'],
  ['function reconcileOtpIssue_(payload){',
   String.raw`let formalOtpExpiredRequestId=null;
function formalOtpLookupControl_(available){
 const button=el('formalOtpLookup');if(button){button.hidden=!available;button.disabled=!available;}
}
function formalOtpLookup_(){
 if(!state.app||state.busy||state.otpVerifyUnknown||!state.otpRequestId)return;
 reconcileOtpIssue_({...state.app,requestId:state.otpRequestId});
}
el('formalOtpLookup').addEventListener('click',formalOtpLookup_);
function reconcileOtpIssue_(payload){
 if(!state.app||state.app.applicantId!==payload.applicantId||state.otpRequestId!==payload.requestId||state.otpVerifyUnknown)return;
 formalOtpExpiredRequestId=null;el('otpSend').disabled=true;el('otpVerify').disabled=true;
 formalOtpLookupControl_(true);`],
  ["  if(!result||result.found!==true){\n   status('OTP 原始紀錄尚未核實；寄送因果未知，請勿重複送出，聯絡研究團隊。');",
   "  if(state.otpRequestId!==payload.requestId||state.otpVerifyUnknown)return;\n  if(!result||result.found!==true){\n   status('OTP 原始紀錄尚未核實；寄送因果未知，請勿重複送出，聯絡研究團隊。');"],
  ["   status('已唯讀核對原 Verification 有尚未使用的驗證碼；郵件是否送達仍未知，僅在確實收到郵件時輸入。');",
   String.raw`   el('otpInput').disabled=false;el('otpVerify').disabled=false;
   const until=typeof result.expiresAtUtc==='string'&&Number.isFinite(Date.parse(result.expiresAtUtc))?formalTime_(result.expiresAtUtc):'尚未核對';
   status('已唯讀核對原驗證碼仍有效（臺灣期限：'+until+'）；郵件是否送達仍未知，僅在收到時輸入。');`],
  ["  if(result.status==='USED'){\n   state.otpVerifyUnknown=true;el('otpVerify').disabled=true;",
   String.raw`  if(result.status==='EXPIRED'){
   // This is a fresh user-initiated issue for the same pending application,
   // never a replay of the old request. Original lock/throttle remain authoritative.
   formalOtpExpiredRequestId=payload.requestId;state.mail=null;
   el('otpInput').value='';el('otpInputWrap').hidden=true;el('otpVerify').disabled=true;
   el('otpSend').textContent='原碼已過期，申請新驗證碼';el('otpSend').disabled=false;
   status('已由原驗證紀錄確認過期，舊碼不可使用。若仍要繼續同一申請，可自行要求新碼；仍受伺服器寄送頻率限制。');return;
  }
  if(result.status==='USED'){
   formalOtpLookupControl_(false);state.otpVerifyUnknown=true;el('otpVerify').disabled=true;`],
  ["  status('原 OTP 狀態為過期、受限或已被新挑戰取代；請勿自動補寄，聯絡研究團隊核對。');",
   "  el('otpVerify').disabled=true;state.mail=null;\n  status('原 OTP 狀態受限、被取代或未知；請勿補寄或重驗，聯絡研究團隊核對。');"],
  [" if(!state.ready||state.busy||!state.app||state.otpRequestId)return;",
   String.raw` if(!state.ready||state.busy||!state.app||state.otpVerifyUnknown)return;
 if(state.otpRequestId&&formalOtpExpiredRequestId!==state.otpRequestId)return;
 formalOtpExpiredRequestId=null;state.mail=null;
 el('otpInput').value='';el('otpInputWrap').hidden=true;el('otpVerify').disabled=true;
 el('otpSend').textContent='寄送電子郵件驗證碼';`],
  [" state.otpRequestId=payload.requestId;\n el('otpSend').disabled=true;",
   " state.otpRequestId=payload.requestId;\n el('otpSend').disabled=true;formalOtpLookupControl_(true);"],
  ["   status('伺服器已接受驗證碼寄送要求，實際送達仍需由信箱確認；八位碼10分鐘內有效。');return;",
   String.raw`   el('otpInput').disabled=false;el('otpVerify').disabled=false;
   status('伺服器已接受驗證碼寄送要求，實際送達仍需由信箱確認；有效至（臺灣）'+
    (typeof result.expiresAtUtc==='string'&&Number.isFinite(Date.parse(result.expiresAtUtc))?formalTime_(result.expiresAtUtc):'待唯讀核對')+'。');return;`],
  ["  if(result.sent===false&&result.reason==='ALREADY_ISSUED'){\n   state.mail=result.challengeId;\n   el('otpInputWrap').hidden=false;\n   status('此申請已核發過驗證碼，系統不再寄送；若先前收到郵件，可輸入其中的八位碼。');return;",
   "  if(result.sent===false&&result.reason==='ALREADY_ISSUED'){\n   reconcileOtpIssue_(payload);return;"],
  ["  if(!result||result.verified!==true){status('驗證碼尚未通過核實，可能錯誤、逾期或已使用；未建立有效信箱證據。');return;}",
   String.raw`  if(!result||result.verified!==true){
   el('otpInput').value='';
   if(result&&result.verified===false&&result.reason==='REJECTED'){
    status('驗證碼未通過；正在唯讀核對原碼狀態。');formalOtpLookup_();return;
   }
   state.otpVerifyUnknown=true;el('otpVerify').disabled=true;formalOtpLookupControl_(false);
   status('驗證結果未知，可能已使用；請勿重送或再次驗證。');return;
  }
  formalOtpLookupControl_(false);`],
  ["  state.otpVerifyUnknown=true;el('otpVerify').disabled=true;\n  status('OTP 驗證結果未知，可能已一次性使用；請勿重複送出，聯絡研究團隊核對。');",
   "  state.otpVerifyUnknown=true;el('otpVerify').disabled=true;formalOtpLookupControl_(false);\n  status('OTP 驗證結果未知，可能已一次性使用；請勿重複送出，聯絡研究團隊核對。');"],
  [" if(!state.ready||state.busy||state.beginUnknown||state.recoveryCase)return;",
   " if(!state.ready||state.busy||state.beginUnknown||state.recoveryCase||state.app)return;"],
  ["   o.textContent=formalTime_(slot.startAtUtc)+'｜剩餘 '+slot.remaining+",
   "   o.textContent=formalTime_(slot.startAtUtc)+' – '+formalTime_(slot.endAtUtc)+'｜'+(slot.locationCode||'地點待核對')+'｜剩餘 '+slot.remaining+"],
  ["   const btn=formalButton_(formalTime_(slot.startAtUtc)+\n    '｜'+(slot.bookable?'尚有名額':'已滿／候補'),()=>{",
   "   const btn=formalButton_(formalTime_(slot.startAtUtc)+' – '+formalTime_(slot.endAtUtc)+\n    '｜'+(slot.locationCode||'地點待核對')+'｜'+(slot.bookable?'尚有名額':'已滿／候補'),()=>{"],
  [" info.textContent='時段：'+(slot?formalTime_(slot.startAtUtc):reservation.slotId)+",
   String.raw` const schedule=reservation.schedule;
 const scheduleValid=!!(schedule&&typeof schedule.locationCode==='string'&&schedule.locationCode.trim()&&
  Number.isFinite(Date.parse(schedule.startAtUtc))&&Number.isFinite(Date.parse(schedule.endAtUtc))&&
  Date.parse(schedule.endAtUtc)>Date.parse(schedule.startAtUtc));
 info.textContent='時段：'+(scheduleValid?formalTime_(schedule.startAtUtc)+' – '+formalTime_(schedule.endAtUtc)+'｜'+schedule.locationCode:'原場次尚未核對')+`],
  [" root.appendChild(info);\n const controls=document.createElement('div');controls.className='actionrow';",
   String.raw` root.appendChild(info);
 const summary=document.createElement('dl');summary.className='box';
 const field=(label,value)=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;summary.appendChild(dt);summary.appendChild(dd);};
 field('研究項目','實驗一（E1）');
 field('原預約編號',reservation.reservationId);
 field('已核對電子郵件',state.emailStatusConfirmed&&state.app?state.app.email:'尚未核對');
 field('知情同意','尚未簽署完成；下一步須完整閱讀並本人簽名。');
 root.appendChild(summary);
 const controls=document.createElement('div');controls.className='actionrow';`],
  ["  controls.appendChild(formalButton_('核對本人暫留並進入最後知情同意',()=>formalConsentStart_(reservation)));",
   String.raw`  const next=formalButton_('資料正確，前往最後知情同意',()=>{
   if(scheduleValid&&state.emailStatusConfirmed&&state.activeBooking===reservation)formalConsentStart_(reservation);
  });
  next.disabled=!scheduleValid||!state.emailStatusConfirmed;
  controls.appendChild(next);
  if(!scheduleValid){const note=document.createElement('p');note.className='help';note.textContent='請先唯讀重新核對原預約及已核定場次，不可使用未核對場次進行簽署。';root.appendChild(note);}`],
  [" else{state.activeBooking=r.reservation;formalV08Panel_(r.reservation);}",
   String.raw` else{
  state.activeBooking=r.reservation;
  const root=el('step-confirm');formalClear_(root);
  const p=document.createElement('p');p.textContent='原異動已核對，正在取得同案的正式場次摘要。';root.appendChild(p);
  root.appendChild(formalButton_('唯讀重新核對原預約',formalV08Read_));
  formalV08Read_();
 }`],
  ["  const active=result.reservations.filter(r=>\n   r.status==='WAITLISTED'||(r.status==='HELD'&&",
   String.raw`  if(result.reservations.some(r=>r.status==='CONFIRMED')){
   // A confirmed application must never be shown as available for another hold.
   el('hold').disabled=true;
   formalClear_(el('step-confirm'));
   const p=document.createElement('p');p.textContent='原紀錄已確認預約；請勿重新報名或另建預約。';el('step-confirm').appendChild(p);
   if(formalConsent&&formalSignSubmitted)el('step-confirm').appendChild(formalButton_('回到原簽署結果唯讀核對',()=>{show('consent');formalConsentStatus_();}));
   show('confirm');status('原紀錄已包含正式確認預約。不得重新暫留或簽署；請使用原簽署結果或聯絡研究團隊核對。');
   return;
  }
  const active=result.reservations.filter(r=>
   r.status==='WAITLISTED'||(r.status==='HELD'&&`],
  ['  <dt>原預約識別碼</dt><dd id="formalDoneReservation">待本人核對</dd>',
   '  <dt>原預約識別碼</dt><dd id="formalDoneReservation">待本人核對</dd>\n  <dt>預約日期及起訖時間（臺灣）</dt><dd id="formalDoneTime">待本人核對</dd>\n  <dt>實驗地點</dt><dd id="formalDoneLocation">待本人核對</dd>'],
  ['  <dt>郵件通知狀態</dt><dd>未由此頁驗證寄送；請以正式通知來源為準</dd>',
   '  <dt>副本存取有效期限（臺灣）</dt><dd id="formalDoneCopyExpiry">尚未核對</dd>\n  <dt>郵件通知狀態</dt><dd id="formalDoneEmailNotice">尚未核對原通知紀錄</dd>'],
  ['function formalDoneRender_(outcome,pdfSha,taipeiDate,reservationId){',
   'function formalDoneRender_(outcome,pdfSha,taipeiDate,reservationId,receipt,copyExpiresAtUtc){'],
  [" el('formalDonePdfDate').textContent=taipeiDate;\n el('formalDoneNotice').textContent=confirmed?",
   String.raw` el('formalDonePdfDate').textContent=taipeiDate;
 const validReceipt=confirmed&&receipt&&receipt.reservationId===reservationId&&
  receipt.slotId===formalConsent.slotId;
 const s=validReceipt?receipt.schedule:null;
 const validSchedule=s&&typeof s.startAtUtc==='string'&&typeof s.endAtUtc==='string'&&
  Number.isFinite(Date.parse(s.startAtUtc))&&Number.isFinite(Date.parse(s.endAtUtc))&&
  Date.parse(s.endAtUtc)>Date.parse(s.startAtUtc)&&typeof s.locationCode==='string'&&s.locationCode.trim();
 const time=el('formalDoneTime'),location=el('formalDoneLocation'),emailNotice=el('formalDoneEmailNotice');
 if(time)time.textContent=validSchedule?formalTime_(s.startAtUtc)+' – '+formalTime_(s.endAtUtc):'尚未核對，請聯絡研究團隊';
 if(location)location.textContent=validSchedule?s.locationCode:'尚未核對';
 const expiry=el('formalDoneCopyExpiry');
 if(expiry)expiry.textContent=typeof copyExpiresAtUtc==='string'&&Number.isFinite(Date.parse(copyExpiresAtUtc))?
  formalTime_(copyExpiresAtUtc)+'（請於期限前保存 PDF）':'尚未核對，請保存已取得的完整副本';
 const labels={PROVIDER_ACCEPTED:'郵件服務已接受寄送；不代表已送達，請查看原信箱。',
  DISPATCHING:'寄送因果待人工核對，請勿重送。',
  NOT_QUEUED:'原通知紀錄尚未建立；請聯絡研究團隊核對，不必重新報名。',
  UNKNOWN:'寄送結果待人工核對；請勿自行重送。'};
 const noticeKey=validReceipt?receipt.noticeStatus:'UNKNOWN';
 if(emailNotice)emailNotice.textContent=confirmed?
  (Object.prototype.hasOwnProperty.call(labels,noticeKey)?labels[noticeKey]:labels.UNKNOWN):
  '預約尚未確認，不得視為已發送確認通知。';
 el('formalDoneNotice').textContent=confirmed?`],
  ["  formalDoneRender_(result,v.sha,v.taipeiDate,v.reservationId);",
   String.raw`  const receipts=Array.isArray(booking?.confirmationReceipts)?booking.confirmationReceipts.filter(x=>
   x&&x.reservationId===v.reservationId&&x.slotId===v.slotId):[];
  formalDoneRender_(result,v.sha,v.taipeiDate,v.reservationId,receipts.length===1?receipts[0]:null,v.copyExpiresAtUtc);`],
  ['   formalReceiptVerified={token,sha:result.sha,taipeiDate:copy.taipeiDate,\n    reservationId:formalConsent.reservationId,slotId:formalConsent.slotId};',
   String.raw`   const expiry=copy.copyExpiresAtUtc;
   const expiryVerified=typeof expiry==='string'&&Number.isFinite(Date.parse(expiry))&&
    new Date(expiry).toISOString()===expiry?expiry:null;
   formalReceiptVerified={token,sha:result.sha,taipeiDate:copy.taipeiDate,
    reservationId:formalConsent.reservationId,slotId:formalConsent.slotId,copyExpiresAtUtc:expiryVerified};`],
  ['<p class="help" id="consentStatus">請先核實完整 PDF 與本人簽署權限。</p></section>',
   '<p class="help" id="formalConsentDeadline">尚未核對同一暫留及簽署憑證期限。</p>\n<p class="help" id="consentStatus">請先核實完整 PDF 與本人簽署權限。</p></section>'],
  ['function formalConsentRender_(){\n const x=formalConsent,ready=!!(x&&x.originalVerified&&x.researcherPresigned===true);',
   String.raw`function formalConsentClockNow_(){
 return typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();
}
function formalConsentIsoMs_(value){
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return null;
 const t=Date.parse(value);return new Date(t).toISOString()===value?t:null;
}
// Display/hard-disable only; the server continues to enforce the actual hold,
// current token, consent binding, signature and one-use transaction authority.
function formalConsentDeadlineBinding_(holdUntilUtc,result){
 const hold=formalConsentIsoMs_(holdUntilUtc),expires=formalConsentIsoMs_(result?.expiresAtUtc),now=formalConsentIsoMs_(result?.serverNowUtc);
 if(hold===null||expires===null||now===null||expires>hold||expires<=now)return null;
 return {holdUntilUtc,expiresAtUtc:result.expiresAtUtc,deadlineClock:formalConsentClockNow_()+Math.max(0,expires-now)};
}
function formalConsentDeadlineOpen_(x){
 return !!(x&&Number.isFinite(x.deadlineClock)&&formalConsentClockNow_()<x.deadlineClock);
}
function formalConsentDeadlineTick_(){
 const x=formalConsent,node=el('formalConsentDeadline');
 if(!node)return;
 let text='尚未核對同一暫留及簽署憑證期限。';
 if(x){
  if(x.signed)text='簽署已保存；請另行核對預約與完整PDF副本。';
  else if(formalSignSubmitted)text='簽署結果待原紀錄核對；請勿再次送件。';
  else if(!formalConsentDeadlineOpen_(x)){
   text='暫留或簽署憑證期限已到或無法核對。請勿重新提交或急著簽署；如時間不足，請聯絡研究團隊。';
   const finish=el('finish');if(finish)finish.disabled=true;
  }else{
   const minutes=Math.ceil((x.deadlineClock-formalConsentClockNow_())/60000);
   text='本次簽署憑證期限（臺灣）：'+formalTime_(x.expiresAtUtc)+'（約剩 '+minutes+' 分鐘）。請充分閱讀；如時間不足或有疑問，請先聯絡研究團隊。';
  }
 }
 if(node.textContent!==text)node.textContent=text;
}
function formalConsentRender_(){
 const x=formalConsent,ready=!!(x&&x.originalVerified&&x.researcherPresigned===true&&formalConsentDeadlineOpen_(x));
 formalConsentDeadlineTick_();`],
  ["  !x?'尚未核對E1本人有效預約。':\n  x.signed?'已在線上簽署；請核對完整PDF副本與原預約狀態。':",
   "  !x?'尚未核對E1本人有效預約。':\n  x.signed?'已在線上簽署；請核對完整PDF副本與原預約狀態。':\n  formalSignSubmitted?'簽署已送出，請從原紀錄唯讀核對，勿重送。':\n  !formalConsentDeadlineOpen_(x)?'期限已到或尚未核對，不能提交簽署。':"],
  ["  formalConsent.confirmed=result.staffConfirmed===true;\n  if(result.copyAvailable===true&&formalConsent.confirmed)",
   String.raw`  formalConsent.confirmed=result.staffConfirmed===true;
  if(!formalConsent.signed&&!formalSignSubmitted&&result.state==='ISSUED'){
   const refreshed=formalConsentDeadlineBinding_(formalConsent.holdUntilUtc,result);
   // A read-only refresh must never extend an existing issued credential.
   if(!refreshed||refreshed.expiresAtUtc!==formalConsent.expiresAtUtc)formalConsent.deadlineClock=0;
   else formalConsent.deadlineClock=Math.min(formalConsent.deadlineClock,refreshed.deadlineClock);
  }
  if(result.copyAvailable===true&&formalConsent.confirmed)`],
  ['    result.researcherPresigned!==true)return false;\n formalConsentReset_();\n formalConsent={token:result.token,reservationId:reservation.reservationId,',
   String.raw`    result.researcherPresigned!==true)return false;
 const deadline=formalConsentDeadlineBinding_(reservation.holdUntilUtc,result);
 if(!deadline)return false;
 formalConsentReset_();
 formalConsent={...deadline,token:result.token,reservationId:reservation.reservationId,`],
  [" if(el('agree'))el('agree').checked=false;\n if(el('readPdf'))el('readPdf').checked=false;\n}",
   String.raw` if(el('agree'))el('agree').checked=false;
 if(el('readPdf'))el('readPdf').checked=false;
 // Never reuse pixels from an earlier consent session, even after the ink flag was cleared.
 const ink=el('visitorSignaturePreview');
 if(ink&&typeof ink.getContext==='function')try{
  const ctx=ink.getContext('2d');if(ctx){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,ink.width,ink.height);}
 }catch(_){}
 formalConsentDeadlineTick_();
}`],
  [' let drawing=false;\n const coord=e=>{',' let drawing=false,drawingFor=null;\n const coord=e=>{'],
  ["     !formalConsent.originalVerified||formalConsent.signed)return;\n  drawing=true;const p=coord(e);ctx.beginPath();ctx.moveTo(p.x,p.y);",
   "     !formalConsent.originalVerified||formalConsent.signed||formalSignSubmitted||!formalConsentDeadlineOpen_(formalConsent))return;\n  drawing=true;drawingFor=formalConsent;const p=coord(e);ctx.beginPath();ctx.moveTo(p.x,p.y);"],
  ['  if(!drawing)return;const p=coord(e);ctx.lineTo(p.x,p.y);ctx.stroke();',
   '  if(!drawing||drawingFor!==formalConsent||!formalConsentDeadlineOpen_(formalConsent)||formalSignSubmitted){drawing=false;return;}const p=coord(e);ctx.lineTo(p.x,p.y);ctx.stroke();'],
  ["     !el('readPdf').checked||!el('agree').checked)return;\n  const canvas=el('visitorSignaturePreview');",
   "     !el('readPdf').checked||!el('agree').checked)return;\n  if(!formalConsentDeadlineOpen_(formalConsent)){formalConsentRender_();status('期限已到或無法核對；未提交簽署。請聯絡研究團隊，勿重送。');return;}\n  const canvas=el('visitorSignaturePreview');"],
  ['formalConsentWire_();\n\n\nfunction formalV08PendingPanel_',
   String.raw`formalConsentWire_();
if(typeof window!=='undefined'&&typeof window.setInterval==='function')window.setInterval(formalConsentDeadlineTick_,1000);

// Read an opaque capability only from the original GAS location fragment,
// strip it from browser history and retain it only in this page's memory.
function formalManagementStart_(){
 let token=null,view=null,submitted=false;
 const summary=el('managementSummary'),controls=el('managementControls'),submit=el('managementSubmit'),refresh=el('managementRefresh'),action=el('managementAction'),target=el('managementTarget'),confirm=el('managementConfirm');
 const unavailable=()=>{view=null;controls.hidden=true;summary.textContent='管理連結無法核實、已過期或目前不適用。請重新取得連結或聯絡研究團隊；不要重複報名。';};
 const update=()=>{
  const moving=action.value==='MOVE';target.hidden=!moving;el('managementTargetLabel').hidden=!moving;
  submit.disabled=state.busy||submitted||!view||!view.canRequest||!confirm.checked||(moving&&!target.value);
  submit.textContent=moving?'提交改期申請（待審核）':view&&view.cancellationMode==='DIRECT_APPROVED'?'確認取消原預約':'提交取消申請（待審核）';
 };
 const render=r=>{
  if(!r||r.scope!=='CONFIRMED_E1_BOOKING_ONLY'||!r.schedule||!Array.isArray(r.options)||!/^([a-f0-9]{64})$/.test(r.revision||'')||!['CONFIRMED','CANCELLED'].includes(r.status)){unavailable();return;}
  view=r;formalClear_(target);for(const s of r.options){const option=document.createElement('option');option.value=s.slotId;option.textContent=formalTime_(s.startAtUtc)+' – '+formalTime_(s.endAtUtc)+'｜'+s.locationCode;target.appendChild(option);}
  summary.textContent='原預約：'+r.reservationId+'｜'+formalTime_(r.schedule.startAtUtc)+' – '+formalTime_(r.schedule.endAtUtc)+'｜'+r.schedule.locationCode+'｜'+(r.status==='CONFIRMED'?'已確認':'已取消')+
   (r.pending?'｜'+(r.pending.action==='MOVE'?'改期':'取消')+'請求已保存：'+(r.pending.state==='CANCELLED_ORIGINAL_ROW'?'原預約目前已取消':'待研究團隊審核，勿視作已改期或取消'):'');
  el('managementExpiry').textContent='連結有效至（臺灣）：'+formalTime_(r.expiresAtUtc)+'。';
  confirm.checked=false;controls.hidden=submitted||!r.canRequest;update();
 };
 const read=()=>{if(!token||state.busy)return;controls.hidden=true;rpc('study1E1BookingManagementRead',token,render,unavailable);};
 refresh.addEventListener('click',read);action.addEventListener('change',()=>{confirm.checked=false;update();});target.addEventListener('change',()=>{confirm.checked=false;update();});confirm.addEventListener('change',update);
 submit.addEventListener('click',()=>{
  if(submitted||state.busy||!token||!view||!view.canRequest||!confirm.checked||submit.disabled)return;
  submitted=true;controls.hidden=true;submit.disabled=true;
  const q={token,revision:view.revision,action:action.value,targetSlotId:action.value==='MOVE'?target.value:'',requestId:genRequest()};
  const unknown=()=>{summary.textContent='提交結果未知；只能唯讀核對原紀錄，不得重送或另建預約。';refresh.hidden=false;};
  rpc('study1E1BookingManagementChange',q,r=>{if(r&&r.scope==='CONFIRMED_E1_BOOKING_ONLY')render(r);else unknown();},unknown);
 });
 if(typeof google==='undefined'||!google.script||!google.script.url||typeof google.script.url.getLocation!=='function'){formalInitialReadiness_();return;}
 google.script.url.getLocation(location=>{
  const hash=String(location?.hash||'');if(!hash.startsWith('M1.')){formalInitialReadiness_();return;}
  show('manage');document.title='Study1｜原預約管理';
  if(!google.script.history||typeof google.script.history.replace!=='function'){unavailable();return;}
  try{google.script.history.replace({}, {view:'apply'},'');}catch(_){unavailable();return;}
  if(!/^M1\.([-a-f0-9]{30,40})\.([0-9]{13})\.([a-f0-9]{64})\.([a-f0-9]{64})$/.test(hash)){unavailable();return;}
  token=hash;refresh.hidden=false;read();
 });
 if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('pagehide',()=>{token=null;view=null;submitted=true;controls.hidden=true;});
}
formalManagementStart_();


function formalV08PendingPanel_`]
 ],
 AdminConsole:[
  ['<section id="e1FormalOperations"',
   '<section id="e1FormalBookingChangeRequests"><h2>E1｜已確認預約的改期／取消申請</h2><p>只讀原私人申請存證及預約狀態；不等同已改期或取消、不得由此寫資料。</p><button id="formalChangeLoad" type="button">重新核對已提交申請</button><pre id="formalChangeResult" role="status" aria-live="polite"></pre></section><section id="e1FormalOperations"'],
  ['</script></body></html>',
   String.raw`(function(){const button=document.getElementById('formalChangeLoad'),output=document.getElementById('formalChangeResult');if(!button||!output)return;let epoch=0;
    window.addEventListener('pagehide',()=>{epoch++;output.textContent='';button.disabled=true;});
    button.addEventListener('click',()=>{const e=++epoch;button.disabled=true;output.textContent='正在核對原申請…';
     const fail=()=>{if(e!==epoch)return;button.disabled=false;output.textContent='無法完整核對正式來源或 OWNER 權限。';};
     google.script.run.withFailureHandler(fail).withSuccessHandler(r=>{if(e!==epoch)return;if(!r||r.readOnly!==true||r.experiment!=='E1'||!Array.isArray(r.rows)){fail();return;}
      button.disabled=false;output.textContent=r.rows.length?r.rows.map(q=>[q.reservationId,q.slotId,q.action,q.targetSlotId||'—',q.submittedAtUtc,q.bookingStatus,q.consentState].join('｜')).join('\n'):'目前無已核對的改期／取消申請。';}).study1OwnerE1BookingChangeRequests();
    });})();
</script></body></html>`]
 ]
};
function once(source,from,to,label){
 if(source.split(from).length!==2)throw Error('V2_CONFIRMATION_RECEIPT_SOURCE_ANCHOR_CHANGED:'+label);
 return source.replace(from,()=>to);
}
function transform(files,reverse){
 return files.map(file=>{
  let source=file.source;
  // sameSiteVisitor embeds both separately rendered branches. Never edit the
  // isolated TEST branch, even if it inherited an identical visible label.
  if(file.name==='Study1Visitor'){
   const start=source.indexOf('<body data-site-mode="FORMAL">'),end=source.lastIndexOf('</body>')+7;
   if(start<0||end<=start)throw Error('V2_CONFIRMATION_RECEIPT_FORMAL_BRANCH_CHANGED');
   let formal=source.slice(start,end);
   for(const [[a,b],index] of edits.Study1Visitor.map((pair,i)=>[pair,i]))
    formal=once(formal,reverse?b:a,reverse?a:b,file.name+':'+index);
   return {...file,source:source.slice(0,start)+formal+source.slice(end)};
  }
  if(reverse&&file.name==='Study1ParticipantIntake'){
   if(!source.endsWith(runtime))throw Error('V2_CONFIRMATION_RECEIPT_RUNTIME_CHANGED');
   source=source.slice(0,-runtime.length);
  }
  for(const [[a,b],index] of (edits[file.name]||[]).map((pair,i)=>[pair,i]))source=once(source,reverse?b:a,reverse?a:b,file.name+':'+index);
  if(!reverse&&file.name==='Study1ParticipantIntake')source+=runtime;
  return {...file,source};
 });
}
module.exports={apply:files=>transform(files,false),restore:files=>transform(files,true)};
