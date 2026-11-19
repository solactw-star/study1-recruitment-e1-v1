'use strict';
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
function transform(files,reverse=false){
 return files.map(file=>{
  let source=file.source;
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
module.exports={apply:files=>transform(files),restore:files=>transform(files,true)};
