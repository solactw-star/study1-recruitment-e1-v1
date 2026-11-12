'use strict';
/**
 * Study1 E1 V2 private preview: read-only inventory audit first; only a
 * separately confirmed manual deployment may create ONE V2 immutable version
 * and ONE MYSELF deployment. No GAS HEAD write, Sheet access or function run.
 * Do not import the legacy GAS deployment clients (bound to original Script ID).
 */
const core=require('./study1-v2-gas-head-only.cjs');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const SID=core.SID,REPO=core.REPO;
const TARGET='73dea801154abbe847863a07df2e623fc1d68622a4442f006d1be7473dd5a0f7';
const CONFIRM='I_AUTHORIZE_STUDY1_V2_PRIVATE_MYSELF_DEPLOY';
const assert=(ok,message)=>{if(!ok)throw Error('V2_PRIVATE_BLOCKED: '+message)};
const report=message=>{if(process.env.V2_PRIVATE_TEST_MODE!=='true')console.log(message);};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');

function invocation(env,mode){
 assert(mode==='audit'||mode==='deploy','unknown mode');
 assert(env.GITHUB_REPOSITORY===REPO && env.GITHUB_REF==='refs/heads/main' &&
  env.GITHUB_EVENT_NAME==='workflow_dispatch','V2 manual main workflow only');
 assert(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'') &&
  env.REVIEWED_SHA===env.GITHUB_SHA,'exact reviewed GitHub HEAD required');
 assert(env.PRIVATE_MODE===mode,'manual mode mismatch');
 if(mode==='deploy'){
  assert(env.CONFIRMATION===CONFIRM,'independent private deployment approval missing');
  assert(/^[a-f0-9]{64}$/.test(env.EXPECTED_INVENTORY_SHA256||''),
   'verified inventory fingerprint from separate read-only audit required');
 }
}
function latestMain(env){
 const shaLocal=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const shaRemote=execFileSync('git',['ls-remote','origin','refs/heads/main'],
  {encoding:'utf8',timeout:20000}).trim().split(/\s+/)[0];
 assert(shaLocal===env.GITHUB_SHA&&shaRemote===shaLocal,'V2 main moved since review');
}
function reviewedLocal(){
 const files=core.localSources();
 assert(files.length===32&&core.digest(files)===TARGET,
  'reviewed complete 32-file V2 source SHA mismatch');
 core.closedManifest(files);core.closedWebsite(files);
 return files;
}
function checkHead(head){
 assert(head?.scriptId===SID,'remote Script ID mismatch');
 assert(Array.isArray(head.files)&&head.files.length===32,'V2 HEAD missing 32 source files');
 assert(core.digest(head.files)===TARGET,'V2 HEAD diverged from verified source SHA');
 core.closedManifest(head.files);core.closedWebsite(head.files);
 return {sha:TARGET,files:32};
}
async function makeApi(c,fetcher=fetch){
 const params=new URLSearchParams({grant_type:'refresh_token',
  refresh_token:c.refresh_token,client_id:c.client_id,client_secret:c.client_secret});
 const auth=await fetcher('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:params,signal:AbortSignal.timeout(20000)});
 assert(auth.ok,'OAuth token refresh HTTP '+auth.status);
 const token=(await auth.json()).access_token;
 assert(typeof token==='string'&&token.length>15,'OAuth token not returned');
 const base='https://script.googleapis.com/v1/projects/'+encodeURIComponent(SID);
 async function req(method,sub,body){
  assert(['GET','POST'].includes(method),'unapproved HTTP method');
  assert(!/\/\/|%2f/i.test(sub),'malformed V2-only relative path');
  const response=await fetcher(base+sub,{method,headers:{
   Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
   body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  assert(response.ok,method+' V2 Apps Script API '+sub.split('?')[0]+
   ' HTTP '+response.status+' (check OAuth scopes; no mutation inferred)');
  return response.json();
 }
 async function list(resource){
  const all=[],seen=new Set();
  let page='';
  for(let i=0;i<20;i++){
   const q=await req('GET','/'+resource+'?pageSize=50'+
    (page?'&pageToken='+encodeURIComponent(page):''));
   assert(Array.isArray(q[resource])||!q[resource],'invalid '+resource+' response');
   all.push(...(q[resource]||[]));
   if(!q.nextPageToken)return all;
   assert(!seen.has(q.nextPageToken),'pageToken cycle');seen.add(q.nextPageToken);
   page=q.nextPageToken;
  }
  throw Error('V2_PRIVATE_BLOCKED: too many '+resource+' pages');
 }
 return {
  getHead:()=>req('GET','/content'),
  getVersionContent:n=>req('GET','/content?versionNumber='+Number(n)),
  getVersions:()=>list('versions'),
  getDeployments:()=>list('deployments'),
  getDeployment:id=>req('GET','/deployments/'+encodeURIComponent(id)),
  // The ONLY authorized mutations; never versions/HEAD updates or Sheets API.
  createVersion:description=>req('POST','/versions',{description}),
  createDeployment:(n,description)=>req('POST','/deployments',
   {versionNumber:n,manifestFileName:'appsscript',description})
 };
}
function normalizedVersions(v){
 assert(Array.isArray(v),'versions must be an array');
 const seen=new Set();
 return v.map(x=>{
  assert(x?.scriptId===SID&&Number.isSafeInteger(x.versionNumber)&&
   x.versionNumber>0&&!seen.has(x.versionNumber),'invalid V2 version entry');
  seen.add(x.versionNumber);
  return {scriptId:SID,version:x.versionNumber,
   created:String(x.createTime||''),description:String(x.description||'')};
 }).sort((a,b)=>a.version-b.version);
}
// Google creates exactly one HEAD (development) deployment. The REST
// DeploymentConfig.versionNumber is an integer when versioned; a HEAD
// deployment can omit it or return zero, independent of deploymentId.
function deploymentVersionShape(v){
 if(v===undefined||v===0)return {kind:'HEAD',version:null};
 assert(Number.isSafeInteger(v)&&v>0,'unexpected deployment version shape');
 return {kind:'VERSIONED',version:v};
}
// Safe public CI diagnostic: never log deployment IDs, web URLs or secrets.
function redactedDeploymentShapes(deps){
 assert(Array.isArray(deps),'deployment inventory is not an array');
 return deps.map((d,index)=>{
  const v=d?.deploymentConfig?.versionNumber;
  return {index:index+1,idIsLiteralHEAD:d?.deploymentId==='HEAD',
   versionShape:v===undefined?'omitted':v===0?'zero':
    Number.isSafeInteger(v)&&v>0?'positive_integer':'invalid',
   manifestPresent:typeof d?.deploymentConfig?.manifestFileName==='string',
   webAccess:(Array.isArray(d?.entryPoints)?d.entryPoints:[])
    .filter(e=>e?.webApp).map(e=>({
     access:e.webApp.entryPointConfig?.access??e.webApp.access??'omitted',
     executeAs:e.webApp.entryPointConfig?.executeAs??e.webApp.executeAs??'omitted'
    }))};
 });
}
function normalizedDeployments(d){
 assert(Array.isArray(d),'deployments must be an array');
 const seen=new Set();
 let headCount=0;
 return d.map(x=>{
  const id=x?.deploymentId, config=x?.deploymentConfig;
  assert(typeof id==='string'&&id.length>0&&!seen.has(id),
   'duplicate/missing deployment ID');
  seen.add(id);
  assert(config?.scriptId===SID,'deployment belongs to a foreign Script ID');
  const {kind,version}=deploymentVersionShape(config.versionNumber);
  if(kind==='HEAD'){
   headCount++;
   assert(headCount<=1,'multiple unversioned/HEAD deployments');
  }
  assert(config.manifestFileName==='appsscript' ||
   (kind==='HEAD'&&
    (config.manifestFileName===undefined||config.manifestFileName==='')),
   'deployment manifest file is not appsscript');
  const points=(x.entryPoints||[]).map(e=>({
   type:e.entryPointType||'',
   web:e.webApp?{
    access:e.webApp.entryPointConfig?.access??e.webApp.access??null,
    executeAs:e.webApp.entryPointConfig?.executeAs??e.webApp.executeAs??null,
    url:e.webApp.url||''
   }:null
  }));
  for(const e of points){
   if(e.web){
    // API can omit resolved access metadata; immutable version manifest
    // will be checked separately. Explicit public access is never tolerated.
    assert(e.web.access===null||e.web.access==='MYSELF',
     'existing web app publicly accessible');
    assert(e.web.executeAs===null||e.web.executeAs==='USER_DEPLOYING',
     'unexpected existing web app execution identity');
   }
  }
  return {id,kind,version,manifest:config.manifestFileName||'',
   description:String(config.description||''),updateTime:String(x.updateTime||''),
   points:points.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};
 }).sort((a,b)=>a.id.localeCompare(b.id,'en'));
}
function fingerprint(versions,deps){
 return sha(JSON.stringify({versions:normalizedVersions(versions),
  deployments:normalizedDeployments(deps)}));
}
async function inventory(api){
 const [head,versions,deps]=await Promise.all([
  api.getHead(),api.getVersions(),api.getDeployments()
 ]);
 checkHead(head);
 // Print only enum/presence diagnostics, never deployment IDs, URLs or OAuth.
 report('V2_PRIVATE_DEPLOY_VERSION_SHAPES_JSON='+
  JSON.stringify(redactedDeploymentShapes(deps)));
 const vn=normalizedVersions(versions),dn=normalizedDeployments(deps);
 for(const dep of dn){
  const obj=dep.version===null?head:await api.getVersionContent(dep.version);
  assert(obj?.scriptId===SID,'deployed version contains unexpected Script ID');
  core.closedManifest(obj.files);
  core.closedWebsite(obj.files);
  // Existing deployments may have older code, but cannot be public or accept
  // intake. Do NOT treat unverified old deployment as safe.
 }
 const fp=fingerprint(versions,deps);
 return {head,versions,deps,fp,versionCount:vn.length,
  deploymentCount:dn.length,versionedDeployments:dn.filter(d=>d.version!==null).length};
}
function summarize(s){
 report('V2_PRIVATE_VERSION_NUMBERS='+normalizedVersions(s.versions).map(v=>v.version).join(','));
 report('V2_PRIVATE_DEPLOYMENTS_JSON='+JSON.stringify(normalizedDeployments(s.deps).map(d=>({id:d.id,version:d.version,access:'MYSELF',executeAs:'USER_DEPLOYING'}))));
 report('V2_PRIVATE_HEAD_SHA256='+TARGET);
 report('V2_PRIVATE_HEAD_FILE_COUNT=32');
 report('V2_PRIVATE_VERSION_COUNT='+s.versionCount);
 report('V2_PRIVATE_DEPLOYMENT_COUNT='+s.deploymentCount);
 report('V2_PRIVATE_VERSIONED_DEPLOYMENT_COUNT='+s.versionedDeployments);
 report('V2_PRIVATE_INVENTORY_SHA256='+s.fp);
 report('V2_PRIVATE_MANIFEST_MYSELF=true');
 report('V2_PRIVATE_INTAKE_CLOSED=true');
}
async function audit(api){
 const state=await inventory(api);
 summarize(state);
 report('V2_PRIVATE_AUDIT_NO_MUTATIONS=true');
 return state;
}
async function deploy(api,env,assertMain=latestMain){
 // An actual prior audit with this exact inventory fingerprint is required.
 const before=await inventory(api);
 assert(before.fp===env.EXPECTED_INVENTORY_SHA256,
  'version/deployment inventory differs from prior audited state');
 summarize(before);
 // No mutation if the same workflow previously deployed a V2 private preview:
 // a new deployment would be redundant and could create unwanted endpoints.
 assert(!normalizedDeployments(before.deps).some(x=>
  x.description.startsWith('Study1 V2 PRIVATE MYSELF HEAD '+TARGET)),
  'matching private deployment already exists; use read-only audit');
 const recheck=await inventory(api);
 assert(recheck.fp===before.fp,'deployment/version inventory raced');
 assertMain(env);
 assert(core.digest(recheck.head.files)===TARGET,
  'HEAD changed immediately before version creation');
 const description='Study1 V2 PRIVATE MYSELF HEAD '+TARGET+
  ' GitHub '+env.GITHUB_SHA+' Run '+env.GITHUB_RUN_ID;
 let version;
 try{version=await api.createVersion(description);}
 catch(e){throw Error('V2_PRIVATE_VERSION_POST_UNKNOWN_NO_RETRY: '+e.message);}
 assert(version?.scriptId===SID&&Number.isSafeInteger(version.versionNumber)&&
  version.versionNumber>0,'version create response ambiguous; stop');
 const immutable=await api.getVersionContent(version.versionNumber);
 checkHead(immutable);
 // If anything drifted between creation and deploy, leave the unused
 // immutable version untouched and DO NOT publish an endpoint.
 const preDeploy=await inventory(api);
 assert(core.digest(preDeploy.head.files)===TARGET,'HEAD changed after createVersion');
 assert(JSON.stringify(normalizedDeployments(preDeploy.deps))===
  JSON.stringify(normalizedDeployments(before.deps)),'existing deployments changed');
 assert(preDeploy.versionCount===before.versionCount+1 &&
  normalizedVersions(preDeploy.versions).some(v=>v.version===version.versionNumber),
  'version inventory did not gain exactly one immutable version');
 assertMain(env);
 let created;
 try{created=await api.createDeployment(version.versionNumber,description);}
 catch(e){throw Error('V2_PRIVATE_DEPLOY_POST_UNKNOWN_NO_RETRY: '+e.message);}
 assert(created?.deploymentId&&created?.deploymentConfig?.scriptId===SID&&
  created.deploymentConfig.versionNumber===version.versionNumber,
  'deployment creation response ambiguous; no retry');
 const [got,after]=await Promise.all([
  api.getDeployment(created.deploymentId),inventory(api)
 ]);
 assert(got?.deploymentId===created.deploymentId &&
  got.deploymentConfig?.scriptId===SID &&
  got.deploymentConfig.versionNumber===version.versionNumber,
  'deployed ID/version readback failed');
 // getContent(version) is the immutable security authority for access mode.
 checkHead(await api.getVersionContent(version.versionNumber));
 assert(after.deploymentCount===before.deploymentCount+1,
  'unexpected number of deployments after creation');
 const old=normalizedDeployments(before.deps),now=normalizedDeployments(after.deps);
 assert(JSON.stringify(now.filter(x=>x.id!==created.deploymentId))===
  JSON.stringify(old),'existing deployment changed');
 assert(after.versionCount===before.versionCount+1,'version count drift after deployment');
 const newDep=now.find(x=>x.id===created.deploymentId);
 assert(newDep&&newDep.version===version.versionNumber,'new deployment missing from list');
 assert(!newDep.points.some(x=>x.web?.access&&x.web.access!=='MYSELF'),
  'new deployment has non-private access');
 assert(!newDep.points.some(x=>x.web?.executeAs&&x.web.executeAs!=='USER_DEPLOYING'),
  'new deployment has wrong executeAs');
 report('V2_PRIVATE_DEPLOY_VERIFIED=true');
 report('V2_PRIVATE_VERSION='+version.versionNumber);
 report('V2_PRIVATE_DEPLOY_ID='+created.deploymentId);
 report('V2_PRIVATE_VERSION_SHA256='+TARGET);
 report('V2_PRIVATE_ACCESS=MYSELF');
 report('V2_PRIVATE_EXECUTE_AS=USER_DEPLOYING');
 report('V2_PRIVATE_NO_HEAD_UPDATE=true');
 report('V2_PRIVATE_NO_SHEET_OPERATIONS=true');
 report('V2_PRIVATE_LIVE_INTAKE_ENABLED=false');
 return {id:created.deploymentId,version:version.versionNumber};
}
async function main(){
 const mode=process.argv[2];invocation(process.env,mode);
 latestMain(process.env);reviewedLocal();
 assert(process.env.V2_GAS_CLASPRC_JSON?.length>0,'V2 OAuth secret missing');
 const c=core.credentials(process.env.V2_GAS_CLASPRC_JSON);
 const api=await makeApi(c);
 if(mode==='audit')await audit(api);
 else await deploy(api,process.env);
}
if(require.main===module)main().catch(e=>{
 console.error(String(e.message).replace(/https?:\/\/\S+/g,'[URL]'));
 process.exitCode=1;
});
module.exports={SID,REPO,TARGET,CONFIRM,invocation,reviewedLocal,
 checkHead,makeApi,normalizedVersions,normalizedDeployments,
 deploymentVersionShape,redactedDeploymentShapes,
 fingerprint,inventory,audit,deploy};
