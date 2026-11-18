'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const core=require('../scripts/study1-v2-release-source.cjs'),evidence=require('../scripts/study1-v2-release-evidence.cjs'),lifecycle=require('../scripts/study1-v2-release-lifecycle.cjs');
const manifest=()=>JSON.stringify({timeZone:'Asia/Taipei',runtimeVersion:'V8',webapp:{access:'MYSELF',executeAs:'USER_DEPLOYING'}});
const website=()=>`function getPublicConfig(){return {open:false,consentReady:false,contact:'x'};}
function requestOtp(){return rejectIntake_();}
function verifyOtp(){return rejectIntake_();}
function holdSlot(){return rejectIntake_();}
function submitConsent(){return rejectIntake_();}
function listSlots(){return [];}`;
const fixtures=()=>[{name:'appsscript',type:'JSON',source:manifest()},{name:'Website',type:'SERVER_JS',source:website()},{name:'Index',type:'HTML',source:'<html>closed</html>'}];
function dep(v,access,id='deployment-'+v){return {deploymentId:id,deploymentConfig:{scriptId:core.SID,versionNumber:v,manifestFileName:'appsscript'},entryPoints:[{entryPointType:'WEB_APP',webApp:{entryPointConfig:{access,executeAs:'USER_DEPLOYING'},url:'https://script.google.com/macros/s/'+id+'/exec'}}]};}
const base=()=>core.localSources(),candidate=()=>core.anonymousReadOnlyCandidate(base());
const gas=()=>({scriptId:core.SID,files:core.privateOwnerManagementCandidate(core.localSources())});
function fakeApi(){
 const counts={puts:0,versionCreates:0};
 return {api:{getHead:async()=>gas(),getVersions:async()=>[],getDeployments:async()=>[],getVersionContent:async()=>gas(),
 createVersion:async()=>{counts.versionCreates++;throw Error('unexpected version mutation');},
 createDeployment:async()=>{counts.puts++;throw Error('unexpected deployment mutation');}},
 counts:()=>({...counts})};
}

test('canonical source hash ignores file order but rejects duplicate, invalid and missing manifest',()=>{
 const f=fixtures();assert.equal(core.digest(f),core.digest([...f].reverse()));
 assert.throws(()=>core.digest([...f,f[1]]),/duplicate/);
 assert.throws(()=>core.digest(f.slice(1)),/manifest/);
 assert.throws(()=>core.digest([...f,{name:'secret',type:'JSON',source:'{}'}]),/JSON files/);
 assert.throws(()=>core.digest([...f,{name:'bad/path',type:'SERVER_JS',source:'x'}]),/invalid/);
});

test('only MYSELF manifest and closed public front-end are accepted',()=>{
 const f=fixtures();assert.equal(core.closedManifest(f).webapp.access,'MYSELF');assert.doesNotThrow(()=>core.closedWebsite(f));
 f[0].source=f[0].source.replace('MYSELF','ANYONE_ANONYMOUS');assert.throws(()=>core.closedManifest(f),/MYSELF/);
 f[0].source=manifest();f[1].source=f[1].source.replace('open:false','open:true');assert.throws(()=>core.closedWebsite(f),/closed/);
});

test('V2 checked-in gas maps to V2 only and exact current reviewed formal inventory',()=>{
 const dir=process.env.STUDY1_V2_GAS_FIXTURE_DIR||path.join(__dirname,'../gas');
 const files=core.localSources(dir);assert.equal(files.length,core.APPROVED.length);
 assert.equal(files.filter(f=>f.type==='JSON').length,1);
 for(const id of ['Study1FixtureAdapter','Study1Team','Study1Flow','Study1Unified'])
  assert.ok(!files.some(f=>f.name===id),'synthetic cannot ship: '+id);
 assert.ok(!files.some(f=>f.name==='程式碼'), 'no inert myFunction entrypoint');
 const clone=fs.mkdtempSync(path.join(os.tmpdir(),'v2-inventory-'));
 for(const p of fs.readdirSync(dir))fs.copyFileSync(path.join(dir,p),path.join(clone,p));
 fs.writeFileSync(path.join(clone,'EXTRA.js'),'function extra_(){}');
 assert.ok(core.readDevelopmentSources(clone).some(f=>f.name==='EXTRA'),'ordinary development can stage a new source');
 assert.throws(()=>core.localSources(clone),/allowlist/);
 assert.throws(()=>core.requireReviewedInventory(core.readDevelopmentSources(clone)),/allowlist/);
 fs.rmSync(path.join(clone,'EXTRA.js'));
 fs.copyFileSync(path.join(__dirname,'fixtures/legacy-gas/Study1FixtureAdapter.js'),
  path.join(clone,'Study1FixtureAdapter.js'));
 assert.throws(()=>core.localSources(clone),/retired synthetic source reintroduced/);
 fs.rmSync(clone,{recursive:true,force:true});
});

test('offline private OWNER candidate keeps public release unchanged and only six read RPCs change',()=>{
 const pub=core.localSources(),before=core.digest(pub);
 const candidate=core.privateOwnerReadOnlyCandidate(pub);
 assert.equal(core.digest(pub),before);
 assert.equal(core.closedManifest(pub).webapp.access,'ANYONE');
 assert.equal(core.closedManifest(candidate).webapp.access,'MYSELF');
 assert.throws(()=>core.publicRpcSurface(candidate),/unguarded public RPC/);
 const accidental=candidate.map(f=>f.name==='appsscript'?{...f,source:f.source.replace('"MYSELF"','"ANYONE"')}:f);
 assert.throws(()=>core.closedManifest(accidental),/unguarded public RPC/);
 assert.deepEqual(candidate.filter(f=>f.source!==pub.find(p=>p.name===f.name).source)
  .map(f=>f.name).sort(),['AdminConsole','AdminSandbox','Study1FormalBooking','Study1WizardP0Bridge','Website','appsscript']);
 const html=candidate.find(f=>f.name==='AdminConsole').source;
 assert.match(html,/私人唯讀驗收候選｜非正式營運/);
 assert.match(html,/<section hidden><h2>測試研究內容/);
 assert.match(html,/<section hidden><h2>測試預約設定/);
 assert.doesNotMatch(html,/\nreload\(\);\n\}\)\(\);/);
 const original=pub.find(f=>f.name==='AdminSandbox');
 const drift=pub.map(f=>f.name===original.name?{...f,source:f.source.replace('function study1EConsentOwnerList(){','function study1EConsentOwnerList(renamed) {')}:f);
 assert.throws(()=>core.privateOwnerReadOnlyCandidate(drift),/private candidate RPC declaration drift/);
});

test('private candidate OWNER route and six existing read RPCs refuse non-owner before source access; writes stay closed',()=>{
 const vm=require('node:vm'),candidate=core.privateOwnerReadOnlyCandidate(core.localSources());
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
 const vm=require('node:vm'),pub=core.localSources(),before=core.digest(pub);
 const candidate=core.privateOwnerManagementCandidate(pub),read=core.privateOwnerReadOnlyCandidate(pub);
 assert.equal(core.digest(pub),before);
 assert.equal(core.closedManifest(candidate).webapp.access,'MYSELF');
 assert.throws(()=>core.publicRpcSurface(candidate),/unguarded public RPC/);
 const accidental=candidate.map(f=>f.name==='appsscript'?{...f,source:f.source.replace('"MYSELF"','"ANYONE"')}:f);
 assert.throws(()=>core.closedManifest(accidental),/unguarded public RPC/);
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
 console.log('V2_PRIVATE_E1_MANAGEMENT_CANDIDATE_SHA256='+core.digest(candidate));
});

test('private candidate select and source pointer reject E2, non-presigned and stale source under original lock',()=>{
 const vm=require('node:vm'),files=core.privateOwnerManagementCandidate(core.localSources());
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

test('version and deployment inventory normalized and hashed deterministically',()=>{
 const v=[{scriptId:core.SID,versionNumber:2},{scriptId:core.SID,versionNumber:1}];
 assert.equal(evidence.fingerprint(v,[]),evidence.fingerprint([...v].reverse(),[]));
 assert.notEqual(evidence.fingerprint([],[]),evidence.fingerprint(v,[]));
 assert.throws(()=>evidence.normalizedVersions([v[0],v[0]]),/invalid/);
 assert.throws(()=>evidence.normalizedVersions([{scriptId:'old',versionNumber:1}]),/invalid/);
});

test('Google automatic HEAD deployment parses omitted or zero version independent of ID',()=>{
 const head=(versionNumber,id='V2-opaque-development-id')=>({
  deploymentId:id,deploymentConfig:{
   scriptId:core.SID,manifestFileName:'appsscript',
   ...(versionNumber===undefined?{}:{versionNumber})
  },entryPoints:[{entryPointType:'WEB_APP',webApp:{
   entryPointConfig:{access:'MYSELF',executeAs:'USER_DEPLOYING'},
   url:'https://script.google.com/macros/s/private/development'
  }}]
 });
 for(const raw of [head(undefined),head(0)]){
  const result=evidence.normalizedDeployments([raw]);
  assert.equal(result.length,1);assert.equal(result[0].kind,'HEAD');
  assert.equal(result[0].version,null);
  assert.equal(result[0].id,'V2-opaque-development-id');
  const diag=evidence.redactedDeploymentShapes([raw]);
  assert.equal(diag[0].versionShape,raw.deploymentConfig.versionNumber===undefined?'omitted':'zero');
  assert.ok(!JSON.stringify(diag).includes(raw.deploymentId));
  assert.ok(!JSON.stringify(diag).includes('/private/development'));
 }
 // The source may be anonymous while the development entry point is private;
 // a missing API field is NOT evidence of either private or public access.
 const privateHead=head(undefined);
 const omitted={...head(4,'V2-versioned-id'),entryPoints:[{entryPointType:'WEB_APP',webApp:{url:'https://script.google.com/macros/s/private/versioned'}}]};
 const aclEvidence=evidence.readOnlyAclEvidence({deps:[privateHead,omitted],headProof:{access:'ANYONE_ANONYMOUS'},proofs:[{version:4,access:'ANYONE_ANONYMOUS'}]},true);
 assert.deepEqual(aclEvidence.find(x=>x.kind==='HEAD'),{kind:'HEAD',version:null,manifestAccess:'ANYONE_ANONYMOUS',webEntryPoints:[{access:'MYSELF',executeAs:'USER_DEPLOYING'}]});
 assert.deepEqual(aclEvidence.find(x=>x.version===4),{kind:'VERSIONED',version:4,manifestAccess:'ANYONE_ANONYMOUS',webEntryPoints:[{access:'omitted',executeAs:'omitted'}]});
 assert.doesNotMatch(JSON.stringify(aclEvidence),/V2-opaque-development-id|V2-versioned-id|https:\/\//);
 assert.deepEqual(evidence.readOnlyAclEvidence({deps:[{...privateHead,entryPoints:[]}],headProof:{access:'ANYONE_ANONYMOUS'},proofs:[]},true)[0].webEntryPoints,[]);
 const positive=evidence.normalizedDeployments([head(2,'V2-versioned-id')])[0];
 assert.equal(positive.kind,'VERSIONED');assert.equal(positive.version,2);
 assert.deepEqual(evidence.deploymentVersionShape(undefined),{kind:'HEAD',version:null});
 assert.deepEqual(evidence.deploymentVersionShape(0),{kind:'HEAD',version:null});
 assert.throws(()=>evidence.deploymentVersionShape(null),/unexpected deployment version/);
 assert.throws(()=>evidence.deploymentVersionShape('0'),/unexpected deployment version/);
 assert.throws(()=>evidence.deploymentVersionShape(-1),/unexpected deployment version/);
 assert.throws(()=>evidence.deploymentVersionShape(1.5),/unexpected deployment version/);
});

test('HEAD is unique; foreign project and unsafe public or user execution still blocked',()=>{
 const raw={
  deploymentId:'V2-opaque-head-one',
  deploymentConfig:{scriptId:core.SID},
  entryPoints:[{webApp:{entryPointConfig:{access:'MYSELF',executeAs:'USER_DEPLOYING'}}}]
 };
 const second={...raw,deploymentId:'V2-opaque-head-two',
  deploymentConfig:{...raw.deploymentConfig,versionNumber:0}};
 assert.throws(()=>evidence.normalizedDeployments([raw,second]),/multiple unversioned\/HEAD/);
 assert.throws(()=>evidence.normalizedDeployments([{...raw,
  deploymentConfig:{scriptId:'original-gas-should-block'}}]),/foreign Script ID/);
 assert.throws(()=>evidence.normalizedDeployments([{...raw,
  entryPoints:[{webApp:{entryPointConfig:{access:'ANYONE_ANONYMOUS',
   executeAs:'USER_DEPLOYING'}}}]}]),/publicly accessible/);
 assert.throws(()=>evidence.normalizedDeployments([{...raw,
  entryPoints:[{webApp:{entryPointConfig:{access:'MYSELF',
   executeAs:'USER_ACCESSING'}}}]}]),/execution identity/);
 assert.throws(()=>evidence.normalizedDeployments([{...raw,
  deploymentConfig:{scriptId:core.SID,manifestFileName:'other'}}]),/manifest file/);
});

test('read-only audit accepts nonliteral HEAD and correctly counts versioned deployments',async()=>{
 const f=fakeApi();
 let versionContentReads=0;
 f.api.getDeployments=async()=>[{
  deploymentId:'auto-v2-head-id-not-literal-HEAD',
  deploymentConfig:{scriptId:core.SID,versionNumber:0,manifestFileName:'appsscript'},
  entryPoints:[{entryPointType:'WEB_APP',webApp:{
   entryPointConfig:{access:'MYSELF',executeAs:'USER_DEPLOYING'}}}]
 }];
 f.api.getVersionContent=async()=>{versionContentReads++;return gas();};
 const {state:result}=await lifecycle.check('check',{scope:'remote',api:f.api});
 assert.equal(result.head.files.length,core.APPROVED.length);
 assert.equal(result.deploymentCount,1);
 assert.equal(result.versionedDeployments,0);
 assert.equal(evidence.normalizedDeployments(result.deps)[0].kind,'HEAD');
 assert.equal(versionContentReads,0);
 assert.match(result.fp,/^[a-f0-9]{64}$/);
 assert.deepEqual(f.counts(),{puts:0,versionCreates:0});
});

test('semantic deployment fingerprint ignores only display update time, never deployment identity or ACL',()=>{
 const head={deploymentId:'DEV',deploymentConfig:{scriptId:core.SID},updateTime:'2026-11-15T11:04:03Z',
  entryPoints:[{webApp:{entryPointConfig:{access:'MYSELF',executeAs:'USER_DEPLOYING'},url:'https://example.invalid/private'}}]};
 const fp=dep=>evidence.fingerprint([], [dep],core.reviewedPrivateTarget(),[]);
 assert.equal(fp(head),fp({...head,updateTime:'2026-11-15T11:04:11Z'}));
 assert.notEqual(fp(head),fp({...head,deploymentId:'OTHER'}));
 assert.notEqual(fp(head),fp({...head,entryPoints:[{webApp:{entryPointConfig:{access:'ANYONE',executeAs:'USER_DEPLOYING'}}}]}));
 assert.notEqual(fp(head),fp({...head,deploymentConfig:{scriptId:core.SID,manifestFileName:'appsscript',versionNumber:2}}));
 assert.throws(()=>fp({...head,entryPoints:[{webApp:{entryPointConfig:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}}}]}),/publicly accessible/);
});

test('public HEAD permits more restrictive development access but not mismatched versioned ACL',async()=>{
 const f=fakeApi(),pub={scriptId:core.SID,files:core.localSources()};
 f.api.getHead=async()=>pub;
 const dep={deploymentId:'DEV',deploymentConfig:{scriptId:core.SID},entryPoints:[{webApp:{entryPointConfig:{access:'MYSELF',executeAs:'USER_DEPLOYING'}}}]};
 f.api.getDeployments=async()=>[dep];
 assert.equal((await lifecycle.inventory(f.api)).safe,true);
 f.api.getVersions=async()=>[{scriptId:core.SID,versionNumber:1}];
 f.api.getVersionContent=async()=>pub;
 f.api.getDeployments=async()=>[{...dep,deploymentConfig:{scriptId:core.SID,versionNumber:1,manifestFileName:'appsscript'}}];
 assert.equal((await lifecycle.inventory(f.api)).safe,false);
});

test('single lifecycle remote check reuses inventory and never enables deploy or rollback',async()=>{
 const lifecycle=require('../scripts/study1-v2-release-lifecycle.cjs');
 const f=fakeApi(),counts={head:0,versions:0,deployments:0};
 for(const [method,key] of [['getHead','head'],['getVersions','versions'],['getDeployments','deployments']]){
  const original=f.api[method];f.api[method]=async()=>{counts[key]++;return original();};
 }
 const {state,receipt}=await lifecycle.check('check',{scope:'remote',api:f.api});
 assert.deepEqual(counts,{head:1,versions:1,deployments:1});
 assert.equal(receipt.baseline.inventorySha256,state.fp);
 assert.equal(receipt.baseline.knownSafe,true);
 for(const key of ['releaseAuthorized','writeAuthorized','runtimeVerified','mutationPerformed'])assert.equal(receipt[key],false);
 assert.equal(receipt.stages.deploy,'BLOCKED_PENDING_INDEPENDENT_PERMISSION');
 assert.equal(receipt.stages.rollback,'BLOCKED_PENDING_INDEPENDENT_PERMISSION');
 assert.doesNotMatch(JSON.stringify(receipt),/scriptId|https:|PRIVATE-ONLY-V2-001/);
 const forbidden=new Proxy({},{get(){throw Error('client accessed');}});
 for(const mode of ['deploy','rollback','unknown'])await assert.rejects(lifecycle.check(mode,{api:forbidden,scope:'remote'}),/V2_RELEASE_(STAGE_BLOCKED|UNKNOWN_MODE)/);
 await assert.rejects(lifecycle.check('check',{scope:'local',api:forbidden}),/LOCAL_CHECK_NO_CLIENT/);
 await assert.rejects(lifecycle.check('check',{scope:'remote'}),/CHECK_SCOPE/);
 assert.deepEqual(f.counts(),{puts:0,versionCreates:0});
 f.api.getHead=async()=>({...gas(),scriptId:'OTHER'});
 await assert.rejects(lifecycle.check('check',{scope:'remote',api:f.api}),/remote Script ID mismatch/);
});

test('anonymous candidate changes only manifest and passes original closed public safety',()=>{
 const b=base(),a=candidate();assert.equal(a.length,core.APPROVED.length);
 for(const f of b.filter(f=>f.name!=='appsscript'))assert.deepEqual(a.find(x=>x.name===f.name),f);
 assert.deepEqual(core.closedManifest(a,true),{...core.closedManifest(b),webapp:{executeAs:'USER_DEPLOYING',access:'ANYONE_ANONYMOUS'}});
 assert.throws(()=>core.closedManifest(a),/MYSELF/);
 assert.ok(core.publicRpcSurface(a)>=35);core.closedWebsite(a);
 assert.ok(evidence.sourceProof({scriptId:core.SID,files:a},true).known);
 const unknown=a.map(f=>f.name==='Index'?{...f,source:f.source+' '}:f);
 assert.equal(evidence.sourceProof({scriptId:core.SID,files:unknown},true).known,false);
 assert.throws(()=>core.anonymousReadOnlyCandidate(core.privateOwnerManagementCandidate(b)));
 const unsafe=b.map(f=>f.name==='Website'?{...f,source:f.source+'\nfunction leak(){return 1;}\n'}:f);
 assert.throws(()=>core.anonymousReadOnlyCandidate(unsafe),/unguarded public RPC/);
}); 

// Exact historical V4 sources from the existing immutable evidence chain,
// not a reconstruction of changed files from the development checkout.
// AdminSandbox historical blob 73509df10937b373019b87837e860bfd398a9c5a
// is taken verbatim from commit 1a50790ffff41a28e37dc005c2feaf64f2124727.
// The original full historical digest assertions remain unchanged.
function historicalV4Candidate(current){
 const historical=new Map([
  ['Study1PdfStampCore','study1-v2-v4-pdf-stamp-core.txt'],
  ['Study1FormalBooking','study1-v2-v4-formal-booking.txt'],
  ['AdminSandbox','study1-v2-v4-admin-sandbox.txt']
 ]);
 return current.map(f=>historical.has(f.name)?
  {...f,source:fs.readFileSync(path.join(__dirname,'fixtures',historical.get(f.name)),'utf8')}:f);
}
test('immutable verified v4 remains known after GAS source changes; tampered or wrong ACL still refused',async()=>{
 const current=candidate(),old=historicalV4Candidate(current);
 const historicalSha='ab5906a7e733cd2ea3520bc01e4ed137e3bd87c04f496da1ad06bf0c961c56c3';
 assert.equal(core.digest(old),historicalSha,'exact historical immutable source');
 assert.notEqual(core.digest(current),historicalSha);
 const remote=files=>({scriptId:core.SID,files});
 const oldProof=evidence.sourceProof(remote(old),true);
 assert.equal(oldProof.sha,historicalSha);assert.equal(oldProof.known,true);
 assert.equal(evidence.sourceProof(remote(old),false).known,false,'no implicit anonymous authorization');
 assert.equal(evidence.sourceProof(remote(current),true).known,true);
 const unknown=old.map(f=>f.name==='Index'?{...f,source:f.source+'\n<!-- unknown -->'}:f);
 assert.equal(evidence.sourceProof(remote(unknown),true).known,false);
 const wrong=old.map(f=>f.name==='appsscript'?{...f,source:JSON.stringify({...JSON.parse(f.source),webapp:{access:'ANYONE_ANONYMOUS',executeAs:'USER_ACCESSING'}})}:f);
 assert.equal(evidence.sourceProof(remote(wrong),true).known,false);
 const version={scriptId:core.SID,versionNumber:4},deployment=dep(4,'ANYONE_ANONYMOUS');
 const api={getHead:async()=>remote(old),getVersions:async()=>[version],getDeployments:async()=>[deployment],getVersionContent:async()=>remote(old),getDeployment:async()=>deployment};
 const state=await lifecycle.inventory(api,true);assert.equal(state.safe,true);
 const {receipt:readOnly}=await lifecycle.check('check',{scope:'remote',api,allowAnonymous:true});assert.equal(readOnly.baseline.knownSafe,true);
 assert.equal((await lifecycle.check('check',{scope:'remote',api:{...api,getVersionContent:async()=>remote(unknown)},allowAnonymous:true})).receipt.baseline.knownSafe,false);
 // The same anonymous inventory is still rejected by the strict write path.
 await assert.rejects(lifecycle.inventory(api),/publicly accessible/);

 assert.equal((await lifecycle.inventory({...api,getVersionContent:async()=>remote(unknown)},true)).safe,false);
 assert.equal((await lifecycle.inventory({...api,getDeployments:async()=>[dep(4,'ANYONE')]},true)).safe,false);
});

test('historical immutable proof and module import do not depend on an unfinished development checkout',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'study1-release-dev-'));
 try{
  fs.mkdirSync(path.join(temp,'scripts'));
  const root=path.join(__dirname,'..');
  for(const name of ['study1-v2-release-source.cjs','study1-v2-release-evidence.cjs','study1-v2-release-lifecycle.cjs'])fs.copyFileSync(path.join(root,'scripts',name),path.join(temp,'scripts',name));
  fs.cpSync(path.join(root,'gas'),path.join(temp,'gas'),{recursive:true});
  fs.writeFileSync(path.join(temp,'gas','NextFeature.js'),'function nextFeature_(){}');
  const devCore=require(path.join(temp,'scripts','study1-v2-release-source.cjs'));
  const devDeploy=require(path.join(temp,'scripts','study1-v2-release-evidence.cjs'));
  assert.ok(devCore.readDevelopmentSources().some(f=>f.name==='NextFeature'));
  assert.throws(()=>devCore.localSources(),/allowlist/);
  assert.throws(()=>devCore.reviewedPrivateTarget(),/allowlist/);
  assert.throws(()=>devCore.requireReviewedInventory(devCore.readDevelopmentSources()),/allowlist/);
  const old=historicalV4Candidate(candidate());
  const proof=devDeploy.sourceProof({scriptId:devCore.SID,files:old},true);
  assert.equal(proof.known,true);
  assert.equal(devDeploy.sourceProof({scriptId:devCore.SID,files:old},false).known,false);
  const changed=old.map(f=>f.name==='Index'?{...f,source:f.source+'<!-- unknown -->'}:f);
  assert.equal(devDeploy.sourceProof({scriptId:devCore.SID,files:changed},true).known,false);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
 });


test('shared source and evidence remain independent of retired publishing clients and have no mutation surface',()=>{
 for(const [file,expected] of [['study1-v2-release-source.cjs',['node:crypto','node:fs','node:path']],['study1-v2-release-evidence.cjs',['./study1-v2-release-source.cjs','node:crypto']]]){
  const bytes=fs.readFileSync(path.join(__dirname,'../scripts',file),'utf8');
  assert.deepEqual([...bytes.matchAll(/require\('([^']+)'\)/g)].map(x=>x[1]).sort(),expected);
 }
 for(const obj of [core,evidence,lifecycle])for(const name of ['apiFromCredentials','makeApi','prepare','apply','createImmutableVersion','deploy','rollback'])assert.equal(obj[name],undefined,name);
 assert.equal(core.reviewedPrivateTarget(),core.digest(core.privateOwnerManagementCandidate(base())));
 assert.throws(()=>core.verifyRemote({...gas(),scriptId:'OTHER'}),/wrong Script ID/);
 const obj={scriptId:core.SID,files:candidate()};
 assert.equal(evidence.sourceProof(obj,true).known,true);
 assert.equal(evidence.sourceProof(obj,false).known,false);
 assert.throws(()=>evidence.sourceProof({...obj,scriptId:'OTHER'},true),/remote Script ID mismatch/);
});
