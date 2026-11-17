'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const core=require('../scripts/study1-v2-gas-head-only.cjs');
const d=require('../scripts/study1-v2-private-deploy.cjs');
const baseFiles=()=>core.privateOwnerManagementCandidate(core.localSources());
const gas=()=>({scriptId:d.SID,files:baseFiles()});
const runEnv=()=>({GITHUB_REPOSITORY:d.REPO,GITHUB_REF:'refs/heads/main',
 GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),
 REVIEWED_SHA:'a'.repeat(40),PRIVATE_MODE:'deploy',
 CONFIRMATION:d.CONFIRM,PRIVATE_VERSION:'1',REVIEWED_TARGET_SHA256:d.TARGET,EXPECTED_INVENTORY_SHA256:d.fingerprint([],[],d.TARGET,[]),
 GITHUB_RUN_ID:'999'});
async function stagedRelease(api,env,assertMain=()=>{},sleep){
 const version=await d.createImmutableVersion(api,{...env,PRIVATE_MODE:'version',CONFIRMATION:d.VERSION_CONFIRM},assertMain,sleep);
 const fresh=await d.audit(api);
 return d.deploy(api,{...env,PRIVATE_MODE:'deploy',PRIVATE_VERSION:String(version.version),EXPECTED_INVENTORY_SHA256:fresh.fp},assertMain,sleep);
}
function fakeApi(){
 let version=0,versionDescription='private',deploy=null,puts=0,versionCreates=0;
 const api={
  getHead:async()=>gas(),
  getVersions:async()=>version?[{scriptId:d.SID,versionNumber:version,createTime:'2026-11-12T00:00:00Z',description:versionDescription}]:[],
  getDeployments:async()=>deploy?[deploy]:[],
  getVersionContent:async()=>gas(),
  getDeployment:async id=>{assert.equal(id,deploy?.deploymentId);return deploy;},
  createVersion:async description=>{versionCreates++;version++;versionDescription=description;return {scriptId:d.SID,versionNumber:version};},
  createDeployment:async(n,description)=>{puts++;deploy={
   deploymentId:'PRIVATE-ONLY-V2-001',
   deploymentConfig:{scriptId:d.SID,versionNumber:n,manifestFileName:'appsscript',description},
   entryPoints:[{entryPointType:'WEB_APP',webApp:{entryPointConfig:{
    access:'MYSELF',executeAs:'USER_DEPLOYING'},url:'https://script.google.com/macros/s/private/exec'}}]};
   return deploy;
  }
 };
 return {api,counts:()=>({puts,versionCreates})};
}
test('V2 source matches the current approved GAS inventory and closed private manifest',()=>{
 const f=baseFiles();
 assert.equal(f.length,core.APPROVED.length);
 assert.equal(d.reviewedLocal().length,core.APPROVED.length);
 assert.equal(core.digest(f),d.TARGET);
 assert.equal(core.closedManifest(f).webapp.access,'MYSELF');
 assert.doesNotThrow(()=>core.closedWebsite(f));
});
test('strict manual main and independent deploy confirmation',()=>{
 const e=runEnv();assert.doesNotThrow(()=>d.invocation(e,'deploy'));
 assert.doesNotThrow(()=>d.invocation({...e,PRIVATE_MODE:'audit'},'audit'));
 for(const c of [{GITHUB_REF:'refs/heads/test'},{GITHUB_EVENT_NAME:'push'},{GITHUB_RUN_ATTEMPT:'2'},
  {GITHUB_REPOSITORY:'solactw-star/study1-recruitment-gas'},
  {REVIEWED_SHA:'b'.repeat(40)},{CONFIRMATION:''},
  {EXPECTED_INVENTORY_SHA256:'x'}, {PRIVATE_MODE:'audit'}])
  assert.throws(()=>d.invocation({...e,...c},'deploy'),/V2_PRIVATE_BLOCKED/);
});
test('HEAD must match reviewed 27-file SHA and new Script ID',()=>{
 assert.deepEqual(d.checkHead(gas()),{sha:d.TARGET,files:core.APPROVED.length});
 assert.throws(()=>d.checkHead({...gas(),scriptId:'old'}),/Script ID/);
 const f=baseFiles();f[0]={...f[0],source:f[0].source+' '};
 assert.throws(()=>d.checkHead({scriptId:d.SID,files:f}),/diverged/);
});
test('version and deployment inventory normalized and hashed deterministically',()=>{
 const v=[{scriptId:d.SID,versionNumber:2},{scriptId:d.SID,versionNumber:1}];
 assert.equal(d.fingerprint(v,[]),d.fingerprint([...v].reverse(),[]));
 assert.notEqual(d.fingerprint([],[]),d.fingerprint(v,[]));
 assert.throws(()=>d.normalizedVersions([v[0],v[0]]),/invalid/);
 assert.throws(()=>d.normalizedVersions([{scriptId:'old',versionNumber:1}]),/invalid/);
});
test('Google automatic HEAD deployment parses omitted or zero version independent of ID',()=>{
 const head=(versionNumber,id='V2-opaque-development-id')=>({
  deploymentId:id,deploymentConfig:{
   scriptId:d.SID,manifestFileName:'appsscript',
   ...(versionNumber===undefined?{}:{versionNumber})
  },entryPoints:[{entryPointType:'WEB_APP',webApp:{
   entryPointConfig:{access:'MYSELF',executeAs:'USER_DEPLOYING'},
   url:'https://script.google.com/macros/s/private/development'
  }}]
 });
 for(const raw of [head(undefined),head(0)]){
  const result=d.normalizedDeployments([raw]);
  assert.equal(result.length,1);assert.equal(result[0].kind,'HEAD');
  assert.equal(result[0].version,null);
  assert.equal(result[0].id,'V2-opaque-development-id');
  const diag=d.redactedDeploymentShapes([raw]);
  assert.equal(diag[0].versionShape,raw.deploymentConfig.versionNumber===undefined?'omitted':'zero');
  assert.ok(!JSON.stringify(diag).includes(raw.deploymentId));
  assert.ok(!JSON.stringify(diag).includes('/private/development'));
 }
 // The source may be anonymous while the development entry point is private;
 // a missing API field is NOT evidence of either private or public access.
 const privateHead=head(undefined);
 const omitted={...head(4,'V2-versioned-id'),entryPoints:[{entryPointType:'WEB_APP',webApp:{url:'https://script.google.com/macros/s/private/versioned'}}]};
 const evidence=d.readOnlyAclEvidence({deps:[privateHead,omitted],headProof:{access:'ANYONE_ANONYMOUS'},proofs:[{version:4,access:'ANYONE_ANONYMOUS'}]},true);
 assert.deepEqual(evidence.find(x=>x.kind==='HEAD'),{kind:'HEAD',version:null,manifestAccess:'ANYONE_ANONYMOUS',webEntryPoints:[{access:'MYSELF',executeAs:'USER_DEPLOYING'}]});
 assert.deepEqual(evidence.find(x=>x.version===4),{kind:'VERSIONED',version:4,manifestAccess:'ANYONE_ANONYMOUS',webEntryPoints:[{access:'omitted',executeAs:'omitted'}]});
 assert.doesNotMatch(JSON.stringify(evidence),/V2-opaque-development-id|V2-versioned-id|https:\/\//);
 assert.deepEqual(d.readOnlyAclEvidence({deps:[{...privateHead,entryPoints:[]}],headProof:{access:'ANYONE_ANONYMOUS'},proofs:[]},true)[0].webEntryPoints,[]);
 const positive=d.normalizedDeployments([head(2,'V2-versioned-id')])[0];
 assert.equal(positive.kind,'VERSIONED');assert.equal(positive.version,2);
 assert.deepEqual(d.deploymentVersionShape(undefined),{kind:'HEAD',version:null});
 assert.deepEqual(d.deploymentVersionShape(0),{kind:'HEAD',version:null});
 assert.throws(()=>d.deploymentVersionShape(null),/unexpected deployment version/);
 assert.throws(()=>d.deploymentVersionShape('0'),/unexpected deployment version/);
 assert.throws(()=>d.deploymentVersionShape(-1),/unexpected deployment version/);
 assert.throws(()=>d.deploymentVersionShape(1.5),/unexpected deployment version/);
});
test('HEAD is unique; foreign project and unsafe public or user execution still blocked',()=>{
 const raw={
  deploymentId:'V2-opaque-head-one',
  deploymentConfig:{scriptId:d.SID},
  entryPoints:[{webApp:{entryPointConfig:{access:'MYSELF',executeAs:'USER_DEPLOYING'}}}]
 };
 const second={...raw,deploymentId:'V2-opaque-head-two',
  deploymentConfig:{...raw.deploymentConfig,versionNumber:0}};
 assert.throws(()=>d.normalizedDeployments([raw,second]),/multiple unversioned\/HEAD/);
 assert.throws(()=>d.normalizedDeployments([{...raw,
  deploymentConfig:{scriptId:'original-gas-should-block'}}]),/foreign Script ID/);
 assert.throws(()=>d.normalizedDeployments([{...raw,
  entryPoints:[{webApp:{entryPointConfig:{access:'ANYONE_ANONYMOUS',
   executeAs:'USER_DEPLOYING'}}}]}]),/publicly accessible/);
 assert.throws(()=>d.normalizedDeployments([{...raw,
  entryPoints:[{webApp:{entryPointConfig:{access:'MYSELF',
   executeAs:'USER_ACCESSING'}}}]}]),/execution identity/);
 assert.throws(()=>d.normalizedDeployments([{...raw,
  deploymentConfig:{scriptId:d.SID,manifestFileName:'other'}}]),/manifest file/);
});
test('read-only audit accepts nonliteral HEAD and correctly counts versioned deployments',async()=>{
 const f=fakeApi();
 let versionContentReads=0;
 f.api.getDeployments=async()=>[{
  deploymentId:'auto-v2-head-id-not-literal-HEAD',
  deploymentConfig:{scriptId:d.SID,versionNumber:0,manifestFileName:'appsscript'},
  entryPoints:[{entryPointType:'WEB_APP',webApp:{
   entryPointConfig:{access:'MYSELF',executeAs:'USER_DEPLOYING'}}}]
 }];
 f.api.getVersionContent=async()=>{versionContentReads++;return gas();};
 const result=await d.audit(f.api);
 assert.equal(result.head.files.length,core.APPROVED.length);
 assert.equal(result.deploymentCount,1);
 assert.equal(result.versionedDeployments,0);
 assert.equal(d.normalizedDeployments(result.deps)[0].kind,'HEAD');
 assert.equal(versionContentReads,0);
 assert.match(result.fp,/^[a-f0-9]{64}$/);
 assert.deepEqual(f.counts(),{puts:0,versionCreates:0});
});
test('public or wrong-execution deployment is rejected before any mutations',async()=>{
 const f=fakeApi(),b=await d.audit(f.api);
 assert.equal(b.head.files.length,core.APPROVED.length);
 assert.equal(b.versionCount,0);assert.equal(b.deploymentCount,0);
 assert.deepEqual(f.counts(),{puts:0,versionCreates:0});
 const publicDep={deploymentId:'PUBLIC',deploymentConfig:{scriptId:d.SID,versionNumber:1,manifestFileName:'appsscript'},
  entryPoints:[{webApp:{entryPointConfig:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}}}]};
 assert.throws(()=>d.normalizedDeployments([publicDep]),/publicly accessible/);
 const other={...publicDep,entryPoints:[{webApp:{entryPointConfig:{access:'MYSELF',executeAs:'USER_ACCESSING'}}}]};
 assert.throws(()=>d.normalizedDeployments([other]),/execution identity/);
});
test('successful private deploy creates exactly one version and one V2 deployment',async()=>{
 const f=fakeApi(),e=runEnv(),r=await stagedRelease(f.api,e,()=>{});
 assert.equal(r.id,'PRIVATE-ONLY-V2-001');assert.equal(r.version,1);
 assert.deepEqual(f.counts(),{puts:1,versionCreates:1});
 const verified=await d.audit(f.api);
 assert.equal(verified.versionCount,1);assert.equal(verified.deploymentCount,1);
});
test('failed previous run orphan is reused only after audited provenance and immutable source verification',async()=>{
 const f=fakeApi(),e=runEnv();
 const prefix='Study1 V2 PRIVATE MYSELF HEAD '+d.TARGET+
  ' GitHub '+e.GITHUB_SHA+' Run ';
 const orphan=await f.api.createVersion(prefix+'43182160131');
 assert.equal(orphan.versionNumber,1);
 const reviewed=await d.audit(f.api);
 const resumed=await stagedRelease(f.api,
  {...e,EXPECTED_INVENTORY_SHA256:reviewed.fp},()=>{},async()=>{});
 assert.equal(resumed.version,1);
 assert.deepEqual(f.counts(),{puts:1,versionCreates:1});
 const after=await d.audit(f.api);
 assert.equal(after.versionCount,1);
 assert.equal(after.deploymentCount,1);
});
test('GET-only readback tolerates a temporarily stale versions list after single POST',async()=>{
 const f=fakeApi(),e=runEnv();
 const create=f.api.createVersion,getVersions=f.api.getVersions;
 let created=false,stale=0;const sleeps=[];
 f.api.createVersion=async description=>{
  const v=await create(description);created=true;return v;
 };
 f.api.getVersions=async()=>{
  if(created&&stale++===0)return [];
  return getVersions();
 };
 const deployed=await stagedRelease(f.api,e,()=>{},async ms=>{sleeps.push(ms);});
 assert.equal(deployed.version,1);
 assert.deepEqual(sleeps,[1000]);
 assert.deepEqual(f.counts(),{puts:1,versionCreates:1});
});
test('successful version POST with temporarily invisible exact immutable content uses bounded GET only',async()=>{
 const f=fakeApi(),e=runEnv(),sleeps=[];let reads=0;
 const original=f.api.getVersionContent;
 f.api.getVersionContent=async n=>{
  assert.equal(n,1);
  if(++reads<=2)throw Error('GET V2 Apps Script API /content HTTP 404 after 1 attempt(s); no mutation inferred');
  return original(n);
 };
 const result=await d.createImmutableVersion(f.api,{...e,PRIVATE_MODE:'version',CONFIRMATION:d.VERSION_CONFIRM},()=>{},async ms=>{sleeps.push(ms);});
 assert.deepEqual(result,{version:1,createdNew:true});
 assert.equal(reads,4); // three exact GET attempts, then full inventory proof
 assert.deepEqual(sleeps,[1000,2000]);assert.deepEqual(f.counts(),{puts:0,versionCreates:1});
});
test('post-create immutable content rejects persistent 404, permission failure, wrong bytes and concurrent changes without another POST',async()=>{
 for(const kind of ['404','403','wrong-content','drift']){
  const f=fakeApi(),e=runEnv(),sleeps=[];let reads=0;
  const original=f.api.getVersionContent;
  f.api.getVersionContent=async n=>{
   assert.ok(n===1||kind==='drift');reads++;
   if(kind==='404'||kind==='403')throw Error('GET V2 Apps Script API /content HTTP '+kind);
   if(kind==='drift'&&reads===1)throw Error('GET V2 Apps Script API /content HTTP 404');
   const content=await original(n);
   if(kind==='wrong-content')content.files[0]={...content.files[0],source:content.files[0].source+'DRIFT'};
   if(kind==='drift'&&reads===2){
    const list=f.api.getVersions;
    f.api.getVersions=async()=>[...(await list()),{scriptId:d.SID,versionNumber:2,description:'CONCURRENT'}];
   }
   return content;
  };
  await assert.rejects(d.createImmutableVersion(f.api,{...e,PRIVATE_MODE:'version',CONFIRMATION:d.VERSION_CONFIRM},()=>{},async ms=>{sleeps.push(ms);}),
   kind==='404'?/direct readback unknown/:kind==='403'?/HTTP 403/:kind==='wrong-content'?/diverged/:/inventory changed unexpectedly/);
  assert.deepEqual(f.counts(),{puts:0,versionCreates:1});
  assert.equal(reads,kind==='404'?5:kind==='drift'?4:1);
  assert.deepEqual(sleeps,kind==='404'?[1000,2000,4000,8000]:kind==='drift'?[1000]:[]);
 }
});
test('ambiguous multiple matching orphans stop before any new POST',async()=>{
 const f=fakeApi(),e=runEnv();
 const text='Study1 V2 PRIVATE MYSELF HEAD '+d.TARGET+
  ' GitHub '+e.GITHUB_SHA+' Run ';
 f.api.getVersions=async()=>[
  {scriptId:d.SID,versionNumber:1,description:text+'123'},
  {scriptId:d.SID,versionNumber:2,description:text+'124'}
 ];
 const before=await d.audit(f.api);
 await assert.rejects(stagedRelease(f.api,
  {...e,EXPECTED_INVENTORY_SHA256:before.fp},()=>{},async()=>{}),
  /multiple matching orphan versions/);
 assert.deepEqual(f.counts(),{puts:0,versionCreates:0});
});
test('new deployment may appear one GET behind without repeating POST',async()=>{
 const f=fakeApi(),e=runEnv();
 const create=f.api.createDeployment,getDeps=f.api.getDeployments;
 let created=false,stale=0;const sleeps=[];
 f.api.createDeployment=async(...args)=>{
  const dep=await create(...args);created=true;return dep;
 };
 f.api.getDeployments=async()=>{
  if(created&&stale++===0)return [];
  return getDeps();
 };
 const deployed=await stagedRelease(f.api,e,()=>{},async ms=>{sleeps.push(ms);});
 assert.equal(deployed.version,1);
 assert.deepEqual(sleeps,[1000]);
 assert.deepEqual(f.counts(),{puts:1,versionCreates:1});
});
test('successful POST with temporarily invisible direct deployment settles without repeating mutation',async()=>{
 const f=fakeApi(),e=runEnv(),sleeps=[];
 const original=f.api.getDeployment;let direct=0;
 f.api.getDeployment=async id=>{
  direct++;if(direct<=2)throw Error('GET V2 Apps Script API deployment HTTP 404 after 1 attempt(s); no mutation inferred');
  return original(id);
 };
 const result=await stagedRelease(f.api,e,()=>{},async ms=>{sleeps.push(ms);});
 assert.equal(result.version,1);assert.equal(direct,3);
 assert.deepEqual(sleeps,[1000,2000]);assert.deepEqual(f.counts(),{puts:1,versionCreates:1});
});
test('post-create direct readback fails closed on persistent 404, access denial and concurrent changes',async()=>{
 for(const kind of ['404','403','drift','wrong-direct']){
  const f=fakeApi(),e=runEnv(),sleeps=[];let direct=0;
  const original=f.api.getDeployment;
  f.api.getDeployment=async id=>{
   direct++;
   if(kind==='404'||kind==='403')throw Error('GET V2 Apps Script API deployment HTTP '+kind);
   if(kind==='drift'&&direct===1)throw Error('GET V2 Apps Script API deployment HTTP 404');
   const dep=await original(id);
   if(kind==='drift'){
    const prior=f.api.getDeployments;f.api.getDeployments=async()=>[...(await prior()),{...dep,deploymentId:'CONCURRENT'}];
   }
   return kind==='wrong-direct'?{...dep,deploymentConfig:{...dep.deploymentConfig,versionNumber:99}}:dep;
  };
  await assert.rejects(stagedRelease(f.api,e,()=>{},async ms=>{sleeps.push(ms);}),{
   message:kind==='404'?/direct readback unknown/:kind==='403'?/HTTP 403/:kind==='drift'?/inventory changed during direct deployment readback/:/deployed ID\/version readback failed/
  });
  assert.deepEqual(f.counts(),{puts:1,versionCreates:1});
  assert.equal(direct,kind==='404'?5:kind==='drift'?2:1);
  assert.deepEqual(sleeps,kind==='404'?[1000,2000,4000,8000]:kind==='drift'?[1000]:[]);
 }
});
test('inventory SHA mismatch or HEAD drift blocks before version/deployment',async()=>{
 const f=fakeApi(),e=runEnv();
 await assert.rejects(d.deploy(f.api,{...e,EXPECTED_INVENTORY_SHA256:'f'.repeat(64)},()=>{}),/inventory differs/);
 assert.deepEqual(f.counts(),{puts:0,versionCreates:0});
 const broken=fakeApi();broken.api.getHead=async()=>({...gas(),scriptId:'other'});
 await assert.rejects(d.audit(broken.api),/Script ID/);
 assert.deepEqual(broken.counts(),{puts:0,versionCreates:0});
});
test('HEAD drift after version creation cannot publish deployment',async()=>{
 const f=fakeApi(),e=runEnv();let created=false;
 const original=f.api.createVersion;
 f.api.createVersion=async s=>{const result=await original(s);created=true;return result;};
 f.api.getHead=async()=>{const h=gas();if(created){h.files[0]={...h.files[0],source:h.files[0].source+'DRIFT'};}return h;};
 await assert.rejects(stagedRelease(f.api,e,()=>{}),/diverged/);
 assert.deepEqual(f.counts(),{puts:0,versionCreates:1});
});
test('repeated deploy is not allowed and cannot create duplicate endpoints',async()=>{
 const f=fakeApi(),e=runEnv();await stagedRelease(f.api,e,()=>{});
 const updated=await d.audit(f.api);
 await assert.rejects(d.deploy(f.api,{...e,EXPECTED_INVENTORY_SHA256:updated.fp},()=>{}),/already exists/);
 assert.deepEqual(f.counts(),{puts:1,versionCreates:1});
});
test('V2 Apps Script API addresses only fixed V2 project and version/deployment routes',async()=>{
 const sent=[];
 const fetcher=async(url,c)=>{
  sent.push([url,c.method]);
  if(url.includes('oauth2.googleapis.com'))return {ok:true,json:async()=>({access_token:'access_token_long_enough'})};
  const p=url.split('/v1/projects/'+d.SID)[1];
  assert.ok(p!==undefined,'unexpected script ID or host');
  return {ok:true,json:async()=>{
   if(p==='/content')return gas();
   if(p.startsWith('/versions?'))return {versions:[]};
   if(p.startsWith('/deployments?'))return {deployments:[]};
   if(p.startsWith('/content?versionNumber='))return gas();
   if(p==='/versions')return {scriptId:d.SID,versionNumber:1};
   if(p==='/deployments')return {deploymentId:'PREVIEW',deploymentConfig:{scriptId:d.SID,versionNumber:1}};
   throw Error('unexpected '+p);
  }};
 };
 const api=await d.makeApi({refresh_token:'tok',client_id:'id',client_secret:'secret'},fetcher);
 await api.getHead();await api.getVersions();await api.getDeployments();
 await api.getVersionContent(1);await api.createVersion('test');await api.createDeployment(1,'test');
 assert.equal(sent.length,7);
 assert.ok(sent.every(x=>!x[0].includes('sheets.googleapis.com')));
 assert.ok(!sent.some(x=>x[1]==='PUT'||x[1]==='DELETE'));
});
test('GET 503 retries with bounded exponential backoff and no GAS mutations',async()=>{
 let gets=0;const waits=[],calls=[];
 const fetcher=async(url,opts)=>{
  calls.push({url,method:opts.method});
  if(url.includes('oauth2.googleapis.com'))return {
   ok:true,json:async()=>({access_token:'test_token_safe_for_testing'})
  };
  gets++;
  return gets<3?{ok:false,status:503}:{ok:true,json:async()=>({deployments:[]})};
 };
 const api=await d.makeApi({refresh_token:'fake',client_id:'fake',client_secret:'fake'},
  fetcher,async ms=>waits.push(ms),()=>0);
 assert.deepEqual(await api.getDeployments(),[]);
 assert.equal(gets,3);
 assert.deepEqual(waits,[1000,2000]);
 assert.equal(calls.filter(c=>c.method==='GET').length,3);
 assert.equal(calls.filter(c=>c.method==='POST').length,1); // OAuth refresh only
 assert.equal(d.GET_RETRY_MAX_ATTEMPTS,3);
});
test('GET 429 uses quota-aware 30s and 60s delays, then fails closed',async()=>{
 let gets=0;const waits=[];
 const fetcher=async(url,opts)=>{
  if(opts.method==='POST')return {ok:true,json:async()=>({access_token:'test_token_safe_for_testing'})};
  gets++;
  return {ok:false,status:429};
 };
 const api=await d.makeApi({refresh_token:'fake',client_id:'fake',client_secret:'fake'},
  fetcher,async ms=>waits.push(ms),()=>0);
 await assert.rejects(api.getVersions(),/GET V2 Apps Script API \/versions HTTP 429 after 3 attempt/);
 assert.equal(gets,3);
 assert.deepEqual(waits,[30000,60000]);
 assert.equal(d.retryDelayMs(503,1,1),1249);
 assert.equal(d.retryDelayMs(429,2,1),60249);
 assert.throws(()=>d.retryDelayMs(403,1,0),/invalid GET retry/);
 assert.deepEqual([d.safeApiRoute('/deployments/OPAQUE_ID'),
  d.safeApiRoute('/deployments?pageToken=PRIVATE_TOKEN')],
  ['/deployments/:id','/deployments']);
});
test('GET 401/403 errors and thrown network failures never retry',async()=>{
 for(const status of [401,403,404]){
  let gets=0;const waits=[];
  const api=await d.makeApi({refresh_token:'fake',client_id:'fake',client_secret:'fake'},
   async(url,opts)=>opts.method==='POST'?
    {ok:true,json:async()=>({access_token:'test_token_safe_for_testing'})}:
    (gets++,{ok:false,status}),
   async ms=>waits.push(ms),()=>0);
  await assert.rejects(api.getHead(),new RegExp('GET V2 Apps Script API \\/content HTTP '+status+' after 1 attempt'));
  assert.equal(gets,1);assert.deepEqual(waits,[]);
 }
 let thrown=0;
 const api=await d.makeApi({refresh_token:'fake',client_id:'fake',client_secret:'fake'},
  async(url,opts)=>opts.method==='POST'?
   {ok:true,json:async()=>({access_token:'test_token_safe_for_testing'})}:
   (thrown++,Promise.reject(Error('network-failure'))),
  async()=>{throw Error('unexpected delay');},()=>0);
 await assert.rejects(api.getHead(),/network-failure/);
 assert.equal(thrown,1);
});
test('POST versions/deployments never retry even when server says 503 or 429',async()=>{
 for(const status of [503,429]){
  let mutations=0;const waits=[];
  const fetcher=async(url,opts)=>{
   if(url.includes('oauth2.googleapis.com'))return {
    ok:true,json:async()=>({access_token:'test_token_safe_for_testing'})
   };
   if(opts.method==='POST')mutations++;
   return {ok:false,status};
  };
  const api=await d.makeApi({refresh_token:'fake',client_id:'fake',client_secret:'fake'},
   fetcher,async ms=>waits.push(ms),()=>0);
  await assert.rejects(api.createVersion('readonly-test'),new RegExp('POST V2 Apps Script API \\/versions HTTP '+status+' after 1 attempt'));
  await assert.rejects(api.createDeployment(1,'readonly-test'),new RegExp('POST V2 Apps Script API \\/deployments HTTP '+status+' after 1 attempt'));
  assert.equal(mutations,2);
  assert.deepEqual(waits,[]);
 }
});
test('ordinary main pushes audit only; manual and one-time bound release jobs remain isolated',()=>{
 const script=fs.readFileSync(path.join(__dirname,'../scripts/study1-v2-private-deploy.cjs'),'utf8');
 const wf=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-v2-private-deploy.yml'),'utf8');
 assert.match(wf,/workflow_dispatch:/);
 assert.match(wf,/\n  push:\s*\n    branches: \[main\]/);
 assert.doesNotMatch(wf,/\n\s+schedule:/);
 const auto=wf.slice(wf.indexOf('  automatic-inventory:'),wf.indexOf('  private-preview:'));
 const manual=wf.slice(wf.indexOf('  private-preview:'));
 assert.ok(auto.includes("github.event_name == 'push'")&&manual.includes("github.event_name == 'workflow_dispatch'"));
 assert.match(auto,/node scripts\/study1-v2-private-deploy\.cjs auto-audit/);
 assert.doesNotMatch(auto,/\.cjs (prepare|version|deploy)|upload-artifact|CONFIRMATION:|PRIVATE_MODE:/);
 for(const banned of ['1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z',
  'sheets.googleapis.com','SpreadsheetApp','clasp push','putContent(','MailApp','script.run']){
  assert.ok(!script.includes(banned),banned);
 }
 const evidence=fs.readFileSync(path.join(__dirname,'../scripts/study1-v2-release-evidence.cjs'),'utf8');
 assert.ok(evidence.includes("const HISTORICAL_TARGET='73dea801154abbe847863a07df2e623fc1d68622a4442f006d1be7473dd5a0f7'"));
 assert.equal(d.TARGET,core.PRIVATE_TARGET);
 assert.ok(wf.includes("secrets.V2_GAS_CLASPRC_JSON"));
 assert.ok(wf.includes('group: study1-v2-gas-head-only'));
});

test('new audit reports unsynced HEAD without granting mutation; prior audit binds full HEAD bytes',async()=>{
 const f=fakeApi();
 const changed=gas();changed.files[0]={...changed.files[0],source:changed.files[0].source+' '};
 f.api.getHead=async()=>changed;
 const result=await d.audit(f.api);
 assert.notEqual(result.headSha,d.TARGET);assert.equal(result.safe,false);
 assert.notEqual(result.fp,d.fingerprint([],[],d.TARGET,[]));
 await assert.rejects(d.createImmutableVersion(f.api,{...runEnv(),PRIVATE_MODE:'version',CONFIRMATION:d.VERSION_CONFIRM,EXPECTED_INVENTORY_SHA256:result.fp},()=>{}),/diverged/);
 assert.deepEqual(f.counts(),{puts:0,versionCreates:0});
});
test('version and deployment are separately authorized, audit-bound and exact version only',async()=>{
 const f=fakeApi(),e=runEnv();
 await assert.rejects(d.createImmutableVersion(f.api,{...e,PRIVATE_MODE:'version'},()=>{}),/approval missing/);
 await assert.rejects(d.deploy(f.api,e,()=>{}),/immutable candidate version/);
 assert.deepEqual(f.counts(),{puts:0,versionCreates:0});
 const v=await d.createImmutableVersion(f.api,{...e,PRIVATE_MODE:'version',CONFIRMATION:d.VERSION_CONFIRM},()=>{});
 assert.deepEqual(f.counts(),{puts:0,versionCreates:1});
 await assert.rejects(d.deploy(f.api,e,()=>{}),/inventory differs/);
 const a=await d.audit(f.api);
 await assert.rejects(d.deploy(f.api,{...e,PRIVATE_VERSION:'2',EXPECTED_INVENTORY_SHA256:a.fp},()=>{}),/immutable candidate version/);
 await d.deploy(f.api,{...e,PRIVATE_VERSION:String(v.version),EXPECTED_INVENTORY_SHA256:a.fp},()=>{});
 assert.deepEqual(f.counts(),{puts:1,versionCreates:1});
});
test('private HEAD synchronization refuses unproven or public development ACL',async()=>{
 const f=fakeApi();
 const state=await d.audit(f.api);
 assert.throws(()=>d.requirePrivateHeadBaseline(state),/development deployment/);
 const dev={deploymentId:'HEAD',deploymentConfig:{scriptId:d.SID},entryPoints:[{webApp:{entryPointConfig:{access:'MYSELF',executeAs:'USER_DEPLOYING'}}}]};
 f.api.getDeployments=async()=>[dev];
 assert.doesNotThrow(()=>d.requirePrivateHeadBaseline({...state,deps:[dev]}));
 f.api.getDeployments=async()=>[{...dev,entryPoints:[{webApp:{entryPointConfig:{access:'ANYONE',executeAs:'USER_DEPLOYING'}}}]}];
 const mixed=await d.audit(f.api);
 assert.equal(mixed.safe,false);
 assert.throws(()=>d.requirePrivateHeadBaseline(mixed),/unverified/);
});

test('immutable version/deploy prewrite snapshots are encrypted, distinct and bound to the exact audited phase',async()=>{
 const os=require('node:os'),f=fakeApi(),c={refresh_token:'mock-private-backup-refresh-token'};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-private-backup-'));
 const e={...runEnv(),RUNNER_TEMP:dir,PRIVATE_MODE:'version',CONFIRMATION:d.VERSION_CONFIRM};
 try{
  assert.throws(()=>d.verifyReleaseBackup(c,e),/ENOENT/);
  const b=await d.prepareReleaseBackup(f.api,c,e,()=>{});
  assert.equal(b.fp,e.EXPECTED_INVENTORY_SHA256);
  assert.equal(d.verifyReleaseBackup(c,e),b.fp);
  assert.deepEqual(f.counts(),{puts:0,versionCreates:0});
  const p=d.releaseBackupPath(e),enc=fs.readFileSync(p,'utf8');
  assert.doesNotMatch(enc,/%PDF-|Study1Visitor|mock-private-backup-refresh-token/);
  for(const change of [{PRIVATE_MODE:'deploy'},{GITHUB_SHA:'b'.repeat(40)},{PRIVATE_VERSION:'2'},{EXPECTED_INVENTORY_SHA256:'b'.repeat(64)}])
   assert.throws(()=>d.verifyReleaseBackup(c,{...e,...change}));
  const altered=JSON.parse(enc);altered.tag=Buffer.alloc(16).toString('base64');
  fs.writeFileSync(p,JSON.stringify(altered));assert.throws(()=>d.verifyReleaseBackup(c,e));
  assert.deepEqual(f.counts(),{puts:0,versionCreates:0});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('deployment workflow saves authenticated ciphertext before mutation, and audit never runs write stages',()=>{
 const wf=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-v2-private-deploy.yml'),'utf8');
 const pre=wf.indexOf('node scripts/study1-v2-private-deploy.cjs prepare'),
  upload=wf.indexOf('uses: actions/upload-artifact@v4'),
  post=wf.lastIndexOf('node scripts/study1-v2-private-deploy.cjs "$PRIVATE_MODE"');
 assert.ok(pre>0&&upload>pre&&post>upload);
 assert.match(wf,/if-no-files-found: error/);
 assert.match(wf,/study1-v2-private-prewrite-\$\{\{ github.run_id \}\}\.json\.enc/);
 assert.ok((wf.match(/inputs\.mode != 'audit'/g)||[]).length>=3);
});

test('automatic audit is trusted-main-only and rejects all mutation input or invocation modes',async()=>{
 const e={GITHUB_REPOSITORY:d.REPO,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',
  GITHUB_SHA:'a'.repeat(40),V2_GAS_CLASPRC_JSON:JSON.stringify({tokens:{default:{refresh_token:'mock-long-refresh-token',client_id:'mock-client',client_secret:'mock-secret'}}})};
 const f=fakeApi(),state=await d.automaticAudit(e,()=>{},async(c,fet,sleep,random,ro)=>{
  assert.equal(ro,true);return f.api;
 });
 assert.equal(state.headSha,d.TARGET);
 assert.deepEqual(f.counts(),{puts:0,versionCreates:0});
 for(const change of [{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/feature'},
  {GITHUB_REPOSITORY:'other/repo'},{CONFIRMATION:d.CONFIRM},{PRIVATE_VERSION:'1'},
  {EXPECTED_INVENTORY_SHA256:'a'.repeat(64)}])
  assert.throws(()=>d.autoAuditInvocation({...e,...change}),/V2_PRIVATE_BLOCKED/);
 assert.throws(()=>d.invocation({...runEnv(),GITHUB_EVENT_NAME:'push'},'version'),/manual main/);
 assert.throws(()=>d.invocation({...runEnv(),GITHUB_EVENT_NAME:'push'},'deploy'),/manual main/);
});
test('read-only API rejects project POST before network; OAuth token exchange is not a project write',async()=>{
 const calls=[];
 const api=await d.makeApi({refresh_token:'mock',client_id:'mock',client_secret:'mock'},async(url,o)=>{
  calls.push([url,o.method]);return {ok:true,json:async()=>url.includes('oauth2.googleapis.com')?{access_token:'mock-token-long-enough'}:gas()};
 },undefined,undefined,true);
 assert.equal((await api.getHead()).scriptId,d.SID);
 await assert.rejects(api.createVersion('test'),/read-only inventory cannot mutate GAS/);
 await assert.rejects(api.createDeployment(1,'test'),/read-only inventory cannot mutate GAS/);
 assert.equal(calls.length,2);
 assert.equal(calls[1][1],'GET');
});

test('one-time release authorization binds actual parent, exact commit message, candidate, repository and first attempt',()=>{
 const env={GITHUB_SHA:'d'.repeat(40),GITHUB_RUN_ID:'987',GITHUB_RUN_ATTEMPT:'1',
  GITHUB_REPOSITORY:d.REPO,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',V2_ONCE_RELEASE:'1'};
 const e={before:d.RELEASE_PARENT,after:env.GITHUB_SHA,ref:'refs/heads/main',forced:false,deleted:false,created:false,
  repository:{full_name:d.REPO},head_commit:{id:env.GITHUB_SHA,message:d.RELEASE_MESSAGE},commits:[{id:env.GITHUB_SHA}]};
 if(d.TARGET===d.RELEASE_TARGET)assert.doesNotThrow(()=>d.oneShotInvocation(env,e));
 else assert.throws(()=>d.oneShotInvocation(env,e),/reviewed source identity mismatch/);
 for(const c of [{before:'f'.repeat(40)},{after:'e'.repeat(40)},{forced:true},{deleted:true},{created:true},
  {head_commit:{...e.head_commit,message:'later routine change'}},{commits:[{},{}]},{repository:{full_name:'other/repo'}}])
  assert.throws(()=>d.oneShotInvocation(env,{...e,...c}),/authorization event mismatch/);
 for(const c of [{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{V2_ONCE_RELEASE:''}])
  assert.throws(()=>d.oneShotInvocation({...env,...c},e),/first attempt/);
 assert.match(d.RELEASE_TARGET,/^[a-f0-9]{64}$/);
});
test('authorized one-time job preserves separate encrypted artifacts before each mutation and only GETs on failure',()=>{
 const wf=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-v2-private-deploy.yml'),'utf8');
 const job=wf.slice(wf.indexOf('  private-approved-once:'));
 assert.ok(job.includes(d.RELEASE_PARENT)&&job.includes(d.RELEASE_MESSAGE)&&job.includes('github.run_attempt == 1'));
 assert.ok(job.includes('needs: automatic-inventory'));
 for(const p of ['head','version','deploy']){
  const pre=job.indexOf('once-'+p+'-prepare'),artifact=job.indexOf('name: study1-v2-once-'+p+'-'),apply=job.indexOf('once-'+p+'-apply');
  assert.ok(pre>0&&artifact>pre&&apply>artifact,p);
 }
 assert.match(job,/if: failure\(\)[\s\S]*?\.cjs auto-audit/);
 assert.doesNotMatch(job,/rerun|clasp push|script\.run/i);
});

test('semantic deployment fingerprint ignores only display update time, never deployment identity or ACL',()=>{
 const head={deploymentId:'DEV',deploymentConfig:{scriptId:d.SID},updateTime:'2026-11-15T11:04:03Z',
  entryPoints:[{webApp:{entryPointConfig:{access:'MYSELF',executeAs:'USER_DEPLOYING'},url:'https://example.invalid/private'}}]};
 const fp=dep=>d.fingerprint([], [dep],d.TARGET,[]);
 assert.equal(fp(head),fp({...head,updateTime:'2026-11-15T11:04:11Z'}));
 assert.notEqual(fp(head),fp({...head,deploymentId:'OTHER'}));
 assert.notEqual(fp(head),fp({...head,entryPoints:[{webApp:{entryPointConfig:{access:'ANYONE',executeAs:'USER_DEPLOYING'}}}]}));
 assert.notEqual(fp(head),fp({...head,deploymentConfig:{scriptId:d.SID,manifestFileName:'appsscript',versionNumber:2}}));
 assert.throws(()=>fp({...head,entryPoints:[{webApp:{entryPointConfig:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}}}]}),/publicly accessible/);
});
test('reviewed private source SHA follows the current checkout rather than a historical release',()=>{
 const src=core.privateOwnerManagementCandidate(core.localSources());
 assert.equal(core.PRIVATE_TARGET,core.digest(src));
 assert.equal(d.TARGET,core.PRIVATE_TARGET);
 const bad= '0'.repeat(64);
 assert.throws(()=>core.releaseFiles({SOURCE_PROFILE:'private_e1_management',REVIEWED_TARGET_SHA256:bad}),/reviewed target SHA mismatch/);
});
test('deploy reuses the fresh reviewed immutable inventory before one POST and retains full readback',async()=>{
 const f=fakeApi(),e=runEnv();
 const v=await d.createImmutableVersion(f.api,{...e,PRIVATE_MODE:'version',CONFIRMATION:d.VERSION_CONFIRM},()=>{});
 const before=await d.audit(f.api);
 let lists=0,reads=0,listsAtPost,readsAtPost;
 const list=f.api.getVersions,content=f.api.getVersionContent,post=f.api.createDeployment;
 f.api.getVersions=async()=>{lists++;return list();};
 f.api.getVersionContent=async n=>{reads++;return content(n);};
 f.api.createDeployment=async(...a)=>{listsAtPost=lists;readsAtPost=reads;return post(...a);};
 await d.deploy(f.api,{...e,PRIVATE_VERSION:String(v.version),EXPECTED_INVENTORY_SHA256:before.fp},()=>{});
 assert.equal(listsAtPost,1);assert.equal(readsAtPost,1);
 assert.ok(lists>listsAtPost&&reads>readsAtPost);
 assert.deepEqual(f.counts(),{puts:1,versionCreates:1});
});

test('version 2 continuation only accepts its exact new event; original stages cannot run',async()=>{
 const e={...runEnv(),V2_ONCE_RELEASE:'1',V2_RESUME_DEPLOY:'1',GITHUB_EVENT_NAME:'push',
  GITHUB_SHA:'d'.repeat(40),REVIEWED_SHA:'d'.repeat(40),PRIVATE_VERSION:'2',EXPECTED_INVENTORY_SHA256:d.RESUME_FP};
 const event={before:d.RESUME_PARENT,after:e.GITHUB_SHA,ref:'refs/heads/main',forced:false,deleted:false,created:false,
  repository:{full_name:d.REPO},head_commit:{id:e.GITHUB_SHA,message:d.RESUME_MESSAGE},commits:[{id:e.GITHUB_SHA}]};
 const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'v2-resume-'));e.GITHUB_EVENT_PATH=path.join(dir,'event.json');
 fs.writeFileSync(e.GITHUB_EVENT_PATH,JSON.stringify(event));
 try{
  if(d.TARGET!==d.RELEASE_TARGET){
   assert.throws(()=>d.resumeEnv(e),/reviewed source identity mismatch/);
   assert.throws(()=>d.resumeEnv({...e,GITHUB_RUN_ATTEMPT:'2'}),/first attempt/);
   assert.throws(()=>d.oneShotInvocation(e,{...event,before:d.RELEASE_PARENT}),/authorization event mismatch/);
  }else{
  const next=d.resumeEnv(e);
  assert.equal(next.PRIVATE_VERSION,'2');assert.equal(next.EXPECTED_INVENTORY_SHA256,d.RESUME_FP);
  assert.doesNotThrow(()=>d.invocation(next,'deploy'));
  assert.throws(()=>d.invocation({...next,PRIVATE_VERSION:'1'},'deploy'),/only existing version 2 deployment/);
  assert.throws(()=>d.invocation({...next,PRIVATE_MODE:'version',CONFIRMATION:d.VERSION_CONFIRM},'version'),/only existing version 2 deployment/);
  await assert.rejects(d.oneShotPhase('head-prepare',next,{},fakeApi().api,null,()=>{}),/cannot invoke original multi-stage/);
  assert.throws(()=>d.resumeEnv({...e,GITHUB_RUN_ATTEMPT:'2'}),/first attempt/);
  assert.throws(()=>d.oneShotInvocation(e,{...event,before:d.RELEASE_PARENT}),/authorization event mismatch/);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
 const wf=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-v2-private-deploy.yml'),'utf8');
 const job=wf.slice(wf.indexOf('  private-version2-resume:'),wf.indexOf('  private-approved-once:'));
 assert.ok(job.includes(d.RESUME_PARENT)&&job.includes(d.RESUME_MESSAGE)&&job.includes('github.run_attempt == 1'));
 assert.ok(job.indexOf('resume-prepare')<job.indexOf('uses: actions/upload-artifact@v4')&&job.indexOf('uses: actions/upload-artifact@v4')<job.indexOf('resume-deploy'));
 assert.doesNotMatch(job,/once-head|once-version|clasp push/);
});

test('authorized public release adapter allows only exact main event and login-only verified URL',()=>{
 const p=require('../scripts/study1-v2-public-release.cjs');
 assert.equal(typeof core.latestMain,'function','release uses exported main verification');
 const env={V2_PUBLIC_RELEASE:'1',GITHUB_REPOSITORY:d.REPO,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',
  GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'d'.repeat(40),GITHUB_RUN_ID:'1'};
 const event={before:p.PARENT,after:env.GITHUB_SHA,ref:env.GITHUB_REF,head_commit:{id:env.GITHUB_SHA,message:p.MESSAGE},
  commits:[{}],repository:{full_name:d.REPO},forced:false,created:false,deleted:false};
 assert.doesNotThrow(()=>p.authorize(env,event));
 for(const c of [{before:'b'.repeat(40)},{forced:true},{head_commit:{id:env.GITHUB_SHA,message:'ordinary change'}}])
  assert.throws(()=>p.authorize(env,{...event,...c}),/authorization event mismatch/);
 assert.throws(()=>p.authorize({...env,GITHUB_RUN_ATTEMPT:'2'},event),/first main event/);
 const dep={deploymentId:'PUBLIC',deploymentConfig:{scriptId:d.SID,versionNumber:3,manifestFileName:'appsscript'},
  entryPoints:[{entryPointType:'WEB_APP',webApp:{entryPointConfig:{access:'ANYONE',executeAs:'USER_DEPLOYING'},url:'https://script.google.com/macros/s/public/exec'}}]};
 assert.equal(p.publicLink(dep,3),'https://script.google.com/macros/s/public/exec');
 assert.throws(()=>p.publicLink(dep,2),/unexpected published/);
 for(const access of ['MYSELF','ANYONE_ANONYMOUS']){
  const bad=JSON.parse(JSON.stringify(dep));bad.entryPoints[0].webApp.entryPointConfig.access=access;
  assert.throws(()=>p.publicLink(bad,3));
 }
 const wf=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-v2-private-deploy.yml'),'utf8');
 const job=wf.slice(wf.indexOf('  public-readonly-approved-once:'));
 assert.ok(job.includes(p.PARENT)&&job.includes(p.MESSAGE)&&job.includes('github.run_attempt == 1'));
 assert.ok(job.indexOf('public-release.cjs prepare')<job.indexOf('uses: actions/upload-artifact@v4')&&job.indexOf('uses: actions/upload-artifact@v4')<job.indexOf('public-release.cjs apply'));
});
test('public HEAD permits more restrictive development access but not mismatched versioned ACL',async()=>{
 const f=fakeApi(),pub={scriptId:d.SID,files:core.localSources()};
 f.api.getHead=async()=>pub;
 const dep={deploymentId:'DEV',deploymentConfig:{scriptId:d.SID},entryPoints:[{webApp:{entryPointConfig:{access:'MYSELF',executeAs:'USER_DEPLOYING'}}}]};
 f.api.getDeployments=async()=>[dep];
 assert.equal((await d.inventory(f.api)).safe,true);
 f.api.getVersions=async()=>[{scriptId:d.SID,versionNumber:1}];
 f.api.getVersionContent=async()=>pub;
 f.api.getDeployments=async()=>[{...dep,deploymentConfig:{scriptId:d.SID,versionNumber:1,manifestFileName:'appsscript'}}];
 assert.equal((await d.inventory(f.api)).safe,false);
});

test('public version 3 resume has independently bound event and no HEAD or version create call',()=>{
 const p=require('../scripts/study1-v2-public-release.cjs');
 const e={V2_PUBLIC_RELEASE:'1',V2_PUBLIC_RESUME:'1',GITHUB_REPOSITORY:d.REPO,GITHUB_REF:'refs/heads/main',
  GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'d'.repeat(40),GITHUB_RUN_ID:'88'};
 const ev={before:p.RESUME_PARENT,after:e.GITHUB_SHA,ref:e.GITHUB_REF,
  head_commit:{id:e.GITHUB_SHA,message:p.RESUME_MESSAGE},commits:[{}],repository:{full_name:d.REPO},forced:false,created:false,deleted:false};
 assert.doesNotThrow(()=>p.authorize(e,ev));
 assert.throws(()=>p.authorize({...e,V2_PUBLIC_RESUME:''},ev),/authorization event mismatch/);
 assert.throws(()=>p.authorize({...e,GITHUB_RUN_ATTEMPT:'2'},ev),/first main event/);
 const code=fs.readFileSync(path.join(__dirname,'../scripts/study1-v2-public-release.cjs'),'utf8');
 const body=code.slice(code.indexOf('async function resumeDeploy'),code.indexOf('async function main'));
 assert.doesNotMatch(body,/putContent|createVersion/);
 assert.equal((body.match(/api\.createDeployment\(/g)||[]).length,1);
 const wf=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-v2-private-deploy.yml'),'utf8');
 const job=wf.slice(wf.indexOf('  public-version3-resume:'));
 assert.ok(job.includes(p.RESUME_PARENT)&&job.includes(p.RESUME_MESSAGE));
 assert.match(job,/actions\/download-artifact@v4/);
 assert.ok(job.indexOf('resume-prepare')<job.indexOf('actions/upload-artifact@v4')&&job.indexOf('actions/upload-artifact@v4')<job.indexOf('resume-apply'));
});


test('historical evidence layer is independent of old publishing clients and preserves existing function identity',()=>{
 const evidence=require('../scripts/study1-v2-release-evidence.cjs'),source=require('../scripts/study1-v2-release-source.cjs');
 for(const name of ['sourceProof','normalizedVersions','normalizedDeployments','deploymentVersionShape','redactedDeploymentShapes','fingerprint','readOnlyAclEvidence'])assert.equal(d[name],evidence[name],name);
 assert.equal(core.verifyRemote,source.verifyRemote);
 assert.equal(core.PRIVATE_TARGET,source.reviewedPrivateTarget());
 const bytes=fs.readFileSync(path.join(__dirname,'../scripts/study1-v2-release-evidence.cjs'),'utf8');
 assert.deepEqual([...bytes.matchAll(/require\('([^']+)'\)/g)].map(x=>x[1]).sort(),['./study1-v2-release-source.cjs','node:crypto']);
 for(const name of ['makeApi','inventory','audit','deploy','createImmutableVersion','rollback'])assert.equal(evidence[name],undefined,name);
 assert.equal(d.HISTORICAL_TARGET,evidence.HISTORICAL_TARGET);
 const candidate={scriptId:source.SID,files:source.anonymousReadOnlyCandidate()};
 assert.equal(evidence.sourceProof(candidate,true).known,true);
 assert.equal(evidence.sourceProof(candidate,false).known,false);
 assert.throws(()=>evidence.sourceProof({...candidate,scriptId:'OTHER'},true),/remote Script ID mismatch/);
});


test('single lifecycle remote check reuses inventory and never enables deploy or rollback',async()=>{
 const lifecycle=require('../scripts/study1-v2-release-lifecycle.cjs');
 assert.equal(d.inventory,lifecycle.inventory);
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
