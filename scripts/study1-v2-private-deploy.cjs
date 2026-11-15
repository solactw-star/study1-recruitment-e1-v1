'use strict';
/**
 * Study1 E1 V2 private preview: read-only inventory audit first; only a
 * separately confirmed manual phases create ONE V2 immutable version OR
 * ONE MYSELF deployment of an independently audited version. No GAS HEAD write, Sheet access or function run.
 * Do not import the legacy GAS deployment clients (bound to original Script ID).
 */
const core=require('./study1-v2-gas-head-only.cjs');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const SID=core.SID,REPO=core.REPO;
const HISTORICAL_TARGET='73dea801154abbe847863a07df2e623fc1d68622a4442f006d1be7473dd5a0f7';
const TARGET=core.PRIVATE_TARGET;
const VERSION_CONFIRM='I_AUTHORIZE_STUDY1_V2_PRIVATE_E1_VERSION';
const CONFIRM='I_AUTHORIZE_STUDY1_V2_PRIVATE_MYSELF_DEPLOY';
const assert=(ok,message)=>{if(!ok)throw Error('V2_PRIVATE_BLOCKED: '+message)};
const report=message=>{if(process.env.V2_PRIVATE_TEST_MODE!=='true')console.log(message);};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');

function invocation(env,mode){
 assert(['audit','version','deploy'].includes(mode),'unknown mode');
 assert(env.GITHUB_REPOSITORY===REPO && env.GITHUB_REF==='refs/heads/main' &&
  env.GITHUB_EVENT_NAME==='workflow_dispatch','V2 manual main workflow only');
 assert(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'') &&
  env.REVIEWED_SHA===env.GITHUB_SHA,'exact reviewed GitHub HEAD required');
 assert(env.PRIVATE_MODE===mode,'manual mode mismatch');
 assert(env.REVIEWED_TARGET_SHA256===TARGET,'exact reviewed private E1 candidate SHA required');
 if(mode!=='audit'){
  assert(env.CONFIRMATION===(mode==='version'?VERSION_CONFIRM:CONFIRM),'independent private '+mode+' approval missing');
  assert(/^[a-f0-9]{64}$/.test(env.EXPECTED_INVENTORY_SHA256||''),
   'verified inventory fingerprint from separate read-only audit required');
 }
 if(mode==='deploy')assert(/^[1-9][0-9]*$/.test(String(env.PRIVATE_VERSION||''))&&Number.isSafeInteger(Number(env.PRIVATE_VERSION)),
  'explicit immutable version number required');
}
function latestMain(env){
 const shaLocal=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const shaRemote=execFileSync('git',['ls-remote','origin','refs/heads/main'],
  {encoding:'utf8',timeout:20000}).trim().split(/\s+/)[0];
 assert(shaLocal===env.GITHUB_SHA&&shaRemote===shaLocal,'V2 main moved since review');
}
function reviewedLocal(){
 const files=core.releaseFiles({SOURCE_PROFILE:'private_e1_management',REVIEWED_TARGET_SHA256:TARGET});
 assert(files.length===core.APPROVED.length&&core.digest(files)===TARGET,'reviewed private E1 source SHA mismatch');
 assert(core.closedManifest(files).webapp.access==='MYSELF','private manifest required');
 core.closedWebsite(files);
 return files;
}
function checkHead(head){
 assert(head?.scriptId===SID,'remote Script ID mismatch');
 assert(Array.isArray(head.files)&&head.files.length===core.APPROVED.length,'V2 HEAD missing reviewed source inventory');
 assert(core.digest(head.files)===TARGET,'V2 HEAD diverged from verified source SHA');
 assert(core.closedManifest(head.files).webapp.access==='MYSELF','private manifest required');
 core.closedWebsite(head.files);
 return {sha:TARGET,files:core.APPROVED.length};
}
function sourceProof(obj){
 assert(obj?.scriptId===SID,'remote Script ID mismatch');
 const remote=core.verifyRemote(obj);
 let access='UNKNOWN',known=false;
 try{
  const manifest=core.closedManifest(obj.files);core.closedWebsite(obj.files);
  access=manifest.webapp.access;
  known=(access==='MYSELF'&&(remote.sha===TARGET||remote.sha===HISTORICAL_TARGET))||
   (access==='ANYONE'&&remote.sha===core.digest(core.localSources()));
 }catch(_){}
 return {sha:remote.sha,count:remote.count,access,known};
}
// Only GET is idempotent/read-only here. Bounded HTTP 503 / 429 retries are
// safe; never retry POST, HTTP 401/403, malformed JSON or network exceptions.
// Google recommends 1s minimum for 503 and 30s for 429 quota responses.
const GET_RETRY_MAX_ATTEMPTS=3;
function retryDelayMs(status,attempt,jitter){
 assert((status===429||status===503)&&attempt>=1&&
  attempt<GET_RETRY_MAX_ATTEMPTS,'invalid GET retry request');
 const base=status===429?30000:1000;
 return base*(2**(attempt-1))+Math.floor(Math.max(0,Math.min(0.999999,jitter))*250);
}
function safeApiRoute(sub){
 // Never print query strings, page tokens, opaque deployment IDs or OAuth.
 if(/^\/deployments\/[^/?]+$/.test(sub))return '/deployments/:id';
 const route=sub.split('?')[0];
 return ['/content','/versions','/deployments'].includes(route)?route:'[V2_API_ROUTE]';
}
async function makeApi(c,fetcher=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),random=Math.random){
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
  const route=safeApiRoute(sub);
  // Single attempt for POST even if its response is ambiguous or HTTP 503.
  const maxAttempts=method==='GET'?GET_RETRY_MAX_ATTEMPTS:1;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   const response=await fetcher(base+sub,{method,headers:{
    Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
   if(response.ok)return response.json();
   const status=response.status;
   if(method==='GET'&&(status===429||status===503)&&attempt<maxAttempts){
    const ms=retryDelayMs(status,attempt,random());
    report('V2_PRIVATE_GET_RETRY_HTTP_STATUS='+status+
     ' route='+route+' attempt='+attempt+'/'+maxAttempts+' delay_ms='+ms);
    await sleep(ms);
    continue;
   }
   // All errors fail closed. Do not print Google error bodies or credentials.
   assert(false,method+' V2 Apps Script API '+route+' HTTP '+status+
    ' after '+attempt+' attempt(s); no mutation inferred');
  }
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
    assert(e.web.access===null||['MYSELF','ANYONE'].includes(e.web.access),
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
function fingerprint(versions,deps,headSha='',proofs=[]){
 return sha(JSON.stringify({versions:normalizedVersions(versions),
  deployments:normalizedDeployments(deps),headSha,proofs}));
}
async function inventory(api){
 const [head,versions,deps]=await Promise.all([api.getHead(),api.getVersions(),api.getDeployments()]);
 const hp=sourceProof(head),vn=normalizedVersions(versions),dn=normalizedDeployments(deps);
 assert(vn.length<=100,'version inventory too large for complete verification');
 const proofs=[];
 for(const v of vn)proofs.push({version:v.version,...sourceProof(await api.getVersionContent(v.version))});
 let safe=hp.known;
 for(const dep of dn){
  const proof=dep.version===null?hp:proofs.find(x=>x.version===dep.version);
  assert(proof,'deployment version missing from complete inventory');
  if(!proof.known||dep.points.some(x=>x.web&&x.web.access&&x.web.access!==proof.access))safe=false;
 }
 const fp=fingerprint(versions,deps,hp.sha,proofs);
 const stable=sha(JSON.stringify({versions:vn,deployments:dn.filter(x=>x.kind==='VERSIONED'),proofs}));
 return {head,versions,deps,fp,stable,headSha:hp.sha,headProof:hp,proofs,safe,
  versionCount:vn.length,deploymentCount:dn.length,versionedDeployments:dn.filter(d=>d.version!==null).length};
}
function requirePrivateHeadBaseline(s){
 const development=normalizedDeployments(s.deps).filter(x=>x.kind==='HEAD');
 assert(s.safe&&s.headProof.known&&s.headProof.access==='MYSELF','private HEAD baseline or existing deployment unverified');
 assert(development.length===1&&development[0].points.some(x=>x.web?.access==='MYSELF'&&x.web.executeAs==='USER_DEPLOYING'),
  'development deployment must be explicitly verified MYSELF');
}
function summarize(s){
 report('V2_PRIVATE_VERSION_NUMBERS='+normalizedVersions(s.versions).map(v=>v.version).join(','));
 report('V2_PRIVATE_DEPLOYMENTS_JSON='+JSON.stringify(normalizedDeployments(s.deps).map(d=>({version:d.version,
  access:(d.version===null?s.headProof:s.proofs.find(p=>p.version===d.version))?.access||'UNKNOWN'}))));
 report('V2_PRIVATE_HEAD_SHA256='+s.headSha);
 report('V2_PRIVATE_HEAD_FILE_COUNT='+s.headProof.count);
 report('V2_PRIVATE_HEAD_ACCESS='+s.headProof.access);
 report('V2_PRIVATE_HEAD_MATCHES_REVIEWED_TARGET='+(s.headSha===TARGET));
 report('V2_PRIVATE_REVIEWED_TARGET_SHA256='+TARGET);
 report('V2_PRIVATE_VERSION_PROOFS_JSON='+JSON.stringify(s.proofs));
 report('V2_PRIVATE_VERSION_COUNT='+s.versionCount);
 report('V2_PRIVATE_DEPLOYMENT_COUNT='+s.deploymentCount);
 report('V2_PRIVATE_VERSIONED_DEPLOYMENT_COUNT='+s.versionedDeployments);
 report('V2_PRIVATE_INVENTORY_SHA256='+s.fp);
 report('V2_PRIVATE_INVENTORY_KNOWN_SAFE='+s.safe);
}
async function audit(api){
 const state=await inventory(api);
 summarize(state);
 report('V2_PRIVATE_AUDIT_NO_MUTATIONS=true');
 return state;
}
// Google API GET lists can briefly lag behind a successful POST. Read back
// on a bounded schedule; NEVER repeat the POST or silently assume success.
const READBACK_DELAYS_MS=[0,1000,2000,4000,8000];
async function settleVersionInventory(api,before,number,createdNew,
 sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 const oldVersions=normalizedVersions(before.versions);
 const oldDeps=normalizedDeployments(before.deps);
 const count=oldVersions.length+(createdNew?1:0);
 for(let i=0;i<READBACK_DELAYS_MS.length;i++){
  if(i)await sleep(READBACK_DELAYS_MS[i]);
  const state=await inventory(api);
  checkHead(state.head);assert(state.safe,'unverified deployment inventory during version readback');
  const versions=normalizedVersions(state.versions);
  assert(JSON.stringify(normalizedDeployments(state.deps))===JSON.stringify(oldDeps),
   'deployment inventory changed during version readback');
  if(versions.length===count&&versions.some(v=>v.version===number)){
   assert(JSON.stringify(versions.filter(v=>!createdNew||v.version!==number))===JSON.stringify(oldVersions),'previous immutable version inventory changed');
   return state;
  }
  assert(createdNew&&JSON.stringify(versions)===JSON.stringify(oldVersions),
   'version inventory changed unexpectedly during readback');
 }
 throw Error('V2_PRIVATE_BLOCKED: immutable version not visible after bounded GET readback; use new audit');
}
async function settleDeploymentInventory(api,before,newId,
 sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 const oldDeps=normalizedDeployments(before.deps);
 for(let i=0;i<READBACK_DELAYS_MS.length;i++){
  if(i)await sleep(READBACK_DELAYS_MS[i]);
  const state=await inventory(api);
  checkHead(state.head);assert(state.safe,'unverified deployment inventory during deployment readback');
  assert(JSON.stringify(normalizedVersions(state.versions))===JSON.stringify(normalizedVersions(before.versions))&&JSON.stringify(state.proofs)===JSON.stringify(before.proofs),'immutable version inventory changed');
  const now=normalizedDeployments(state.deps);
  if(now.length===oldDeps.length+1&&now.some(d=>d.id===newId))
   return state;
  assert(JSON.stringify(now)===JSON.stringify(oldDeps),
   'deployment inventory changed unexpectedly during readback');
 }
 throw Error('V2_PRIVATE_BLOCKED: new deployment not visible after bounded GET readback; use new audit');
}

async function reviewedMutation(api,env,mode,assertMain){
 invocation(env,mode);
 const before=await inventory(api);
 assert(before.fp===env.EXPECTED_INVENTORY_SHA256,'version/deployment inventory differs from prior audited state');
 checkHead(before.head);assert(before.safe,'unverified existing deployment inventory');
 const again=await inventory(api);
 assert(again.fp===before.fp,'deployment/version inventory raced');
 assertMain(env);
 return again;
}
function targetVersions(s){return s.proofs.filter(v=>v.sha===TARGET&&v.known&&v.access==='MYSELF');}
function targetDeployed(s){const nums=new Set(targetVersions(s).map(v=>v.version));
 return normalizedDeployments(s.deps).some(d=>d.version!==null&&nums.has(d.version));
}
async function createImmutableVersion(api,env,assertMain=latestMain,sleep){
 const before=await reviewedMutation(api,env,'version',assertMain);
 assert(!targetDeployed(before),'matching private deployment already exists; use read-only audit');
 const matches=targetVersions(before);
 assert(matches.length<=1,'multiple matching orphan versions; manual review required');
 if(matches.length){
  const number=matches[0].version,v=normalizedVersions(before.versions).find(x=>x.version===number);
  assert(new RegExp('^Study1 V2 PRIVATE MYSELF HEAD '+TARGET+' GitHub [a-f0-9]{40} Run [0-9]+$').test(v.description),
   'matching orphan provenance not verified');
  checkHead(await api.getVersionContent(number));
  report('V2_PRIVATE_REUSED_VERIFIED_ORPHAN_VERSION=true');
  report('V2_PRIVATE_VERSION='+number);
  return {version:number,createdNew:false};
 }
 const description='Study1 V2 PRIVATE MYSELF HEAD '+TARGET+' GitHub '+env.GITHUB_SHA+' Run '+env.GITHUB_RUN_ID;
 let v;
 try{v=await api.createVersion(description);}
 catch(e){throw Error('V2_PRIVATE_VERSION_POST_UNKNOWN_NO_RETRY: '+e.message);}
 assert(v?.scriptId===SID&&Number.isSafeInteger(v.versionNumber)&&v.versionNumber>0,'version create response ambiguous; stop');
 checkHead(await api.getVersionContent(v.versionNumber));
 const after=await settleVersionInventory(api,before,v.versionNumber,true,sleep);
 assert(after.proofs.some(x=>x.version===v.versionNumber&&x.sha===TARGET),'immutable version readback mismatch');
 report('V2_PRIVATE_VERSION_VERIFIED=true');
 report('V2_PRIVATE_VERSION='+v.versionNumber);
 report('V2_PRIVATE_VERSION_SHA256='+TARGET);
 report('V2_PRIVATE_DEPLOYMENT_MUTATIONS=0');
 return {version:v.versionNumber,createdNew:true};
}
async function deploy(api,env,assertMain=latestMain,sleep){
 const before=await reviewedMutation(api,env,'deploy',assertMain);
 assert(!targetDeployed(before),'matching private deployment already exists; use read-only audit');
 const number=Number(env.PRIVATE_VERSION);
 const matches=targetVersions(before);
 assert(matches.length===1&&matches[0].version===number,'specified immutable candidate version not uniquely verified');
 checkHead(await api.getVersionContent(number));
 const recheck=await inventory(api);
 assert(recheck.fp===before.fp,'deployment/version inventory raced before POST');
 assertMain(env);
 const description='Study1 V2 PRIVATE MYSELF HEAD '+TARGET+' GitHub '+env.GITHUB_SHA+' Run '+env.GITHUB_RUN_ID;
 let created;
 try{created=await api.createDeployment(number,description);}
 catch(e){throw Error('V2_PRIVATE_DEPLOY_POST_UNKNOWN_NO_RETRY: '+e.message);}
 assert(created?.deploymentId&&created?.deploymentConfig?.scriptId===SID&&
  created.deploymentConfig.versionNumber===number,'deployment creation response ambiguous; no retry');
 const got=await api.getDeployment(created.deploymentId);
 const after=await settleDeploymentInventory(api,before,created.deploymentId,sleep);
 assert(got?.deploymentId===created.deploymentId&&got.deploymentConfig?.scriptId===SID&&
  got.deploymentConfig.versionNumber===number,'deployed ID/version readback failed');
 checkHead(await api.getVersionContent(number));
 const old=normalizedDeployments(before.deps),now=normalizedDeployments(after.deps);
 assert(after.deploymentCount===before.deploymentCount+1&&JSON.stringify(now.filter(x=>x.id!==created.deploymentId))===JSON.stringify(old),'existing deployment changed');
 assert(after.versionCount===before.versionCount,'version count drift after deployment');
 const newDep=now.find(x=>x.id===created.deploymentId),direct=normalizedDeployments([got])[0];
 assert(newDep&&newDep.version===number&&JSON.stringify(newDep)===JSON.stringify(direct),'new deployment GET/list mismatch');
 assert(newDep.points.some(x=>x.web?.access==='MYSELF'&&x.web.executeAs==='USER_DEPLOYING'),'new deployment explicit private ACL not verified');
 report('V2_PRIVATE_DEPLOY_VERIFIED=true');
 report('V2_PRIVATE_VERSION='+number);
 report('V2_PRIVATE_VERSION_SHA256='+TARGET);
 report('V2_PRIVATE_ACCESS=MYSELF');
 report('V2_PRIVATE_EXECUTE_AS=USER_DEPLOYING');
 report('V2_PRIVATE_NO_HEAD_UPDATE=true');
 report('V2_PRIVATE_LIVE_INTAKE_ENABLED=false');
 return {id:created.deploymentId,version:number};
}
async function main(){
 const mode=process.argv[2];invocation(process.env,mode);
 latestMain(process.env);reviewedLocal();
 assert(process.env.V2_GAS_CLASPRC_JSON?.length>0,'V2 OAuth secret missing');
 const c=core.credentials(process.env.V2_GAS_CLASPRC_JSON);
 const api=await makeApi(c);
 if(mode==='audit')await audit(api);
 else if(mode==='version')await createImmutableVersion(api,process.env);
 else await deploy(api,process.env);
}
if(require.main===module)main().catch(e=>{
 console.error(String(e.message).replace(/https?:\/\/\S+/g,'[URL]'));
 process.exitCode=1;
});
module.exports={SID,REPO,TARGET,HISTORICAL_TARGET,VERSION_CONFIRM,CONFIRM,invocation,reviewedLocal,sourceProof,requirePrivateHeadBaseline,createImmutableVersion,
 checkHead,makeApi,retryDelayMs,safeApiRoute,GET_RETRY_MAX_ATTEMPTS,
 normalizedVersions,normalizedDeployments,
 deploymentVersionShape,redactedDeploymentShapes,
 fingerprint,inventory,audit,deploy,settleVersionInventory,settleDeploymentInventory};
