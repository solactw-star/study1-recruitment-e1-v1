'use strict';
const sameDate=require('./study1-v2-same-date.cjs');
// Formal E1 RPC integration. Building/publishing this source never enables
// intake: all four live switches and the original operation gates must pass.
const deny="if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();";
const gate='study1V2FormalEntryRequired_();';
const routes=Object.freeze({
 Study1ParticipantIntake:['study1ParticipantBeginOutcome','study1ParticipantBegin','study1ParticipantSendOtp','study1ParticipantOtpIssueState','study1ParticipantVerifyOtp','study1ParticipantEmailStatus','study1ParticipantRecoverySend','study1ParticipantRecoveryVerify'],
 Study1FormalBooking:['study1FormalV05Slots','study1FormalQuoteHold','study1FormalHoldSlot','study1FormalStatus','study1FormalHoldOutcome','study1FormalV08Outcome','study1FormalWaitlistJoin','study1FormalWaitlistClaim','study1FormalCancel','study1FormalMove'],
 Study1FormalConsent:['study1FormalConsentIssueState','study1FormalConsentBegin','study1FormalConsentOriginalPdf','study1FormalConsentStatus'],
 AdminSandbox:['study1EConsentSignPdf','study1EConsentSignedPdfCopy','study1EConsentWithdraw']
});
const closedReadiness="if(typeof study1V2PublicRpcDeny_==='function')return {ready:false,experiment:'E1',reason:'REGISTRATION_NOT_OPEN'};";
const liveReadiness="if(!study1V2FormalEntryOpen_())return {ready:false,experiment:'E1',reason:'REGISTRATION_NOT_OPEN'};";
const closedConfig="function getPublicConfig(){return {open:false,consentReady:false,contact:SITE_CONTACT_,mode:'CLOSED_INFORMATION'};}";
const liveConfig="function getPublicConfig(){const ready=study1ParticipantReadiness().ready===true;return {open:ready,consentReady:ready,contact:SITE_CONTACT_,mode:ready?'FORMAL_E1':'CLOSED_INFORMATION'};}";
const helpers=`
/** Private V2 configuration only; the original adapters still verify exact
 * workbook identity. Missing/malformed configuration disables formal reads.
 * No Sheet creation, migration, mutation or intake enablement occurs here. */
var SITE_RESOURCES_=(function(){
 try{
  const raw=PropertiesService.getScriptProperties().getProperty('STUDY1_V2_FORMAL_RESOURCES_V1');
  if(typeof raw!=='string'||raw.length>500)return null;
  const resources=JSON.parse(raw);
  if(!resources||Array.isArray(resources)||
     Object.keys(resources).sort().join(',')!=='operations,personal'||
     ![resources.personal,resources.operations].every(id=>typeof id==='string'&&/^[A-Za-z0-9_-]{15,100}$/.test(id)))return null;
  return Object.freeze(resources);
 }catch(_){return null;}
})();
/** Formal E1 entry only; never changes properties or authorizes OWNER RPCs. */
function study1V2FormalEntryOpen_(){
 const p=PropertiesService.getScriptProperties();
 return ['OPEN','CONSENT_READY','FORMAL_READY','LIVE_INTAKE_ENABLED']
  .every(key=>p.getProperty(key)==='true');
}
function study1V2FormalEntryRequired_(){
 if(!study1V2FormalEntryOpen_())throw Error('REGISTRATION_NOT_OPEN');
 study1ParticipantGate_();
}
/** New enrollment must not collect contact or screening data if a later
 * required step is known to be unavailable. This is configuration-only:
 * no participant records, email, token consumption, signature or writes.
 * Keep the existing per-operation and per-person gates independently intact. */
function study1V2NewE1IntakeRequired_(){
 try{
  study1V2FormalEntryRequired_();
  study1ParticipantMailGate_();
  study1WizardP0Gate_();
  const p=PropertiesService.getScriptProperties();
  study1BindingSheetId_('applicants');
  study1BindingSheetId_('slots');
  const otp=otpSecret_(p.getProperty('STUDY1_OTP_HMAC_SECRET'));
  if(/SIMULATED|TEST_ONLY|EXAMPLE|DEFAULT/i.test(otp))throw Error('E1_OTP_KEY_INVALID');
  const binding=p.getProperty('STUDY1_ECONSENT_BINDING_HMAC_KEY');
  if(typeof binding!=='string'||binding.length<32||
     /SIMULATED|TEST_ONLY|EXAMPLE|DEFAULT/i.test(binding))throw Error('E1_BINDING_KEY_INVALID');
  if(otp===binding)throw Error('E1_INDEPENDENT_KEYS_REQUIRED');
  const recRaw=p.getProperty('STUDY1_E1_REMOTE_CONSENT_POLICY_V1');
  study1FormalConsentGate_();
  study1FormalConsentCopyExpiry_();
  const scope=JSON.parse(recRaw);
  const document=study1EConsentReadyDocument_('E1');
  if(p.getProperty('STUDY1_E1_REMOTE_CONSENT_POLICY_V1')!==recRaw||
     document.id!==scope.consentDocumentId||document.sha256!==scope.consentDocumentSha256||
     document.researcherPresigned!==true)throw Error('E1_CONSENT_SOURCE_NOT_READY');
  const layout=study1PdfLayoutRead_('E1',document);
  study1PdfSameDateRead_(document,layout);
 }catch(_){
  // The public caller must not learn which private setting or source failed.
  throw Error('REGISTRATION_NOT_OPEN');
 }
 return true;
}
`;
function replaceOnce(source,from,to){
 if(source.split(from).length!==2)throw Error('V2_FORMAL_ENTRY_ANCHOR_CHANGED');
 return source.replace(from,()=>to);
}
const presentationEdits=[
  {
    file:'Study1ParticipantIntake',
    before:'function study1ParticipantBegin_(input){\n // Fail before parsing/using any personal data without real PI-pinned E1 slots.',
    after:'function study1ParticipantBegin_(input){\n study1V2NewE1IntakeRequired_();\n // Fail before parsing/using any personal data without real PI-pinned E1 slots.'
  },
  {
    file:'Study1ParticipantIntake',
    before:'  // Recheck inside the existing intake lock before the first applicant write.',
    after:'  study1V2NewE1IntakeRequired_();\n  // Recheck inside the existing intake lock before the first applicant write.'
  },
  {
    file:'Study1ParticipantIntake',
    before:'  // Readiness checks configuration only: a one-time Turnstile token is',
    after:'  study1V2NewE1IntakeRequired_();\n  // Readiness checks configuration only: a one-time Turnstile token is'
  },
  {
    file:'Study1Visitor',
    before:"function formalConsentWire_(){\n el('pdf').hidden=true;",
    after:"function formalConsentWire_(){\n el('pdf').hidden=true;\n const originalDownload=el('officialPdfDownload');\n if(originalDownload)originalDownload.textContent='下載已核對的研究者預簽版 PDF（尚未含本人簽名）';"
  },
  {
    file:'Study1Visitor',
    before:'原始PDF不包含此處的手寫簽名。正式提交須另生成完整簽署PDF及獨立SHA；目前尚未開放真人簽名及收件。',
    after:'研究者預簽版不含本次參與者筆跡。只有文件、本人授權及正式服務核實後，才可生成含雙方簽名與獨立 SHA 的完整副本。'
  },
  {
    file:'Study1Visitor',
    before:'尚未簽名；正式簽署服務目前關閉。',
    after:'尚未簽名；請先核實完整文件及本人簽署權限。'
  },
  {
    file:'Study1Visitor',
    before:'請閱讀研究者事先完成簽名並由後台上傳的正式PDF；確認理解後，在網站手寫受試者姓名，系統將簽名及臺灣日期加入同一份PDF，供研究者事先下載。',
    after:'請完整閱讀研究者預簽的正式 PDF，理解後親自書寫簽名。系統保留研究者預簽筆跡，依本次完成時間填入兩處臺灣日期，生成完整本人副本；預約是否確認須另外核實。'
  },
  {
    "file": "Index",
    "before": "withSuccessHandler(c=>{",
    "after": "withSuccessHandler(c=>{if(c&&c.open===true&&c.consentReady===true&&c.mode==='FORMAL_E1'){const section=document.getElementById('apply');section.querySelector('h2').textContent='實驗一報名與預約';section.querySelector('h3').textContent='閱讀研究資訊，再決定是否參與';section.querySelector('.preview-label').textContent='開放報名';section.querySelector('.closed p').textContent='資格自陳與電子郵件驗證後，可選擇時段、閱讀完整知情同意書並親自簽署，最後確認預約。';section.querySelector('a.btn').textContent='開始實驗一報名';const footer=document.querySelector('footer .container');if(footer)footer.textContent='中原大學心理學系研究團隊 · Study 1';status.textContent='實驗一開放報名；請進入正式流程確認參與條件。';return;}"
  },
  {
    "file": "Study1Visitor",
    "before": "if(note)note.textContent=state.ready?",
    "after": "if(state.ready){\n    document.title='Study1｜實驗一報名與預約';\n    el('stateE1').textContent='開放報名';\n    const screening=document.querySelector('#step-screen > p.lead');\n    if(screening)screening.textContent='請依自身實際狀況完成資格自陳，再填寫聯絡方式與驗證電子郵件。';\n    const screeningHelp=document.querySelector('#step-screen > p.help');\n    if(screeningHelp)screeningHelp.textContent='僅在資格自陳及人機驗證通過後建立本次申請；請勿重複送出。';\n    const otpHelp=document.querySelector('#step-otp > p.lead');\n    if(otpHelp)otpHelp.textContent='請查收電子郵件中的八位驗證碼。驗證碼限時且只能使用一次；驗證後才能選擇時段。';\n   }\n   if(note)note.textContent=state.ready?"
  },
  {
    "file": "Study1ParticipantTrust",
    "before": "['script.google.com','script.googleusercontent.com'].includes(host",
    "after": "(['script.google.com','script.googleusercontent.com'].includes(host)||\n      /^n-[a-z0-9-]{10,160}-script\\.googleusercontent\\.com$/.test(host)"
  }
];
function transform(files,reverse=false){
 return files.map(file=>{
  let source=file.source;
  for(const edit of presentationEdits.filter(x=>x.file===file.name))
   source=replaceOnce(source,reverse?edit.after:edit.before,reverse?edit.before:edit.after);
  for(const name of routes[file.name]||[]){
   const declaration=new RegExp('function '+name+'\\([^)]*\\)\\{');
   const match=source.match(declaration);
   if(!match)throw Error('V2_FORMAL_ENTRY_RPC_MISSING: '+name);
   source=replaceOnce(source,match[0]+(reverse?gate:deny),match[0]+(reverse?deny:gate));
  }
  if(file.name==='Study1ParticipantIntake')
   source=replaceOnce(source,reverse?liveReadiness:closedReadiness,reverse?closedReadiness:liveReadiness);
  if(file.name==='Website'){
   source=replaceOnce(source,reverse?liveConfig:closedConfig,reverse?closedConfig:liveConfig);
   if(reverse){
    if(!source.endsWith(helpers))throw Error('V2_FORMAL_ENTRY_HELPERS_CHANGED');
    source=source.slice(0,-helpers.length);
   }else source+=helpers;
  }
  return {...file,source};
 });
}
module.exports={apply:files=>sameDate.apply(transform(files)),restore:files=>transform(sameDate.restore(files),true)};
