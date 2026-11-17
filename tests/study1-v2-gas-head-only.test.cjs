'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const m=require('../scripts/study1-v2-gas-head-only.cjs');
const manifest=()=>JSON.stringify({timeZone:'Asia/Taipei',runtimeVersion:'V8',webapp:{access:'MYSELF',executeAs:'USER_DEPLOYING'}});
const website=()=>`function getPublicConfig(){return {open:false,consentReady:false,contact:'x'};}
function requestOtp(){return rejectIntake_();}
function verifyOtp(){return rejectIntake_();}
function holdSlot(){return rejectIntake_();}
function submitConsent(){return rejectIntake_();}
function listSlots(){return [];}`;
const fixtures=()=>[{name:'appsscript',type:'JSON',source:manifest()},{name:'Website',type:'SERVER_JS',source:website()},{name:'Index',type:'HTML',source:'<html>closed</html>'}];
const env=(mode='apply')=>({GITHUB_REPOSITORY:m.REPO,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),REVIEWED_SHA:'a'.repeat(40),SYNC_MODE:mode,EXPECTED_REMOTE_SHA256:'b'.repeat(64),CONFIRMATION:m.CONFIRM,GITHUB_RUN_ID:'12345',RUNNER_TEMP:fs.mkdtempSync(path.join(os.tmpdir(),'study1v2-'))});
const creds=()=>({refresh_token:'mock-v2-refresh-token-that-remains-private',client_id:'my-client-id',client_secret:'my-secret'});
const remote=()=>({scriptId:m.SID,files:fixtures()});

test('manual-only V2 repository/ref/SHA and explicit apply approval are mandatory',()=>{
 const good=env();assert.doesNotThrow(()=>m.invocation(good,'prepare'));assert.doesNotThrow(()=>m.invocation({...good,SYNC_MODE:'audit'},'audit'));
 for(const bad of [{GITHUB_REPOSITORY:'solactw-star/study1-recruitment-gas'},{GITHUB_REF:'refs/heads/feature'},
  {GITHUB_EVENT_NAME:'push'},{GITHUB_RUN_ATTEMPT:'2'},{REVIEWED_SHA:'f'.repeat(40)},{CONFIRMATION:'NO'},
  {SYNC_MODE:'audit'},{EXPECTED_REMOTE_SHA256:''}])
  assert.throws(()=>m.invocation({...good,...bad},'prepare'),/V2_HEAD_ONLY_BLOCKED/);
 assert.throws(()=>m.invocation(good,'not-a-phase'),/V2_HEAD_ONLY_BLOCKED/);
});
test('canonical source hash ignores file order but rejects duplicate, invalid and missing manifest',()=>{
 const f=fixtures();assert.equal(m.digest(f),m.digest([...f].reverse()));
 assert.throws(()=>m.digest([...f,f[1]]),/duplicate/);
 assert.throws(()=>m.digest(f.slice(1)),/manifest/);
 assert.throws(()=>m.digest([...f,{name:'secret',type:'JSON',source:'{}'}]),/JSON files/);
 assert.throws(()=>m.digest([...f,{name:'bad/path',type:'SERVER_JS',source:'x'}]),/invalid/);
});
test('only MYSELF manifest and closed public front-end are accepted',()=>{
 const f=fixtures();assert.equal(m.closedManifest(f).webapp.access,'MYSELF');assert.doesNotThrow(()=>m.closedWebsite(f));
 f[0].source=f[0].source.replace('MYSELF','ANYONE_ANONYMOUS');assert.throws(()=>m.closedManifest(f),/MYSELF/);
 f[0].source=manifest();f[1].source=f[1].source.replace('open:false','open:true');assert.throws(()=>m.closedWebsite(f),/closed/);
});
test('V2 checked-in gas maps to V2 only and exact current reviewed formal inventory',()=>{
 const dir=process.env.STUDY1_V2_GAS_FIXTURE_DIR;
 if(!dir)return; // optional when independent package uses its own full gas/ directory
 const files=m.localSources(dir);assert.equal(files.length,m.APPROVED.length);
 assert.equal(files.filter(f=>f.type==='JSON').length,1);
 for(const id of ['Study1FixtureAdapter','Study1Team','Study1Flow','Study1Unified'])
  assert.ok(!files.some(f=>f.name===id),'synthetic cannot ship: '+id);
 assert.ok(!files.some(f=>f.name==='程式碼'), 'no inert myFunction entrypoint');
 const clone=fs.mkdtempSync(path.join(os.tmpdir(),'v2-inventory-'));
 for(const p of fs.readdirSync(dir))fs.copyFileSync(path.join(dir,p),path.join(clone,p));
 fs.writeFileSync(path.join(clone,'EXTRA.js'),'function extra_(){}');
 assert.ok(m.readDevelopmentSources(clone).some(f=>f.name==='EXTRA'),'ordinary development can stage a new source');
 assert.throws(()=>m.localSources(clone),/allowlist/);
 assert.throws(()=>m.releaseFiles({},m.readDevelopmentSources(clone)),/allowlist/);
 fs.rmSync(path.join(clone,'EXTRA.js'));
 fs.copyFileSync(path.join(__dirname,'fixtures/legacy-gas/Study1FixtureAdapter.js'),
  path.join(clone,'Study1FixtureAdapter.js'));
 assert.throws(()=>m.localSources(clone),/retired synthetic source reintroduced/);
 fs.rmSync(clone,{recursive:true,force:true});
});
test('supports old/new clasp OAuth JSON without exposing credentials',()=>{
 const c=creds();assert.equal(m.credentials(JSON.stringify({tokens:{default:c}})).refresh_token,c.refresh_token);
 const other={token:{refresh_token:c.refresh_token},oauth2ClientSettings:{clientId:c.client_id,clientSecret:c.client_secret}};
 assert.equal(m.credentials(JSON.stringify(other)).client_id,c.client_id);
 assert.throws(()=>m.credentials('{}'),/lacks/);
});
test('OAuth and HTTP update use only new GAS /content endpoint',async()=>{
 const calls=[];const fetcher=async(url,config)=>{
  calls.push({url,method:config.method,body:config.body&&String(config.body)});
  return {ok:true,json:async()=>url.includes('oauth2')?{access_token:'a-bearer-token-this-is-long'}:remote()};
 };
 const api=await m.apiFromCredentials(creds(),fetcher);
 await api.getContent();await api.putContent(fixtures());
 assert.equal(calls.length,3);assert.equal(calls[0].url,'https://oauth2.googleapis.com/token');
 for(const c of calls.slice(1))assert.equal(c.url,'https://script.googleapis.com/v1/projects/'+m.SID+'/content');
 assert.deepEqual(calls.slice(1).map(c=>c.method),['GET','PUT']);
 assert.ok(!calls[2].body.includes('.clasp.json'));
});
test('prewrite AES-GCM snapshot is encrypted and authenticated to run and OAuth',()=>{
 const raw=JSON.stringify(remote()),c=creds();const e=m.seal(raw,c.refresh_token,'run-123');
 assert.equal(m.unseal(e,c.refresh_token,'run-123'),raw);
 assert.ok(!JSON.stringify(e).includes('Study1Team'));
 assert.throws(()=>m.unseal(e,'some-other-refresh-token','run-123'));
 assert.throws(()=>m.unseal(e,c.refresh_token,'run-999'));
});
test('prepare writes encrypted backup before any PUT and full local readback',async()=>{
 const original=remote(),e=env(),c=creds(),f=fixtures();e.EXPECTED_REMOTE_SHA256=m.digest(original.files);
 let reads=0,writes=0;
 const api={getContent:async()=>{reads++;return original;},putContent:async()=>{writes++;}};
 const modified=[...f.map(v=>({...v}))];modified[2].source='<html>new but closed</html>';
 const r=await m.prepare(api,modified,c,e);
 assert.equal(r.before,e.EXPECTED_REMOTE_SHA256);assert.equal(r.target,m.digest(modified));
 assert.equal(reads,2);assert.equal(writes,0);
 const {backup,state}=m.runnerPaths(e);assert.ok(fs.existsSync(backup));assert.ok(fs.existsSync(state));
 const envelope=JSON.parse(fs.readFileSync(backup,'utf8'));
 assert.ok(!fs.readFileSync(backup,'utf8').includes('<html>closed</html>'));
 assert.equal(JSON.parse(m.unseal(envelope,c.refresh_token,m.aad(e))).head.scriptId,m.SID);
 fs.rmSync(e.RUNNER_TEMP,{recursive:true,force:true});
});
test('post-backup drift rejects before PUT; verified success makes just one PUT',async()=>{
 const e=env(),c=creds(),f=fixtures(),before=remote();e.EXPECTED_REMOTE_SHA256=m.digest(before.files);
 const updated=f.map(x=>({...x}));updated[2].source='<html>new content</html>';
 let current=before,writes=0;
 const api={getContent:async()=>current,putContent:async files=>{writes++;current={scriptId:m.SID,files};}};
 await m.prepare(api,updated,c,e);
 current={scriptId:m.SID,files:fixtures().map(x=>x.name==='Index'?{...x,source:'unexpected edit'}:x)};
 await assert.rejects(m.apply(api,updated,c,e),/modified after encrypted backup/);
 assert.equal(writes,0);
 current=before;const result=await m.apply(api,updated,c,e);
 assert.equal(writes,1);assert.equal(result.sha,m.digest(updated));
 fs.rmSync(e.RUNNER_TEMP,{recursive:true,force:true});
});
test('PUT timeout never retries or rolls back',async()=>{
 const e=env(),c=creds(),f=fixtures(),before=remote();e.EXPECTED_REMOTE_SHA256=m.digest(before.files);
 const updated=f.map(x=>x.name==='Index'?{...x,source:'new'}:{...x});
 let calls=0;
 const api={getContent:async()=>before,putContent:async()=>{calls++;throw Error('timeout');}};
 await m.prepare(api,updated,c,e);
 await assert.rejects(m.apply(api,updated,c,e),/POST_PUT_UNKNOWN_NO_RETRY_NO_ROLLBACK/);
 assert.equal(calls,1);
 fs.rmSync(e.RUNNER_TEMP,{recursive:true,force:true});
});
test('source and workflow have no deployment/Sheet mutation or auto trigger',()=>{
 const script=fs.readFileSync(path.join(__dirname,'../scripts/study1-v2-gas-head-only.cjs'),'utf8');
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-v2-gas-head-only.yml'),'utf8');
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/\n\s+push:\s*\n|schedule:|workflow_run:/);
 assert.equal((script.match(/api\.putContent\(/g)||[]).length,1);
 for(const banned of ['sheets.googleapis.com','SpreadsheetApp','MailApp','clasp push','createVersion(',
  'createDeployment(','putDeployment(','deleteDeployment(','https://script.google.com/macros/s/']){
  assert.ok(!script.includes(banned),banned);
 }
 assert.ok(!script.includes('1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z'));
 assert.match(workflow,/secrets\.V2_GAS_CLASPRC_JSON/);
 assert.doesNotMatch(workflow,/CLASPRC_JSON: \$\{\{ secrets\.CLASPRC_JSON/);
});


test('offline private OWNER candidate keeps public release unchanged and only six read RPCs change',()=>{
 const pub=m.localSources(),before=m.digest(pub);
 const candidate=m.privateOwnerReadOnlyCandidate(pub);
 assert.equal(m.digest(pub),before);
 assert.equal(m.closedManifest(pub).webapp.access,'ANYONE');
 assert.equal(m.closedManifest(candidate).webapp.access,'MYSELF');
 assert.throws(()=>m.publicRpcSurface(candidate),/unguarded public RPC/);
 const accidental=candidate.map(f=>f.name==='appsscript'?{...f,source:f.source.replace('"MYSELF"','"ANYONE"')}:f);
 assert.throws(()=>m.closedManifest(accidental),/unguarded public RPC/);
 assert.deepEqual(candidate.filter(f=>f.source!==pub.find(p=>p.name===f.name).source)
  .map(f=>f.name).sort(),['AdminConsole','AdminSandbox','Study1FormalBooking','Study1WizardP0Bridge','Website','appsscript']);
 const html=candidate.find(f=>f.name==='AdminConsole').source;
 assert.match(html,/私人唯讀驗收候選｜非正式營運/);
 assert.match(html,/<section hidden><h2>測試研究內容/);
 assert.match(html,/<section hidden><h2>測試預約設定/);
 assert.doesNotMatch(html,/\nreload\(\);\n\}\)\(\);/);
 const original=pub.find(f=>f.name==='AdminSandbox');
 const drift=pub.map(f=>f.name===original.name?{...f,source:f.source.replace('function study1EConsentOwnerList(){','function study1EConsentOwnerList(renamed) {')}:f);
 assert.throws(()=>m.privateOwnerReadOnlyCandidate(drift),/private candidate RPC declaration drift/);
});
test('private candidate OWNER route and six existing read RPCs refuse non-owner before source access; writes stay closed',()=>{
 const vm=require('node:vm'),candidate=m.privateOwnerReadOnlyCandidate(m.localSources());
 const owner='solac.tw@gmail.com';
 let active='',effective=owner,rendered=0,readAttempts=0;
 const output={setTitle(){return this;},addMetaTag(){return this;}};
 const c=vm.createContext({
  Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
  HtmlService:{createHtmlOutputFromFile(name){assert.equal(name,'AdminConsole');rendered++;return output;}},
  LockService:{getScriptLock(){readAttempts++;throw Error('OWNER_REACHED_READ_BOUNDARY');}},
  PropertiesService:{getScriptProperties(){readAttempts++;throw Error('OWNER_REACHED_READ_BOUNDARY');}}
 });
 for(const name of ['Website','AdminSandbox','Study1FormalBooking','Study1WizardP0Bridge'])
  vm.runInContext(candidate.find(f=>f.name===name).source,c);
 const reads=['study1ConsentVersionList','study1EConsentOwnerList','study1EConsentOwnerSignedPdfDownload',
  'study1EConsentOwnerWithdrawalCases','study1OwnerE1OperationsAudit','study1OwnerE1SlotAudit'];
 for(const [a,e] of [['',owner],['other@example.invalid',owner],[owner,'other@example.invalid']]){
  active=a;effective=e;
  assert.throws(()=>c.doGet({parameter:{view:'admin'}}),/管理身分無法驗證/);
  for(const name of reads)assert.throws(()=>c[name](),/管理身分無法驗證/,name);
 }
 assert.equal(rendered,0);assert.equal(readAttempts,0);
 active=effective=owner;
 assert.equal(c.doGet({parameter:{view:'admin'}}),output);
 assert.equal(rendered,1);
 assert.throws(()=>c.study1OwnerE1SlotAudit(),/OWNER_REACHED_READ_BOUNDARY/);
 assert.equal(readAttempts,1);
 for(const name of ['study1ConsentVersionUpload','study1ConsentVersionSelect','study1ConsentVersionPublication',
  'study1OwnerE1SlotChangeCommit','study1OwnerE1SignedBookingRepair','study1EConsentOwnerWithdraw','adminSaveSandboxConfig',
  'study1FormalHoldSlot','getPublicConsentDocument'])assert.throws(()=>c[name](),/STUDY1_V2_PUBLIC_READ_ONLY/,name);
 assert.equal(c.getPublicConfig().open,false);
 assert.equal(c.getPublicConfig().consentReady,false);
 assert.throws(()=>c.requestOtp(),/尚未開放/);
 assert.throws(()=>c.doGet({parameter:{view:'demo'}}),/STUDY1_V2_PUBLIC_READ_ONLY/);
 assert.equal(readAttempts,1);
});

test('private E1 management derives from read-only candidate, keeps public and non-E1 writes blocked',()=>{
 const vm=require('node:vm'),pub=m.localSources(),before=m.digest(pub);
 const candidate=m.privateOwnerManagementCandidate(pub),read=m.privateOwnerReadOnlyCandidate(pub);
 assert.equal(m.digest(pub),before);
 assert.equal(m.closedManifest(candidate).webapp.access,'MYSELF');
 assert.throws(()=>m.publicRpcSurface(candidate),/unguarded public RPC/);
 const accidental=candidate.map(f=>f.name==='appsscript'?{...f,source:f.source.replace('"MYSELF"','"ANYONE"')}:f);
 assert.throws(()=>m.closedManifest(accidental),/unguarded public RPC/);
 assert.deepEqual(candidate.filter(f=>f.source!==read.find(p=>p.name===f.name).source).map(f=>f.name).sort(),['AdminConsole','AdminSandbox','Study1FormalBooking','Website']);
 const html=candidate.find(f=>f.name==='AdminConsole').source;
 assert.match(html,/私人 E1 文件管理候選｜非正式營運/);
 assert.doesNotMatch(html,/<div hidden><label for="e1PdfFile">/);
 assert.match(html,/<section hidden><h2>測試研究內容/);
 assert.match(html,/<div hidden><h3>OWNER 手動核對/);
 let active='',effective='solac.tw@gmail.com',reads=0;
 const c=vm.createContext({Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
  PropertiesService:{getScriptProperties(){reads++;throw Error('OWNER_REACHED_CLOSED_FLAGS');}}});
 for(const name of ['Website','AdminSandbox','Study1FormalBooking','Study1WizardP0Bridge','Study1ParticipantIntake','Study1FormalConsent'])
  vm.runInContext(candidate.find(f=>f.name===name).source,c);
 const names=['study1ConsentVersionUpload','study1ConsentVersionSelect','study1ConsentVersionPublication'];
 assert.throws(()=>c.study1OwnerE1SlotChangeCommit({}),/管理身分無法驗證/);
 for(const a of ['', 'other@example.invalid']){
  active=a;
  for(const n of names)assert.throws(()=>c[n]({experiment:'E1',researcherPresigned:true}),/管理身分無法驗證/);
 }
 assert.equal(reads,0);
 active=effective;
 assert.throws(()=>c.study1ConsentVersionUpload({experiment:'E2',researcherPresigned:true}),/E1_PRESIGNED_MANAGEMENT_ONLY/);
 assert.throws(()=>c.study1ConsentVersionUpload({experiment:'E1',researcherPresigned:false}),/E1_PRESIGNED_MANAGEMENT_ONLY/);
 assert.throws(()=>c.study1ConsentVersionPublication({experiment:'E2',id:'x'}),/E1_PRESIGNED_MANAGEMENT_ONLY/);
 assert.throws(()=>c.study1ConsentVersionPublication({experiment:'E1',id:null}),/E1_PRESIGNED_MANAGEMENT_ONLY/);
 assert.equal(reads,0);
 for(const [n,arg] of [[names[0],{experiment:'E1',researcherPresigned:true}],[names[1],{}],[names[2],{experiment:'E1',id:'x'}]])
  assert.throws(()=>c[n](arg),/OWNER_REACHED_CLOSED_FLAGS/);
 assert.equal(reads,3);
 for(const n of ['study1OwnerE1SignedBookingRepair','study1EConsentOwnerWithdraw','study1FormalHoldSlot','study1ParticipantBegin','study1ParticipantSendOtp','getPublicConsentDocument','adminSaveSandboxConfig'])
  assert.throws(()=>c[n](),/STUDY1_V2_PUBLIC_READ_ONLY/,n);
 assert.equal(c.getPublicConfig().open,false);
 assert.equal(c.getPublicConfig().consentReady,false);
 console.log('V2_PRIVATE_E1_MANAGEMENT_CANDIDATE_SHA256='+m.digest(candidate));
});
test('private candidate select and source pointer reject E2, non-presigned and stale source under original lock',()=>{
 const vm=require('node:vm'),files=m.privateOwnerManagementCandidate(m.localSources());
 let entry={id:'E1_FILE',experiment:'E2',researcherPresigned:true,sha256:'a'.repeat(64)},writes=0,locks=0,checks=0;
 const prop={getProperty:()=> 'false',setProperty:()=>{writes++}};
 const owner='solac.tw@gmail.com',c=vm.createContext({
  Session:{getActiveUser:()=>({getEmail:()=>owner}),getEffectiveUser:()=>({getEmail:()=>owner})},
  PropertiesService:{getScriptProperties:()=>prop},LockService:{getScriptLock:()=>({tryLock:()=>{locks++;return true},releaseLock(){}})}
 });
 vm.runInContext(files.find(f=>f.name==='Website').source,c);
 vm.runInContext(files.find(f=>f.name==='AdminSandbox').source,c);
 c.study1ConsentVersionRead_=()=>({revision:2,documents:[entry],current:{E1:entry.id},published:{E1:entry.id}});
 c.study1ConsentDocumentBytes_=()=>{checks++;throw Error('ACTUAL_ORIGINAL_SHA_DRIFT')};
 assert.throws(()=>c.study1ConsentVersionSelect({id:entry.id,expectedRevision:2}),/E1_PRESIGNED_MANAGEMENT_ONLY/);
 entry={...entry,experiment:'E1',researcherPresigned:false};
 assert.throws(()=>c.study1ConsentVersionSelect({id:entry.id,expectedRevision:2}),/E1_PRESIGNED_MANAGEMENT_ONLY/);
 const p={experiment:'E1',id:entry.id,expectedRevision:2,confirmSha256:entry.sha256};
 assert.throws(()=>c.study1ConsentVersionPublication(p),/只能公開已選用/);
 entry={...entry,researcherPresigned:true};
 assert.throws(()=>c.study1ConsentVersionPublication(p),/ACTUAL_ORIGINAL_SHA_DRIFT/);
 assert.throws(()=>c.study1ConsentVersionSelect({id:entry.id,expectedRevision:1}),/版本選用衝突/);
 assert.equal(writes,0);assert.equal(checks,1);assert.equal(locks,5);
});

test('private HEAD release binds the current reviewed source digest and separate authorization',()=>{
 const base=m.localSources(),pub=m.releaseFiles({},base),env0=env();
 const e={...env0,SOURCE_PROFILE:'private_e1_management',REVIEWED_TARGET_SHA256:m.PRIVATE_TARGET,
  EXPECTED_INVENTORY_SHA256:'a'.repeat(64),CONFIRMATION:m.PRIVATE_CONFIRM};
 assert.equal(m.digest(m.releaseFiles(e,base)),m.PRIVATE_TARGET);
 assert.equal(m.closedManifest(pub).webapp.access,'ANYONE');
 assert.doesNotThrow(()=>m.invocation(e,'prepare'));
 for(const b of [{CONFIRMATION:m.CONFIRM},{EXPECTED_INVENTORY_SHA256:''},{REVIEWED_TARGET_SHA256:'a'.repeat(64)}])
  assert.throws(()=>m.invocation({...e,...b},'prepare'),/V2_HEAD_ONLY_BLOCKED/);
 assert.throws(()=>m.releaseFiles({...e,REVIEWED_TARGET_SHA256:'a'.repeat(64)},base),/reviewed target SHA/);
 fs.rmSync(env0.RUNNER_TEMP,{recursive:true,force:true});
});
test('before-PUT inventory guard and after-PUT readback gate prevent blind retries',async()=>{
 const e=env(),c=creds(),f=fixtures(),before=remote();
 e.EXPECTED_REMOTE_SHA256=m.digest(before.files);
 const updated=f.map(x=>x.name==='Index'?{...x,source:'new'}:x);
 let writes=0,current=before;
 const api={getContent:async()=>current,putContent:async files=>{writes++;current={scriptId:m.SID,files}}};
 try{
  await m.prepare(api,updated,c,e);
  await assert.rejects(m.apply(api,updated,c,e,async()=>{throw Error('INVENTORY_RACED')}),/INVENTORY_RACED/);
  assert.equal(writes,0);
  await assert.rejects(m.apply(api,updated,c,e,async()=>{},async()=>{throw Error('DEPLOYMENT_READBACK_MISMATCH')}),/POST_PUT_UNKNOWN_NO_RETRY_NO_ROLLBACK/);
  assert.equal(writes,1);
 }finally{fs.rmSync(e.RUNNER_TEMP,{recursive:true,force:true});}
});

 test('HEAD audit separates anonymous current baseline from private target without permitting a write',async()=>{
 const d=require('../scripts/study1-v2-private-deploy.cjs');
 const base=m.anonymousReadOnlyCandidate(),target=m.privateOwnerManagementCandidate(m.localSources());
 const head={scriptId:m.SID,files:base};
 const dep=(id,version,access)=>({deploymentId:id,deploymentConfig:{scriptId:m.SID,versionNumber:version,manifestFileName:'appsscript'},entryPoints:[{entryPointType:'WEB_APP',webApp:{entryPointConfig:{access,executeAs:'USER_DEPLOYING'},url:'https://example.invalid/'+id}}]});
 const calls=[];
 const api={
  getHead:async()=>{calls.push('GET HEAD');return head;},
  getVersions:async()=>[{scriptId:m.SID,versionNumber:4}],
  getDeployments:async()=>[dep('DEV',0,'ANYONE_ANONYMOUS'),dep('PUBLIC',4,'ANYONE_ANONYMOUS')],
  getVersionContent:async()=>head,
  putContent:()=>{throw Error('mutation must not be called');},
  createVersion:()=>{throw Error('mutation must not be called');},
  createDeployment:()=>{throw Error('mutation must not be called');}
 };
 const receipt=await m.audit(api,target);
 assert.equal(receipt.sha,m.digest(base));
 assert.equal(receipt.targetSha,m.digest(target));
 assert.equal(receipt.baselineAccess,'ANYONE_ANONYMOUS');
 assert.equal(receipt.targetAccess,'MYSELF');
 assert.equal(receipt.modeDiffers,true);
 assert.equal(receipt.baselineKnownSafe,true);
 assert.equal(receipt.writeAuthorized,false);
 assert.deepEqual(calls,['GET HEAD']);
 // The exact same inventory remains ineligible under the existing private
 // mutation contract. An audit never serves as approval for a new mode.
 const state=await d.inventory(api,true);
 assert.throws(()=>d.requirePrivateHeadBaseline(state));
 await assert.rejects(d.inventory(api),/publicly accessible/);
 const unknown={...head,files:base.map(f=>f.name==='Index'?{...f,source:f.source+'<!-- unknown -->'}:f)};
 const unverified=await m.audit({...api,getHead:async()=>unknown},target);
 assert.equal(unverified.baselineKnownSafe,false);
 assert.equal(unverified.writeAuthorized,false);
 const same=await m.audit({...api,getHead:async()=>({scriptId:m.SID,files:target}),getVersions:async()=>[],getDeployments:async()=>[dep('DEV',0,'MYSELF')]},target);
 assert.equal(same.modeDiffers,false);assert.equal(same.writeAuthorized,false);
 const src=fs.readFileSync(path.join(__dirname,'../scripts/study1-v2-gas-head-only.cjs'),'utf8');
 const main=src.slice(src.indexOf('async function main(){'),src.indexOf('function privateOwnerReadOnlyCandidate('));
 assert.match(main,/if\(mode==='audit'\)\{[\s\S]*?d\.makeApi\(c,undefined,undefined,undefined,true\)/);
 assert.ok(main.indexOf('return audit(')<main.indexOf('apiFromCredentials(c)'));
 });
