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
`;
function replaceOnce(source,from,to){
 if(source.split(from).length!==2)throw Error('V2_FORMAL_ENTRY_ANCHOR_CHANGED');
 return source.replace(from,()=>to);
}
const presentationEdits=[
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
