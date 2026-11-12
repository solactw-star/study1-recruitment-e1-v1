/** Study 1: closed information website. Existing research databases are preserved.
 * Intake endpoints deliberately cannot be enabled by changing properties.
 * Approved PDF, signature workflow, privacy notice and live security tests remain required.
 */
const SITE_CONTACT_ = 'lily4318@cycu.edu.tw';
const SITE_RESOURCES_ = Object.freeze({workspace:'1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU',sourceFolder:'1O6j7PQWMNUbb_a6cWHegy7lBZPMQ0Hiu',personal:'1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI',operations:'1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ'});
function study1V2SelfWebUrl_(){
 // Resolve links at request time; never embed a private deployment ID in public source.
 // Refuse to navigate to another Apps Script project or an unverified URL shape.
 try{
  if(ScriptApp.getScriptId()!=='1qg3PuI8sGFOAP-pJ889d9RrN0p_e0zsfqM274HgG4sEg9Qjv-xzqeL2f')return '';
  const url=String(ScriptApp.getService().getUrl()||'');
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/(?:exec|dev)$/.test(url)?url:'';
 }catch(_){return '';}
}
function doGet(e){if(e&&e.parameter&&['admin','team','preview','demo'].includes(e.parameter.view))throw new Error('STUDY1_V2_PUBLIC_READ_ONLY');if(e&&e.parameter&&e.parameter.view==='admin'){study1AdminOwnerRequired_();return HtmlService.createHtmlOutputFromFile('AdminConsole').setTitle('Study 1｜研究室測試後台').addMetaTag('viewport','width=device-width, initial-scale=1');}if(e&&e.parameter&&e.parameter.view==='preview'){study1AdminOwnerRequired_();study1SandboxBookingFlags_();return HtmlService.createHtmlOutputFromFile('Study1Unified').setTitle('Study 1｜完整招募流程測試模式').addMetaTag('viewport','width=device-width, initial-scale=1');}if(e&&e.parameter&&e.parameter.view==='team'){study1AdminOwnerRequired_();study1SandboxBookingFlags_();return HtmlService.createHtmlOutputFromFile('Study1Team').setTitle('Study 1｜研究團隊網站管理').addMetaTag('viewport','width=device-width, initial-scale=1');}if(e&&e.parameter&&e.parameter.view==='demo'){study1AdminOwnerRequired_();const t=HtmlService.createTemplateFromFile('Study1Visitor');t.flowMode='FORMAL';t.siteAppUrl=study1V2SelfWebUrl_();return t.evaluate().setTitle('Study 1｜研究報名').addMetaTag('viewport','width=device-width, initial-scale=1');}if(e&&e.parameter&&e.parameter.view==='apply'){const t=HtmlService.createTemplateFromFile('Study1Visitor');t.flowMode='FORMAL';t.siteAppUrl=study1V2SelfWebUrl_();return t.evaluate().setTitle('Study 1｜研究報名').addMetaTag('viewport','width=device-width, initial-scale=1');}const t=HtmlService.createTemplateFromFile('Index');t.siteAppUrl=study1V2SelfWebUrl_();return t.evaluate().setTitle('Study 1｜研究招募資訊').addMetaTag('viewport','width=device-width, initial-scale=1');}
/** V2 Google-login-only browse: every sensitive RPC rejects before data access.
 * Private immutable version 1 remains independent and unchanged.
 */
function study1V2PublicRpcDeny_(){throw new Error('STUDY1_V2_PUBLIC_READ_ONLY');}
function getPublicConfig(){return {open:false,consentReady:false,contact:SITE_CONTACT_,mode:'CLOSED_INFORMATION'};}
/** Only owner-explicit published, source-SHA-verified full blank PDFs; no Drive URLs. */
function getPublicConsentDocument(experiment){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();return study1ConsentPublicRead_(experiment);}
function rejectIntake_(){throw new Error('目前尚未開放正式報名與電子簽署。請聯絡研究團隊：'+SITE_CONTACT_);}
function requestOtp(){return rejectIntake_();}
function verifyOtp(){return rejectIntake_();}
function holdSlot(){return rejectIntake_();}
function cancelHold(){return rejectIntake_();}
function submitConsent(){return rejectIntake_();}
function listSlots(){return [];}
function setOpen_(){return rejectIntake_();}
function initializeClosedSystem_(){
 const p=PropertiesService.getScriptProperties();
 // Preserve every other property. No database, folder, permission, or trigger is created.
 p.setProperties({OPEN:'false',CONSENT_READY:'false'},false);
 const result={open:p.getProperty('OPEN'),consentReady:p.getProperty('CONSENT_READY')};
 if(result.open!=='false'||result.consentReady!=='false')throw new Error('關閉設定驗證失敗');
 console.log(JSON.stringify(result));return result;
}
function runClosedChecks_(){
 initializeClosedSystem_();
 const checks=[];
 const assert=(condition,label)=>{if(!condition)throw new Error('FAIL: '+label);checks.push(label);};
 const cfg=getPublicConfig();
 assert(cfg.open===false&&cfg.consentReady===false,'public configuration closed');
 assert(cfg.contact==='lily4318@cycu.edu.tw','public contact');
 assert(Object.keys(cfg).sort().join(',')==='consentReady,contact,mode,open','no private IDs in public configuration');
 [requestOtp,verifyOtp,holdSlot,cancelHold,submitConsent,setOpen_].forEach(fn=>{let blocked=false;try{fn();}catch(e){blocked=/尚未開放/.test(e.message);}assert(blocked,'blocked '+fn.name);});
 assert(listSlots().length===0,'no public slots');
 const html=HtmlService.createHtmlOutputFromFile('Index').getContent();
 assert(html.startsWith('<!doctype html>'),'complete HTML document');
 assert(!/<(?:form|textarea)\b/i.test(html),'no live collection form');
 const inputs=[...html.matchAll(/<input\b[^>]*>/gi)].map(x=>x[0]);
 assert(inputs.length===0,'public introduction has no identity or signature fields');
 assert(html.includes("siteAppUrl + '?view=apply'")&& !html.includes('AKfycbwJv-Gne_31fj')&&
  !html.includes('id="consent"')&&!html.includes('href="#consent"')&&
  !html.includes('完整閱讀研究文件，再決定是否同意')&&
  !html.includes('id="consentSignature"')&&!html.includes('id="consentSubmit"')&&
  !html.includes('initConsentPortal_')&&!/<(?:canvas|iframe)\b/i.test(html),
  'public introduction cannot request a signature');
 assert(!/<script[^>]+src=/i.test(html),'no external script');
 assert(html.includes('id="apply"')&&html.includes('id="contact"'),'required navigation destinations');
 assert(html.includes('查看正式報名流程（目前不收件）'),'closed formal entry must replace disabled demo/product button');
 const result={ok:true,checks:checks,count:checks.length,intakeOpen:false,consentReady:false};
 console.log(JSON.stringify(result));return result;
}
