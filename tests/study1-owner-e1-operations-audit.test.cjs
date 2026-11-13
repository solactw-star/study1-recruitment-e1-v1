'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const backend=fs.readFileSync(path.join(root,'gas/Study1ParticipantIntake.js'),'utf8');
const ownerHtml=fs.readFileSync(path.join(root,'gas/AdminConsole.html'),'utf8');
const src=backend.slice(backend.indexOf('function study1OwnerE1NotificationAudit(){'));
assert.ok(src.startsWith('function study1OwnerE1NotificationAudit(){'));
const RID='11111111-2222-3333-4444-555555555555';
const APP='APP_ORIGINAL_12345678',RSV='RSV_ORIGINAL_12345678';
const job='NTF_'+'a'.repeat(28);
const timestamp='2026-11-13T06:00:00.000Z';
function row(status='PROVIDER_ACCEPTED'){
 return [job,APP,RSV,'E1_RESERVATION_CONFIRMED',status,1,timestamp,
  status==='PROVIDER_ACCEPTED'?timestamp:'',
  status==='UNKNOWN'?'MAIL_PROVIDER_OUTCOME_UNKNOWN':''];
}
function harness(opts={}){
 let ownerChecks=0,readCount=0,mailCalls=0,writes=0,unlocks=0,openCount=0;
 const entry={id:RID,channel:'FORMAL_E1',experiment:'E1',
  researcherPresigned:true,state:opts.state||'CONFIRMED',
  binding:{applicantId:APP,reservationId:RSV,experiment:'E1'}};
 const rows=opts.rows||[row()];
 let locked=opts.lockLost!==true;
 const ctx={
  study1AdminOwnerRequired_:()=>{ownerChecks++;if(opts.denied)throw Error('OWNER_REQUIRED');},
  LockService:{getScriptLock:()=>({tryLock:()=>opts.lockBusy!==true,
   hasLock:()=>locked,releaseLock:()=>{unlocks++;}})},
  study1EConsentRegistry_:()=>({revision:opts.revision??4,records:opts.entries||[entry]}),
  SpreadsheetApp:{openById:()=>{openCount++;return {};},flush:()=>{writes++;}},
  study1BindingSheetId_:()=> 'ORIGINAL_OPERATIONS',
  study1WizardTable_:(_,name,headers)=>{
   assert.equal(name,'Notifications');assert.equal(headers.length,9);
   return {n:rows.length+1,tab:{getRange:(r,c,n,w)=>{
    assert.deepEqual([r,c,n,w],[2,1,rows.length,9]);
    return {getValues:()=>{
     readCount++;const values=rows.map(r=>r.slice());
     if(opts.drift&&readCount===2&&values.length)values[0][4]='UNKNOWN';
     return values;
    }};
   }}};
  },
  study1BindingHmac_:parts=>{
   assert.deepEqual(JSON.parse(JSON.stringify(parts)),
    ['E1_BOOKING_CONFIRMATION_NOTICE_V1',RID,APP,RSV]);
   return 'a'.repeat(64);
  },
  STUDY1_E1_NOTIFICATION_HEADERS_:[
   'job_id','applicant_id','reservation_id','notice_type','status',
   'attempts','created_at_utc','sent_at_utc','last_error_code'],
  MailApp:{sendEmail:()=>{mailCalls++;}}
 };
 if(opts.publicDenied)ctx.study1V2PublicRpcDeny_=()=>{throw Error('PUBLIC_RPC_DENIED');};
 vm.createContext(ctx);vm.runInContext(src,ctx);
 return {ctx,rows,entry,lockLost:()=>{locked=false;},
  counters:()=>({ownerChecks,readCount,mailCalls,writes,unlocks,openCount})};
}
test('OWNER reads original outbox twice and never claims MailApp acceptance as delivery',()=>{
 const f=harness(),ans=f.ctx.study1OwnerE1NotificationAudit();
 assert.equal(ans.readOnly,true);
 assert.equal(ans.source,'ORIGINAL_NOTIFICATIONS');
 assert.equal(ans.consentRevision,4);
 assert.deepEqual(JSON.parse(JSON.stringify(ans.records)),[{
  id:RID,consentState:'CONFIRMED',
  noticeStatus:'PROVIDER_ACCEPTED_NOT_DELIVERED'}]);
 assert.deepEqual(f.counters(),{ownerChecks:2,readCount:2,mailCalls:0,
  writes:0,unlocks:1,openCount:1});
 assert.doesNotMatch(JSON.stringify(ans),/example.org|APP_ORIGINAL|RSV_ORIGINAL|MailApp|http/);
});
test('no job, unknown provider and in-flight dispatch never imply mail delivery',()=>{
 for(const [rows,expected] of [
  [[], 'NOT_QUEUED'],
  [[row('UNKNOWN')], 'UNKNOWN_REQUIRES_STAFF_REVIEW'],
  [[row('DISPATCHING')], 'UNKNOWN_REQUIRES_STAFF_REVIEW']
 ]){
  const f=harness({rows});const a=f.ctx.study1OwnerE1NotificationAudit();
  assert.equal(a.records[0].noticeStatus,expected);
  assert.equal(f.counters().mailCalls,0);
 }
});
test('duplicate, forged, wrong-party and corrupted outbox rows fail closed',()=>{
 for(const rows of [
  [row(),row()],
  [[...row().slice(0,1),'OTHER',...row().slice(2)]],
  [[...row().slice(0,5),2,...row().slice(6)]],
  [[...row().slice(0,4),'SENT',...row().slice(5)]],
  [[...row().slice(0,7),'','']],
  [[...row().slice(0,8),'SENT_BUT_UNVERIFIED']],
  [['FORGED_JOB',...row().slice(1)]],
  [row().slice(0,8)]
 ]){
  const f=harness({rows});
  if(rows[0].length===9)
   assert.equal(f.ctx.study1OwnerE1NotificationAudit().records[0].noticeStatus,'SOURCE_MISMATCH');
  else assert.throws(()=>f.ctx.study1OwnerE1NotificationAudit(),/ROW_INVALID/);
  assert.equal(f.counters().mailCalls,0);
 }
});
test('public RPC is rejected before OWNER, registry, Sheets or MailApp',()=>{
 const f=harness({publicDenied:true});
 assert.throws(()=>f.ctx.study1OwnerE1NotificationAudit(),/PUBLIC_RPC_DENIED/);
 assert.deepEqual(f.counters(),{ownerChecks:0,readCount:0,mailCalls:0,
  writes:0,unlocks:0,openCount:0});
});
test('non-OWNER is rejected before private reads',()=>{
 const f=harness({denied:true});
 assert.throws(()=>f.ctx.study1OwnerE1NotificationAudit(),/OWNER_REQUIRED/);
 assert.equal(f.counters().openCount,0);
 assert.equal(f.counters().readCount,0);
});
test('read drift, invalid registry and missing lock stop instead of returning false certainty',()=>{
 for(const [opts,code] of [
  [{drift:true},/DOUBLE_SNAPSHOT_CHANGED/],
  [{revision:'corrupt'},/CONSENT_SOURCE_INVALID/],
  [{lockLost:true},/LOCK_LOST/],
  [{lockBusy:true},/LOCK_BUSY/]
 ]){
  const f=harness(opts);
  assert.throws(()=>f.ctx.study1OwnerE1NotificationAudit(),code);
  assert.equal(f.counters().mailCalls,0);
  assert.equal(f.counters().writes,0);
 }
});
test('same original reservation cannot be attributed to two consents',()=>{
 const x={id:'22222222-3333-4444-5555-666666666666',
  channel:'FORMAL_E1',experiment:'E1',researcherPresigned:true,
  state:'CONFIRMED',binding:{applicantId:APP,reservationId:RSV,experiment:'E1'}};
 const f=harness({entries:[harness({rows:[]}).entry,x]});
 const rows=f.ctx.study1OwnerE1NotificationAudit().records;
 assert.equal(rows[0].noticeStatus,'PROVIDER_ACCEPTED_NOT_DELIVERED');
 assert.equal(rows[1].noticeStatus,'SOURCE_MISMATCH');
});
const uiStart=ownerHtml.indexOf('function e1OwnerOperationsSetup_(){');
const uiEnd=ownerHtml.indexOf('\ne1OwnerOperationsSetup_();',uiStart);
assert.ok(uiStart>0&&uiEnd>uiStart,'existing OWNER console must wire read-only operations UI');
const uiSource=ownerHtml.slice(uiStart,uiEnd+'\ne1OwnerOperationsSetup_();'.length);
function browser(booking,notice){
 const elements=new Map(),calls=[];
 const make=id=>({id,disabled:false,textContent:'',children:[],listeners:{},
  addEventListener(event,fn){this.listeners[event]=fn;},
  appendChild(child){this.children.push(child);return child;},
  removeChild(child){this.children.splice(this.children.indexOf(child),1);return child;},
  get firstChild(){return this.children[0]||null;}
 });
 for(const id of ['e1OpsRead','e1OpsStatus','e1OpsResults'])elements.set(id,make(id));
 const ctx={
  document:{getElementById:id=>elements.get(id),createElement:type=>make(type)},
  google:{script:{run:{withFailureHandler(fn){this.fail=fn;return this;},
   withSuccessHandler(fn){this.done=fn;return this;},
   study1OwnerE1ConsentBookingAudit(){calls.push('booking');
    const cb=this.done;if(booking instanceof Error)this.fail(booking);else cb(booking);},
   study1OwnerE1NotificationAudit(){calls.push('notice');
    const cb=this.done;if(notice instanceof Error)this.fail(notice);else cb(notice);}
  }}}
 };
 ctx.$=ctx.document.getElementById;
 vm.createContext(ctx);vm.runInContext(uiSource,ctx);
 return {elements,calls,click:()=>elements.get('e1OpsRead').listeners.click()};
}
const booking={readOnly:true,source:'ORIGINAL_RESERVATIONS',
 consentRevision:4,records:[{id:RID,bookingStatus:'CONFIRMED',bookingConfirmed:true}]};
const notice={readOnly:true,source:'ORIGINAL_NOTIFICATIONS',
 consentRevision:4,records:[{id:RID,consentState:'CONFIRMED',
 noticeStatus:'PROVIDER_ACCEPTED_NOT_DELIVERED'}]};
test('OWNER UI combines booking and outbox only after same revision and exact ID set',()=>{
 const b=browser(booking,notice);b.click();
 assert.deepEqual(b.calls,['booking','notice']);
 assert.equal(b.elements.get('e1OpsRead').disabled,false);
 assert.match(b.elements.get('e1OpsStatus').textContent,/相同同意索引版號 4/);
 const view=JSON.stringify(b.elements.get('e1OpsResults'));
 assert.match(view,/郵件服務已接受（非實際送達證明）/);
 assert.match(view,/已由原 Reservations 核實/);
 assert.doesNotMatch(view,/email|example.org|RSV_ORIGINAL/);
});
test('OWNER UI rejects revision drift, missing row, booking ambiguity and private read error',()=>{
 for(const [bk,nt] of [
  [booking,{...notice,consentRevision:5}],
  [booking,{...notice,records:[]}],
  [{...booking,records:[{id:RID,bookingStatus:'CONFIRMED',bookingConfirmed:false}]},notice],
  [booking,new Error('OWNER_DENIED')]
 ]){
  const b=browser(bk,nt);b.click();
  assert.equal(b.elements.get('e1OpsResults').children.length,0);
  assert.match(b.elements.get('e1OpsStatus').textContent,/未能完整核對/);
  assert.equal(b.elements.get('e1OpsRead').disabled,false);
 }
});
test('public OWNER interface remains closed and contains no notification send/retry path',()=>{
 assert.match(ownerHtml,/id="e1OwnerOperations"/);
 assert.match(ownerHtml,/\.study1OwnerE1ConsentBookingAudit\(\)/);
 assert.match(ownerHtml,/\.study1OwnerE1NotificationAudit\(\)/);
 assert.match(backend,/if\(typeof study1V2PublicRpcDeny_==='function'\)study1V2PublicRpcDeny_\(\);\s*study1AdminOwnerRequired_\(\);/);
 assert.doesNotMatch(uiSource,/MailApp|\.sendEmail\(|\.setValues\(|\.appendRow\(|\.innerHTML\s*=/);
});

const repairStart=ownerHtml.indexOf('function e1OwnerBookingRepairSetup_(){');
const repairEnd=ownerHtml.indexOf('\ne1OwnerBookingRepairSetup_();',repairStart);
assert.ok(repairStart>0&&repairEnd>repairStart,
 'OWNER must expose explicit signed-PDF/original-booking repair UI');
const repairCode=ownerHtml.slice(repairStart,repairEnd+
 '\ne1OwnerBookingRepairSetup_();'.length);
function repairBrowser(preflightResult,repairResult){
 const ids=['e1RepairConsentId','e1RepairPreflight','e1RepairAttest',
  'e1RepairCommit','e1RepairStatus'];
 const nodes=new Map(ids.map(id=>[id,{id,value:'',checked:false,disabled:false,
  textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}}]));
 const requests=[];
 const runner={
  withFailureHandler(cb){this.fail=cb;return this;},
  withSuccessHandler(cb){this.done=cb;return this;},
  study1OwnerE1SignedBookingPreflight(id){
   requests.push({type:'read',id});
   if(preflightResult instanceof Error)this.fail(preflightResult);
   else this.done(preflightResult);
  },
  study1OwnerE1SignedBookingRepair(value){
   requests.push({type:'commit',value});
   if(repairResult instanceof Error)this.fail(repairResult);
   else this.done(repairResult);
  }
 };
 const scope={google:{script:{run:runner}},
  document:{getElementById:id=>nodes.get(id)},
  $:id=>nodes.get(id)};
 vm.createContext(scope);vm.runInContext(repairCode,scope);
 const fire=(id,event='click')=>nodes.get(id).listeners[event]();
 return {nodes,requests,fire};
}
const targetId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const targetReservation='RSV_OWNER_1234567890';
const preflight={readOnly:true,disposition:'REPAIRABLE_HELD',
 bookingConfirmed:false,bookingStatus:'HELD',consentId:targetId,
 reservationId:targetReservation,consentRevision:9,receipt:'e'.repeat(64)};
const repaired={bookingConfirmed:true,bookingStatus:'CONFIRMED',
 consentId:targetId,reservationId:targetReservation,readOnlyReplay:false,
 notification:'NOT_SENT_BY_RECONCILIATION'};
test('OWNER manual UI refuses submit until signed original preflight and explicit acknowledgment',()=>{
 const h=repairBrowser(preflight,repaired),n=h.nodes;
 h.fire('e1RepairCommit');assert.equal(h.requests.length,0);
 n.get('e1RepairConsentId').value=targetId;
 h.fire('e1RepairPreflight');
 assert.equal(h.requests.length,1);assert.equal(h.requests[0].type,'read');
 assert.equal(n.get('e1RepairCommit').disabled,true);
 assert.equal(n.get('e1RepairAttest').disabled,false);
 n.get('e1RepairAttest').checked=true;h.fire('e1RepairAttest','change');
 assert.equal(n.get('e1RepairCommit').disabled,false);
 h.fire('e1RepairCommit');
 assert.equal(h.requests.length,2);
 assert.equal(h.requests[1].type,'commit');
 assert.deepEqual(JSON.parse(JSON.stringify(h.requests[1].value)),
  {consentId:targetId,consentRevision:9,receipt:'e'.repeat(64)});
 assert.equal(n.get('e1RepairCommit').disabled,true);
 h.fire('e1RepairCommit');
 assert.equal(h.requests.length,2,'no second POST from same original preflight');
 assert.match(n.get('e1RepairStatus').textContent,/重新唯讀核對|另核對/);
});
test('OWNER manual UI fails closed on stale ID, cancelled HELD or incomplete source',()=>{
 for(const p of [
  {...preflight,disposition:'MANUAL_REVIEW_ONLY',bookingStatus:'CANCELLED',receipt:undefined},
  {...preflight,consentId:'OTHER_CONSENT_12345678'},
  {...preflight,receipt:'FORGED'}
 ]){
  const h=repairBrowser(p,repaired),n=h.nodes;
  n.get('e1RepairConsentId').value=targetId;
  h.fire('e1RepairPreflight');
  n.get('e1RepairAttest').checked=true;
  h.fire('e1RepairAttest','change');
  assert.equal(n.get('e1RepairCommit').disabled,true);
  h.fire('e1RepairCommit');
  assert.equal(h.requests.filter(x=>x.type==='commit').length,0);
 }
});
test('changing selected consent invalidates the prior preflight and lost repair outcome never automatically POSTs twice',()=>{
 const h=repairBrowser(preflight,new Error('ORIGINAL_SHEET_RESPONSE_UNKNOWN')),n=h.nodes;
 n.get('e1RepairConsentId').value=targetId;h.fire('e1RepairPreflight');
 n.get('e1RepairAttest').checked=true;h.fire('e1RepairAttest','change');
 n.get('e1RepairConsentId').value='CONSENT_CHANGED_123456';
 h.fire('e1RepairConsentId','input');
 assert.equal(n.get('e1RepairCommit').disabled,true);
 n.get('e1RepairConsentId').value=targetId;h.fire('e1RepairPreflight');
 n.get('e1RepairAttest').checked=true;h.fire('e1RepairAttest','change');
 h.fire('e1RepairCommit');
 assert.equal(h.requests.filter(x=>x.type==='commit').length,1);
 assert.match(n.get('e1RepairStatus').textContent,/UNKNOWN/);
 assert.equal(n.get('e1RepairCommit').disabled,true);
 h.fire('e1RepairCommit');
 assert.equal(h.requests.filter(x=>x.type==='commit').length,1);
});
test('OWNER repair UI contains only explicit preflight and one guarded RPC, no email, signing or automatic retry',()=>{
 assert.match(ownerHtml,/id="e1RepairPreflight"/);
 assert.match(ownerHtml,/id="e1RepairAttest"/);
 assert.match(ownerHtml,/id="e1RepairCommit"/);
 assert.match(repairCode,/\.study1OwnerE1SignedBookingPreflight\(consentId\)/);
 assert.match(repairCode,/\.study1OwnerE1SignedBookingRepair\(once\)/);
 assert.doesNotMatch(repairCode,/MailApp|\.sendEmail\(|study1EConsentSignPdf\(|\.appendRow\(|\.setValues\(|\.innerHTML\s*=/);
});
