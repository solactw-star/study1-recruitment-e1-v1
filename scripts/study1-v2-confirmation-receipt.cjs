'use strict';

// V2 formal booking receipt and notice integration. The original public RPCs,
// OTP proof, gates, signed-PDF checks and once-only notification writer remain
// the only entry points. This module never changes a live switch.
const runtime=String.raw`

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
  ["   delivery:'UNVERIFIED'};",
   "   delivery:'UNVERIFIED',expiresAtUtc:new Date(expires).toISOString()};"],
  ["   throw Error('E1_NOTICE_ORIGINAL_BOOKING_CHRONOLOGY_INVALID');\n  const book=SpreadsheetApp.openById(study1BindingSheetId_('reservations'));",
   String.raw`   throw Error('E1_NOTICE_ORIGINAL_BOOKING_CHRONOLOGY_INVALID');
  const schedule=study1V2ReceiptSchedule_(snapshot,binding.slotId,lock);
  const local=utc=>Utilities.formatDate(new Date(utc),'Asia/Taipei','yyyy/MM/dd HH:mm');
  if(!Number.isSafeInteger(entry.expires))throw Error('E1_NOTICE_COPY_EXPIRY_INVALID');
  const copyUntil=new Date(entry.expires);
  if(!Number.isFinite(copyUntil.getTime()))throw Error('E1_NOTICE_COPY_EXPIRY_INVALID');
  // Prepare before creating the existing at-most-once DISPATCHING row.
  const confirmationBody=[
   '您的 Study1 實驗一報名與預約已確認。',
   '開始時間（臺灣）：'+local(schedule.startAtUtc),
   '結束時間（臺灣）：'+local(schedule.endAtUtc),
   '地點：'+schedule.locationCode,
   '預約編號：'+binding.reservationId,
   '您已完成研究者預簽知情同意書的本人簽署。請於原報名頁有效驗證期間下載完整副本；副本存取期限至（臺灣）：'+local(copyUntil)+ '。',
   '本信不附私人 PDF 或存取憑證。若有疑問、需改期或取消，請與研究團隊聯絡；不要重新報名。'
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
   "formalConsentWire_();\nif(typeof window!=='undefined'&&typeof window.setInterval==='function')window.setInterval(formalConsentDeadlineTick_,1000);\n\n\nfunction formalV08PendingPanel_"]
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
