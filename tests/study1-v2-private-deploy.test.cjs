'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const core=require('../scripts/study1-v2-gas-head-only.cjs');
const d=require('../scripts/study1-v2-private-deploy.cjs');
const baseFiles=()=>core.localSources();
const gas=()=>({scriptId:d.SID,files:baseFiles()});
const runEnv=()=>({GITHUB_REPOSITORY:d.REPO,GITHUB_REF:'refs/heads/main',
 GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:'a'.repeat(40),
 REVIEWED_SHA:'a'.repeat(40),PRIVATE_MODE:'deploy',
 CONFIRMATION:d.CONFIRM,EXPECTED_INVENTORY_SHA256:d.fingerprint([],[]),
 GITHUB_RUN_ID:'999'});
function fakeApi(){
 let version=0,deploy=null,puts=0,versionCreates=0;
 const api={
  getHead:async()=>gas(),
  getVersions:async()=>version?[{scriptId:d.SID,versionNumber:version,createTime:'2026-11-12T00:00:00Z',description:'private'}]:[],
  getDeployments:async()=>deploy?[deploy]:[],
  getVersionContent:async()=>gas(),
  getDeployment:async id=>{assert.equal(id,deploy?.deploymentId);return deploy;},
  createVersion:async()=>{versionCreates++;version=1;return {scriptId:d.SID,versionNumber:1};},
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
test('V2 source is exactly 32 reviewed GAS files with closed private manifest',()=>{
 const f=baseFiles();
 assert.equal(f.length,32);
 assert.equal(d.reviewedLocal().length,32);
 assert.equal(core.digest(f),d.TARGET);
 assert.equal(core.closedManifest(f).webapp.access,'MYSELF');
 assert.doesNotThrow(()=>core.closedWebsite(f));
});
test('strict manual main and independent deploy confirmation',()=>{
 const e=runEnv();assert.doesNotThrow(()=>d.invocation(e,'deploy'));
 assert.doesNotThrow(()=>d.invocation({...e,PRIVATE_MODE:'audit'},'audit'));
 for(const c of [{GITHUB_REF:'refs/heads/test'},{GITHUB_EVENT_NAME:'push'},
  {GITHUB_REPOSITORY:'solactw-star/study1-recruitment-gas'},
  {REVIEWED_SHA:'b'.repeat(40)},{CONFIRMATION:''},
  {EXPECTED_INVENTORY_SHA256:'x'}, {PRIVATE_MODE:'audit'}])
  assert.throws(()=>d.invocation({...e,...c},'deploy'),/V2_PRIVATE_BLOCKED/);
});
test('HEAD must match reviewed 32-file SHA and new Script ID',()=>{
 assert.deepEqual(d.checkHead(gas()),{sha:d.TARGET,files:32});
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
 assert.equal(result.head.files.length,32);
 assert.equal(result.deploymentCount,1);
 assert.equal(result.versionedDeployments,0);
 assert.equal(result.deps[0].kind,'HEAD');
 assert.equal(versionContentReads,0);
 assert.match(result.fp,/^[a-f0-9]{64}$/);
 assert.deepEqual(f.counts(),{puts:0,versionCreates:0});
});
test('public or wrong-execution deployment is rejected before any mutations',async()=>{
 const f=fakeApi(),b=await d.audit(f.api);
 assert.equal(b.head.files.length,32);
 assert.equal(b.versionCount,0);assert.equal(b.deploymentCount,0);
 assert.deepEqual(f.counts(),{puts:0,versionCreates:0});
 const publicDep={deploymentId:'PUBLIC',deploymentConfig:{scriptId:d.SID,versionNumber:1,manifestFileName:'appsscript'},
  entryPoints:[{webApp:{entryPointConfig:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}}}]};
 assert.throws(()=>d.normalizedDeployments([publicDep]),/publicly accessible/);
 const other={...publicDep,entryPoints:[{webApp:{entryPointConfig:{access:'MYSELF',executeAs:'USER_ACCESSING'}}}]};
 assert.throws(()=>d.normalizedDeployments([other]),/execution identity/);
});
test('successful private deploy creates exactly one version and one V2 deployment',async()=>{
 const f=fakeApi(),e=runEnv(),r=await d.deploy(f.api,e,()=>{});
 assert.equal(r.id,'PRIVATE-ONLY-V2-001');assert.equal(r.version,1);
 assert.deepEqual(f.counts(),{puts:1,versionCreates:1});
 const verified=await d.audit(f.api);
 assert.equal(verified.versionCount,1);assert.equal(verified.deploymentCount,1);
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
 await assert.rejects(d.deploy(f.api,e,()=>{}),/diverged/);
 assert.deepEqual(f.counts(),{puts:0,versionCreates:1});
});
test('repeated deploy is not allowed and cannot create duplicate endpoints',async()=>{
 const f=fakeApi(),e=runEnv();await d.deploy(f.api,e,()=>{});
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
test('workflow cannot be auto-triggered or upload code and has no legacy target',()=>{
 const script=fs.readFileSync(path.join(__dirname,'../scripts/study1-v2-private-deploy.cjs'),'utf8');
 const wf=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-v2-private-deploy.yml'),'utf8');
 assert.match(wf,/workflow_dispatch:/);
 assert.doesNotMatch(wf,/\n\s+push:|\n\s+schedule:/);
 for(const banned of ['1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z',
  'sheets.googleapis.com','SpreadsheetApp','clasp push','putContent(','MailApp','script.run']){
  assert.ok(!script.includes(banned),banned);
 }
 assert.ok(script.includes("const TARGET='73dea801154abbe847863a07df2e623fc1d68622a4442f006d1be7473dd5a0f7'"));
 assert.ok(wf.includes("secrets.V2_GAS_CLASPRC_JSON"));
 assert.ok(wf.includes('group: study1-v2-gas-head-only'));
});
