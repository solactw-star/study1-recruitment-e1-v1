'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const crypto=require('node:crypto');
const html=fs.readFileSync(path.join(__dirname,'../gas/Study1Visitor.html'),'utf8');
const start=html.indexOf("(function(){\n'use strict';\n// This controller reuses");
const end=html.indexOf("\n})();\n</script>",start);
assert.ok(start>0&&end>start,'original single visitor formal branch missing');
const script=html.slice(start,end+6);
function simulate(readiness,options={}){
 const nodes=new Map(),queries=new Map(),calls=[],rendered=[],errors=[];
 function node(id){
  if(!nodes.has(id))nodes.set(id,{
   id,hidden:id==='formalHumanCheck',disabled:false,textContent:'',value:'',
   checked:false,onclick:null,handlers:new Map(),
   addEventListener(type,fn){this.handlers.set(type,fn)}
  });
  return nodes.get(id);
 }
 const doc={
  body:{dataset:{siteMode:'FORMAL'}},
  head:{appendChild:el=>{if(el.onload)el.onload();return el}},
  getElementById:node,
  querySelector:sel=>{
   if(!queries.has(sel))queries.set(sel,{hidden:false,textContent:'',value:''});
   return queries.get(sel);
  },
  createElement:kind=>({kind,src:'',async:false,onload:null,onerror:null})
 };
 const server={
  study1ParticipantReadiness:()=>typeof readiness==='function'?readiness():readiness,
  study1ParticipantBegin:req=>({
   accepted:true,created:true,applicantId:'APP_CLOSED_TEST_12345678',
   screeningId:'SCR_CLOSED_TEST_12345678',phase:'PENDING_EMAIL'}),
  study1ParticipantBeginOutcome:()=>({found:false,status:'UNKNOWN'}),
  study1ParticipantSendOtp:req=>({
   sent:true,reason:'ISSUED',challengeId:'CHL_CLOSED_TEST_12345678'}),
  study1ParticipantOtpIssueState:req=>({found:false,status:'NOT_FOUND'}),
  study1ParticipantVerifyOtp:req=>({
   verified:true,reason:'EMAIL_CONTROL_ONLY',emailProof:{
    version:1,signature:'a'.repeat(64),applicantId:req.applicantId,
    challengeId:req.challengeId,screeningId:req.screeningId}}),
  study1ParticipantEmailStatus:req=>({
   emailVerified:true,eligibilitySource:'PARTICIPANT_SELF_REPORT',applicationState:'SELF_REPORTED_ELIGIBLE_EMAIL_VERIFIED',
   reservationState:'NOT_AUTHORIZED',consentState:'NOT_SIGNED'}),
  study1FormalV05Slots:req=>({experiment:'E1',slots:[]})
 };
 if(options.serverOverrides)Object.assign(server,options.serverOverrides);
 const runner={
  withFailureHandler(cb){this.failure=cb;return this},
  withSuccessHandler(cb){this.success=cb;return this}
 };
 for(const [method,fn] of Object.entries(server)){
  runner[method]=request=>{
   calls.push({method,request});
   try{this.success?.(fn(request));}catch(err){throw err;}
  };
 }
 // Avoid relying on the test's "this" binding in a dynamically composed RPC.
 for(const [method,fn] of Object.entries(server)){
  runner[method]=request=>{
   calls.push({method,request});
   try{runner.success(fn(request))}catch(error){errors.push(String(error?.stack||error));runner.failure?.(error)}
  };
 }
 const turnstile={
  render:(selector,options)=>{
   rendered.push({selector,options});
   return 'OFFLINE_WIDGET_ONLY';
  },
  reset:widget=>{rendered.push({reset:widget})}
 };
 const connected=options.rpcAvailable!==false;
 const ctx={document:doc,window:connected?{turnstile,google:{script:{run:runner}}}:{turnstile},
  ...(connected?{google:{script:{run:runner}}}:{}),
  crypto:{getRandomValues:arr=>crypto.randomFillSync(arr)},Uint8Array,
  Array,Object,String,Boolean,Number,Math,Error};
 vm.runInNewContext(script,ctx,{timeout:4000});
 function click(id){
  const n=node(id);
  if(n.disabled||n.hidden)return false;
  const f=n.handlers.get('click');
  if(!f)return false;
  f();return true;
 }
 return {node,queries,click,calls,rendered,errors,script};
}
test('Synthetic browser: closed gate prevents any applicant PII or CAPTCHA request',()=>{
 const s=simulate({ready:false,reason:'REGISTRATION_NOT_OPEN'});
 assert.equal(s.node('chooseE1').disabled,true);
 assert.equal(s.node('chooseE2').disabled,true);
 assert.equal(s.node('formalName').disabled,true);
 assert.equal(s.node('formalHumanCheck').hidden,true);
 assert.equal(s.click('chooseE1'),false);
 assert.equal(s.calls.filter(q=>q.method!=='study1ParticipantReadiness').length,0);
 assert.match(s.node('status').textContent,/尚未開放正式報名/);
 assert.match(s.queries.get('.noticebar').textContent,/目前尚未開放正式報名與簽署/);
 assert.match(s.node('siteNoticeText').textContent,/不蒐集申請資料、不寄送驗證碼/);
});
test('Synthetic browser: gated seven-stage E1 intake -> human token -> email proof -> pending review',()=>{
 const s=simulate({ready:true,experiment:'E1',
  siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'});
 assert.equal(s.node('chooseE1').disabled,false);
 assert.equal(s.node('chooseE2').disabled,true);
 assert.match(s.queries.get('.noticebar').textContent,/報名服務目前顯示可受理/);
 assert.equal(s.rendered[0].selector,'#formalTurnstile');
 assert.equal(s.rendered[0].options.action,'study1_e1_apply');
 assert.equal(s.node('formalHumanCheck').hidden,false);
 assert.equal(s.click('chooseE1'),true);
 assert.equal(s.node('step-screen').hidden,false);
 for(const key of ['adult','cycu','noDx','noTreatment','noPractice'])
  s.node(key).checked=true;
 s.node('formalName').value='合成申請者';
 s.node('formalEmail').value='synthetic.e1@example.org';
 s.node('formalPhone').value='';
 assert.equal(s.click('screenNext'),true);
 assert.match(s.node('status').textContent,/人機驗證/);
 assert.equal(s.calls.some(x=>x.method==='study1ParticipantBegin'),false);
 s.rendered[0].options.callback('SYNTHETIC_HUMAN_TOKEN_PROVIDED_BY_WIDGET');
 assert.equal(s.click('screenNext'),true);
 const begun=s.calls.find(x=>x.method==='study1ParticipantBegin');
 assert.equal(begun.request.experiment,'E1');
 assert.equal(begun.request.email,'synthetic.e1@example.org');
 assert.equal(begun.request.humanToken,'SYNTHETIC_HUMAN_TOKEN_PROVIDED_BY_WIDGET');
 assert.equal(s.node('step-otp').hidden,false);
 assert.equal(s.click('otpSend'),true);
 assert.equal(s.calls.some(x=>x.method==='study1ParticipantSendOtp'),true);
 assert.equal(s.node('otpInputWrap').hidden,false);
 s.node('otpInput').value='24681357';
 assert.equal(s.click('otpVerify'),true);
 assert.equal(s.calls.some(x=>x.method==='study1ParticipantVerifyOtp'),true);
 assert.equal(s.calls.some(x=>x.method==='study1ParticipantEmailStatus'),true);
 assert.equal(s.calls.some(x=>x.method==='study1FormalV05Slots'),true,JSON.stringify({calls:s.calls.map(x=>x.method),errors:s.errors}));
 assert.equal(s.node('step-slots').hidden,false);
 assert.equal(s.node('hold').disabled,true,'no verified formal slot to book');
 assert.equal(s.node('step-consent').hidden,true,'no remote PDF signature ahead of independent identity');
 assert.match(s.node('status').textContent,/目前沒有已核實可選的E1場次/);
 assert.equal(s.calls.some(x=>/UnifiedPreview|SIMULATED/.test(x.method)),false);
});
test('Synthetic browser: Turnstile token expires and cannot be implicitly reused',()=>{
 const s=simulate({ready:true,experiment:'E1',
  siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'});
 s.click('chooseE1');s.rendered[0].options.callback('HUMAN_TOKEN_INITIAL');
 s.rendered[0].options['expired-callback']();
 assert.equal(s.click('screenNext'),true);
 assert.equal(s.calls.some(x=>x.method==='study1ParticipantBegin'),false);
});

test('FORMAL readiness service failure remains visibly CLOSED and cannot collect PII',()=>{
 const s=simulate(()=>{throw Error('OFFLINE_READINESS_FAILURE')});
 assert.equal(s.errors.length,1,'readiness network failure must be exercised');
 assert.equal(s.node('chooseE1').disabled,true);
 assert.equal(s.node('chooseE2').disabled,true);
 assert.equal(s.node('formalName').disabled,true);
 assert.equal(s.node('formalHumanCheck').hidden,true);
 assert.equal(s.click('chooseE1'),false);
 assert.equal(s.calls.filter(x=>x.method!=='study1ParticipantReadiness').length,0);
 assert.match(s.queries.get('.noticebar').textContent,/尚未開放正式報名與簽署/);
 assert.match(s.node('siteNoticeText').textContent,/不蒐集申請資料/);
});

test('FORMAL page without any Google authorization or RPC still displays CLOSED and collects nothing',()=>{
 const s=simulate(null,{rpcAvailable:false});
 assert.equal(s.calls.length,0);
 assert.equal(s.node('chooseE1').disabled,true);
 assert.equal(s.node('chooseE2').disabled,true);
 assert.equal(s.node('formalName').disabled,true);
 assert.equal(s.node('formalEmail').disabled,true);
 assert.equal(s.node('formalPhone').disabled,true);
 assert.equal(s.node('formalHumanCheck').hidden,true);
 assert.equal(s.click('chooseE1'),false);
 assert.match(s.node('status').textContent,/尚未開放線上報名/);
 assert.match(s.queries.get('.noticebar').textContent,/目前尚未開放正式報名與簽署/);
});

function mockEligibleE1(s){
 assert.equal(s.click('chooseE1'),true);
 for(const key of ['adult','cycu','noDx','noTreatment','noPractice'])
  s.node(key).checked=true;
 s.node('formalName').value='合成申請者';
 s.node('formalEmail').value='synthetic.e1@example.org';
 s.node('formalPhone').value='';
 s.rendered[0].options.callback('SYNTHETIC_HUMAN_TOKEN_FOR_E1');
 assert.equal(s.click('screenNext'),true);
 assert.equal(s.node('step-otp').hidden,false);
}
test('E1 ineligible self-report stops before sending private data or CAPTCHA token',()=>{
 const s=simulate({ready:true,experiment:'E1',siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'});
 assert.equal(s.click('chooseE1'),true);
 for(const key of ['adult','cycu','noDx','noTreatment','noPractice'])s.node(key).checked=true;
 s.node('noTreatment').checked=false;
 assert.equal(s.click('screenNext'),true);
 assert.equal(s.node('step-ineligible').hidden,false);
 assert.equal(s.calls.some(x=>x.method==='study1ParticipantBegin'),false);
 assert.match(s.node('status').textContent,/未送出姓名/);
});
test('E1 malformed contact stays local without calling begin RPC',()=>{
 const s=simulate({ready:true,experiment:'E1',siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'});
 assert.equal(s.click('chooseE1'),true);
 for(const key of ['adult','cycu','noDx','noTreatment','noPractice'])s.node(key).checked=true;
 s.node('formalName').value='X';
 s.node('formalEmail').value='broken-address';
 s.rendered[0].options.callback('SYNTHETIC_HUMAN_TOKEN_FOR_E1');
 assert.equal(s.click('screenNext'),true);
 assert.equal(s.calls.some(x=>x.method==='study1ParticipantBegin'),false);
 assert.match(s.node('status').textContent,/資料尚未送出/);
});
test('non-screening backend rejection does not falsely report ineligible',()=>{
 const s=simulate({ready:true,experiment:'E1',siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'},
 {serverOverrides:{study1ParticipantBegin:()=>({accepted:false,reason:'BACKEND_NOT_READY'})}});
 assert.equal(s.click('chooseE1'),true);
 for(const key of ['adult','cycu','noDx','noTreatment','noPractice'])s.node(key).checked=true;
 s.node('formalName').value='合成申請者';s.node('formalEmail').value='synthetic.e1@example.org';
 s.rendered[0].options.callback('SYNTHETIC_HUMAN_TOKEN_FOR_E1');
 assert.equal(s.click('screenNext'),true);
 assert.equal(s.node('step-ineligible').hidden,true);
 assert.equal(s.node('step-screen').hidden,false);
 assert.match(s.node('status').textContent,/不重新送出個資/);
});
test('OTP THROTTLED never claims email sent; repeated click cannot issue a second challenge',()=>{
 const s=simulate({ready:true,experiment:'E1',siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'},
 {serverOverrides:{study1ParticipantSendOtp:()=>({sent:false,reason:'THROTTLED'})}});
 mockEligibleE1(s);
 assert.equal(s.click('otpSend'),true);
 assert.equal(s.node('otpInputWrap').hidden,true);
 assert.equal(s.node('otpSend').disabled,true);
 assert.match(s.node('status').textContent,/頻率限制/);
 assert.equal(s.click('otpSend'),false);
 assert.equal(s.calls.filter(x=>x.method==='study1ParticipantSendOtp').length,1);
});
test('OTP ALREADY_ISSUED shows existing challenge only; does not imply a new email',()=>{
 const s=simulate({ready:true,experiment:'E1',siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'},
 {serverOverrides:{study1ParticipantSendOtp:()=>({sent:false,reason:'ALREADY_ISSUED',challengeId:'CHL_CLOSED_TEST_12345678'})}});
 mockEligibleE1(s);s.click('otpSend');
 assert.equal(s.node('otpInputWrap').hidden,false);
 assert.match(s.node('status').textContent,/不再寄送/);
 assert.equal(s.click('otpSend'),false);
});
test('OTP uncertain server failure is not retried with another requestId',()=>{
 const s=simulate({ready:true,experiment:'E1',siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'},
 {serverOverrides:{study1ParticipantSendOtp:()=>{throw Error('OFFLINE_MAIL_UNKNOWN')}}});
 mockEligibleE1(s);s.click('otpSend');
 assert.equal(s.node('otpSend').disabled,true);
 assert.equal(s.node('otpInputWrap').hidden,true);
 assert.equal(s.click('otpSend'),false);
 assert.equal(s.calls.filter(x=>x.method==='study1ParticipantSendOtp').length,1);
 assert.match(s.node('status').textContent,/請勿重複送出/);
});
test('OTP incorrect code shape never reaches verification RPC',()=>{
 const s=simulate({ready:true,experiment:'E1',siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'});
 mockEligibleE1(s);s.click('otpSend');
 s.node('otpInput').value='12abc';
 assert.equal(s.click('otpVerify'),true);
 assert.equal(s.calls.some(x=>x.method==='study1ParticipantVerifyOtp'),false);
 assert.match(s.node('status').textContent,/八位數驗證碼/);
});

test('Unknown MailApp outcome is reconciled with ONE read-only original challenge lookup',()=>{
 const s=simulate({ready:true,experiment:'E1',siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'},
 {serverOverrides:{
   study1ParticipantSendOtp:()=>{throw Error('UNKNOWN_MAIL_RECEIPT')},
   study1ParticipantOtpIssueState:()=>({found:true,status:'PENDING',
    delivery:'UNVERIFIED',challengeId:'CHL_CLOSED_TEST_12345678'})
 }});
 mockEligibleE1(s);s.click('otpSend');
 assert.equal(s.calls.filter(x=>x.method==='study1ParticipantSendOtp').length,1);
 assert.equal(s.calls.filter(x=>x.method==='study1ParticipantOtpIssueState').length,1);
 assert.equal(s.node('otpInputWrap').hidden,false);
 assert.equal(s.click('otpSend'),false);
 assert.match(s.node('status').textContent,/郵件是否送達仍未知/);
});
test('Read-only OTP status USED refuses new one-time verification and resend',()=>{
 const s=simulate({ready:true,experiment:'E1',siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'},
 {serverOverrides:{
   study1ParticipantSendOtp:()=>{throw Error('MAIL_UNKNOWN')},
   study1ParticipantOtpIssueState:()=>({found:true,status:'USED'})
 }});
 mockEligibleE1(s);s.click('otpSend');
 assert.equal(s.node('otpVerify').disabled,true);
 assert.equal(s.node('otpInputWrap').hidden,true);
 assert.equal(s.click('otpSend'),false);
 assert.match(s.node('status').textContent,/已一次性使用/);
});
test('Verification RPC uncertain outcome blocks repeat of consumed OTP',()=>{
 const s=simulate({ready:true,experiment:'E1',siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'},
 {serverOverrides:{study1ParticipantVerifyOtp:()=>{throw Error('OTP_COMMIT_UNKNOWN')}}});
 mockEligibleE1(s);s.click('otpSend');
 s.node('otpInput').value='24681357';
 assert.equal(s.click('otpVerify'),true);
 assert.equal(s.node('otpVerify').disabled,true);
 assert.equal(s.click('otpVerify'),false);
 assert.equal(s.calls.filter(x=>x.method==='study1ParticipantVerifyOtp').length,1);
 assert.match(s.node('status').textContent,/可能已一次性使用/);
});
test('After OTP succeeds but Applicants state readback fails, no OTP is consumed twice',()=>{
 const s=simulate({ready:true,experiment:'E1',siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'},
 {serverOverrides:{study1ParticipantEmailStatus:()=>{throw Error('APPLICANT_STATE_UNKNOWN')}}});
 mockEligibleE1(s);s.click('otpSend');
 s.node('otpInput').value='24681357';s.click('otpVerify');
 assert.equal(s.node('otpVerify').disabled,true);
 assert.equal(s.click('otpVerify'),false);
 assert.equal(s.calls.filter(x=>x.method==='study1ParticipantVerifyOtp').length,1);
 assert.equal(s.node('step-slots').hidden,true);
 assert.match(s.node('status').textContent,/回讀未知/);
});

test('lost intake POST after original write is recovered by GET with same requestId, never replays Turnstile',()=>{
 const s=simulate({ready:true,experiment:'E1',siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'},
 {serverOverrides:{
  study1ParticipantBegin:()=>{throw Error('APPLICATION_COMMIT_BUT_RESPONSE_LOST')},
  study1ParticipantBeginOutcome:()=>({found:true,status:'PENDING_EMAIL',
   applicantId:'APP_CLOSED_TEST_12345678',screeningId:'SCR_CLOSED_TEST_12345678'})
 }});
 mockEligibleE1(s);
 const issued=s.calls.filter(x=>x.method==='study1ParticipantBegin'),
  looked=s.calls.filter(x=>x.method==='study1ParticipantBeginOutcome');
 assert.equal(issued.length,1);assert.equal(looked.length,1);
 assert.equal(looked[0].request.requestId,issued[0].request.requestId);
 assert.equal(looked[0].request.email,issued[0].request.email);
 assert.equal(Object.hasOwn(looked[0].request,'humanToken'),false);
 assert.equal(s.node('step-otp').hidden,false);
 assert.match(s.node('status').textContent,/唯讀找回/);
 assert.equal(s.calls.filter(x=>x.method==='study1ParticipantBegin').length,1);
});
test('lost intake POST with partial or missing original records never causes a second POST',()=>{
 for(const outcome of [{found:false,status:'UNKNOWN'},{found:false,status:'PARTIAL_UNKNOWN'}]){
  const s=simulate({ready:true,experiment:'E1',
   siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'},
  {serverOverrides:{
   study1ParticipantBegin:()=>{throw Error('POST_OUTCOME_UNKNOWN')},
   study1ParticipantBeginOutcome:()=>outcome
  }});
  s.click('chooseE1');
  for(const key of ['adult','cycu','noDx','noTreatment','noPractice'])s.node(key).checked=true;
  s.node('formalName').value='合成申請者';s.node('formalEmail').value='synthetic.e1@example.org';
  s.rendered[0].options.callback('SYNTHETIC_FIRST_ONCE_TOKEN');
  s.click('screenNext');
  assert.equal(s.node('step-otp').hidden,true);
  s.rendered[0].options.callback('SYNTHETIC_OTHER_TOKEN'); // cannot replay
  s.click('screenNext');
  assert.equal(s.calls.filter(x=>x.method==='study1ParticipantBegin').length,1);
  assert.match(s.node('status').textContent,/不重新送出個資/);
 }
});

test('applicant readback EMAIL_VERIFIED never issues a new OTP or impersonates a consumed email proof',()=>{
 const s=simulate({ready:true,experiment:'E1',siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'},
 {serverOverrides:{
  study1ParticipantBegin:()=>{throw Error('APPLICATION_POST_UNKNOWN')},
  study1ParticipantBeginOutcome:()=>({found:true,status:'EMAIL_VERIFIED',
   applicantId:'APP_CLOSED_TEST_12345678',screeningId:'SCR_CLOSED_TEST_12345678'})
 }});
 s.click('chooseE1');
 for(const key of ['adult','cycu','noDx','noTreatment','noPractice'])s.node(key).checked=true;
 s.node('formalName').value='合成申請者';s.node('formalEmail').value='synthetic.e1@example.org';
 s.rendered[0].options.callback('SYNTHETIC_TOKEN_ONLY_ONCE');
 s.click('screenNext');
 assert.equal(s.node('step-otp').hidden,false);
 assert.equal(s.node('otpSend').disabled,true);
 assert.equal(s.node('otpVerify').disabled,true);
 assert.equal(s.click('otpSend'),false);
 assert.equal(s.calls.some(x=>x.method==='study1ParticipantSendOtp'),false);
 assert.equal(s.calls.some(x=>x.method==='study1ParticipantVerifyOtp'),false);
 assert.match(s.node('status').textContent,/不能|不得|核對/);
});
