'use strict';
/**
 * Study1 E1 V2 private preview: read-only inventory audit first; only a
 * separately confirmed manual phases create ONE V2 immutable version OR
 * ONE MYSELF deployment of an independently audited version. No GAS HEAD write, Sheet access or function run.
 * Do not import the legacy GAS deployment clients (bound to original Script ID).
 */
const core=require('./study1-v2-gas-head-only.cjs');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const SID=core.SID,REPO=core.REPO;
const HISTORICAL_TARGET='73dea801154abbe847863a07df2e623fc1d68622a4442f006d1be7473dd5a0f7';
const TARGET=core.PRIVATE_TARGET;
// Verified historical version 2, read back from release Run 43706978095.
const VERIFIED_VERSION2_SHA='b33dd95f092e562ab7948645fcf997e2545b9ad9fefe1e6f9bc4cffd9d4d0da3';
// One authorized execution only, bound to the reviewed parent and push event.
const RELEASE_PARENT='e6020f1b4d9e51c669409c8ddd4fadc69db34c66';
const RELEASE_MESSAGE='release-v2 authorized one-time private E1 OWNER launch 2026-11-15';
const RELEASE_TARGET='b33dd95f092e562ab7948645fcf997e2545b9ad9fefe1e6f9bc4cffd9d4d0da3';
const RELEASE_BASE_FP='4d85ca4609ccab451221012b454957d80d605603602cb283addff8d0e6846d2e';
// Consumed only by the authorized single deployment continuation; no HEAD or version mutation.
const RESUME_PARENT='4f500f4b923d76db58a7194f42162f9e85e1ca22';
const RESUME_MESSAGE='release-v2 authorized resume private version 2 deployment 2026-11-15';
const RESUME_FP='6cab520e1d8250d11094f62088ee4f1743bcb5e06b974bd88d01f0e7001511a1';
const RESUME_VERSION=2;
const VERSION_CONFIRM='I_AUTHORIZE_STUDY1_V2_PRIVATE_E1_VERSION';
const CONFIRM='I_AUTHORIZE_STUDY1_V2_PRIVATE_MYSELF_DEPLOY';
const assert=(ok,message)=>{if(!ok)throw Error('V2_PRIVATE_BLOCKED: '+message)};
const report=message=>{if(process.env.V2_PRIVATE_TEST_MODE!=='true')console.log(message);};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');

function invocation(env,mode){
 assert(['audit','version','deploy'].includes(mode),'unknown mode');
 if(env.V2_ONCE_RELEASE==='1'){
  oneShotInvocation(env);
  if(env.V2_RESUME_DEPLOY==='1')assert(mode==='deploy'&&env.PRIVATE_VERSION===String(RESUME_VERSION),'resume authorizes only existing version 2 deployment');
  else assert(mode==='version'||mode==='deploy','one-time authorization only for these mutation stages');
 }else assert(env.GITHUB_REPOSITORY===REPO && env.GITHUB_REF==='refs/heads/main' &&
  env.GITHUB_EVENT_NAME==='workflow_dispatch','V2 manual main workflow only');
 assert(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'') &&
  env.REVIEWED_SHA===env.GITHUB_SHA,'exact reviewed GitHub HEAD required');
 assert(env.PRIVATE_MODE===mode,'manual mode mismatch');
 assert(env.REVIEWED_TARGET_SHA256===TARGET,'exact reviewed private E1 candidate SHA required');
 if(mode!=='audit'){
  assert(env.GITHUB_RUN_ATTEMPT==='1','mutation reruns forbidden; use new read-only audit and independent dispatch');
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
  known=(access==='MYSELF'&&([TARGET,HISTORICAL_TARGET,VERIFIED_VERSION2_SHA].includes(remote.sha)))||
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
async function makeApi(c,fetcher=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),random=Math.random,readOnly=false){
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
  assert(!readOnly||method==='GET','read-only inventory cannot mutate GAS');
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
   description:String(config.description||''), // raw updateTime is preserved in the encrypted backup, not the semantic digest
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
   assert(JSON.stringify(state.proofs.filter(v=>!createdNew||v.version!==number))===JSON.stringify(before.proofs),'previous immutable version content changed');
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
 if(env.V2_RESUME_DEPLOY==='1'){
  requirePrivateHeadBaseline(before);
  assert(before.proofs.some(p=>p.version===RESUME_VERSION&&p.sha===VERIFIED_VERSION2_SHA&&p.known&&p.access==='MYSELF'),'resume version 2 content not verified');
  assert(!targetDeployed(before),'matching private deployment already exists; read-only reconciliation only');
 }
 // A new invocation reaches this gate after the independently persisted backup.
 // This full fresh inventory is already compared with the exact reviewed snapshot.
 assertMain(env);
 return before;
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
 // reviewedMutation just verified the full immutable source and deployment inventory,
 // including the version specified here. No duplicate content/list GET before POST.
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
// Save all current HEAD bytes plus version/deployment metadata and full
// immutable source proofs. The existing immutable versions are not modified.
// Store only authenticated ciphertext off-runner; bind it to exact operation.
function releaseBackupPath(env){
 assert(env.RUNNER_TEMP&&/^[0-9]+$/.test(env.GITHUB_RUN_ID||''),'release backup run identity missing');
 return path.join(env.RUNNER_TEMP,'study1-v2-private-prewrite-'+env.GITHUB_RUN_ID+(env.V2_ONCE_RELEASE==='1'?'-'+env.PRIVATE_MODE:'')+'.json.enc');
}
function releaseBackupAad(env){
 return [REPO,SID,env.GITHUB_SHA,env.GITHUB_RUN_ID,env.PRIVATE_MODE,
  env.PRIVATE_VERSION||'',env.REVIEWED_TARGET_SHA256,env.EXPECTED_INVENTORY_SHA256].join('\n');
}
async function prepareReleaseBackup(api,c,env,assertMain=latestMain){
 const mode=env.PRIVATE_MODE;assert(['version','deploy'].includes(mode),'backup must precede a specific mutation phase');
 const s=await reviewedMutation(api,env,mode,assertMain);
 const plain=JSON.stringify({scriptId:SID,githubSha:env.GITHUB_SHA,mode,
  head:{scriptId:SID,files:s.head.files.map(({name,type,source})=>({name,type,source}))},
  versions:s.versions,deps:s.deps,proofs:s.proofs,fp:s.fp});
 const aad=releaseBackupAad(env),enc=JSON.stringify(core.seal(plain,c.refresh_token,aad));
 assert(core.unseal(JSON.parse(enc),c.refresh_token,aad)===plain,'release backup encryption self-check failed');
 const p=releaseBackupPath(env);fs.writeFileSync(p,enc,{flag:'wx',mode:0o600});
 assert(fs.readFileSync(p,'utf8')===enc,'release backup local readback failed');
 report('V2_PRIVATE_PREWRITE_BACKUP_SHA256='+sha(enc));
 report('V2_PRIVATE_PREWRITE_BACKUP_ENCRYPTED=true');
 return {fp:s.fp,sha:sha(enc)};
}
function verifyReleaseBackup(c,env){
 const enc=fs.readFileSync(releaseBackupPath(env),'utf8');
 const copy=JSON.parse(core.unseal(JSON.parse(enc),c.refresh_token,releaseBackupAad(env)));
 assert(copy.scriptId===SID&&copy.githubSha===env.GITHUB_SHA&&copy.mode===env.PRIVATE_MODE,
  'release backup does not match reviewed operation');
 checkHead(copy.head);
 assert(copy.fp===env.EXPECTED_INVENTORY_SHA256&&fingerprint(copy.versions,copy.deps,core.digest(copy.head.files),copy.proofs)===copy.fp,
  'release backup inventory fingerprint mismatch');
 return copy.fp;
}

function autoAuditInvocation(env){
 assert(env.GITHUB_REPOSITORY===REPO&&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_EVENT_NAME==='push',
  'automatic audit restricted to trusted V2 main push');
 assert(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''),'exact checkout SHA required');
 assert(!env.CONFIRMATION&&!env.PRIVATE_VERSION&&!env.EXPECTED_INVENTORY_SHA256,
  'automatic audit cannot accept mutation inputs');
}
async function automaticAudit(env,assertMain=latestMain,apiFactory=makeApi){
 autoAuditInvocation(env);assertMain(env);reviewedLocal();
 assert(env.V2_GAS_CLASPRC_JSON?.length>0,'V2 OAuth secret missing');
 const c=core.credentials(env.V2_GAS_CLASPRC_JSON);
 const api=await apiFactory(c,undefined,undefined,undefined,true);
 const state=await audit(api);
 // Read-only recovery after Run 43708421687 returned a deployment response
 // but immediate direct GET was 404. Never issue another POST from audit.
 const matches=normalizedDeployments(state.deps).filter(d=>d.version===RESUME_VERSION);
 if(matches.length===1&&state.proofs.some(p=>p.version===RESUME_VERSION&&p.sha===VERIFIED_VERSION2_SHA&&p.known&&p.access==='MYSELF')){
  const listed=matches[0];
  const direct=normalizedDeployments([await api.getDeployment(listed.id)])[0];
  assert(JSON.stringify(direct)===JSON.stringify(listed),'version 2 direct deployment differs from list');
  assert(direct.points.some(p=>p.web?.access==='MYSELF'&&p.web.executeAs==='USER_DEPLOYING'),'version 2 private deployment ACL not verified');
  report('V2_VERSION2_DIRECT_READBACK_VERIFIED=true');
  // The owner-only URL is returned to the authorized operator separately.
  const url=direct.points.find(p=>p.web?.access==='MYSELF'&&p.web.executeAs==='USER_DEPLOYING')?.web?.url;
  if(url&&/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)&&env.GITHUB_STEP_SUMMARY&&process.env.V2_PRIVATE_TEST_MODE!=='true')
   fs.appendFileSync(env.GITHUB_STEP_SUMMARY,'Verified OWNER-only version 2 web app: '+url+'\n');
 }else report('V2_VERSION2_DIRECT_READBACK_VERIFIED=false');
 return state;
}
function oneShotInvocation(env,event){
 assert(env.V2_ONCE_RELEASE==='1'&&env.GITHUB_REPOSITORY===REPO&&env.GITHUB_REF==='refs/heads/main'&&
  env.GITHUB_EVENT_NAME==='push'&&env.GITHUB_RUN_ATTEMPT==='1','one-time release requires trusted main push and first attempt');
 const e=event||JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
 const resume=env.V2_RESUME_DEPLOY==='1';
 assert(e.before===(resume?RESUME_PARENT:RELEASE_PARENT)&&e.after===env.GITHUB_SHA&&e.ref==='refs/heads/main'&&
  e.head_commit?.id===env.GITHUB_SHA&&e.head_commit?.message===(resume?RESUME_MESSAGE:RELEASE_MESSAGE)&&
  e.forced===false&&e.deleted===false&&e.created===false&&e.commits?.length===1&&
  e.repository?.full_name===REPO,'one-time release authorization event mismatch');
 assert(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')&&/^[0-9]+$/.test(env.GITHUB_RUN_ID||'')&&
  TARGET===RELEASE_TARGET,'one-time reviewed source identity mismatch');
}
const ONCE_PHASES=['head-prepare','head-apply','version-prepare','version-apply','deploy-prepare','deploy-apply'];
function oncePath(env,phase){
 assert(env.RUNNER_TEMP&&ONCE_PHASES.includes(phase),'invalid release phase path');
 return path.join(env.RUNNER_TEMP,'study1-v2-once-'+env.GITHUB_RUN_ID+'-'+phase+'.json');
}
function writeOnceStage(env,phase,data){
 fs.writeFileSync(oncePath(env,phase),JSON.stringify({sha:env.GITHUB_SHA,run:env.GITHUB_RUN_ID,phase,...data}),{flag:'wx',mode:0o600});
}
function readOnceStage(env,phase){
 const data=JSON.parse(fs.readFileSync(oncePath(env,phase),'utf8'));
 assert(data.sha===env.GITHUB_SHA&&data.run===env.GITHUB_RUN_ID&&data.phase===phase,'one-time release stage identity mismatch');
 return data;
}
function onceEnv(env,mode,s,version){
 return {...env,REVIEWED_SHA:env.GITHUB_SHA,REVIEWED_TARGET_SHA256:TARGET,PRIVATE_MODE:mode,
  PRIVATE_VERSION:version?String(version):'',EXPECTED_INVENTORY_SHA256:s.fp,
  SOURCE_PROFILE:'private_e1_management',EXPECTED_REMOTE_SHA256:s.headSha,
  CONFIRMATION:mode==='version'?VERSION_CONFIRM:mode==='deploy'?CONFIRM:core.PRIVATE_CONFIRM,SYNC_MODE:'apply'};
}
async function oneShotPhase(phase,env,c,api,headApi,assertMain=latestMain){
 oneShotInvocation(env);assertMain(env);
 assert(env.V2_RESUME_DEPLOY!=='1','resume cannot invoke original multi-stage release');
 assert(ONCE_PHASES.includes(phase),'unknown one-time phase');
 assert(!fs.existsSync(oncePath(env,phase)),'one-time phase already recorded; no rerun');
 const files=reviewedLocal();
 const now=await inventory(api);
 requirePrivateHeadBaseline(now);
 if(phase==='head-prepare'){
  assert(now.fp===RELEASE_BASE_FP&&now.headSha===HISTORICAL_TARGET,'remote baseline differs from specifically reviewed audit');
  assert(!targetVersions(now).length,'candidate already has a version; stop for reconciliation');
  const e=onceEnv(env,'head',now);
  await core.prepare(headApi,files,c,e);
  writeOnceStage(env,phase,{fp:now.fp,headSha:now.headSha,stable:now.stable});
  report('V2_ONCE_HEAD_PREPARED=true');return;
 }
 if(phase==='head-apply'){
  const prev=readOnceStage(env,'head-prepare');
  assert(now.fp===prev.fp&&now.headSha===HISTORICAL_TARGET&&now.fp===RELEASE_BASE_FP,'remote changed after initial backup');
  const e=onceEnv(env,'head',now);
  await core.apply(headApi,files,c,e,async()=>{
   const pre=await inventory(api);requirePrivateHeadBaseline(pre);
   assert(pre.fp===prev.fp,'HEAD prewrite inventory raced');
   assertMain(env);
  },async()=>{
   const after=await inventory(api);requirePrivateHeadBaseline(after);checkHead(after.head);
   assert(after.stable===prev.stable,'immutable inventory changed during HEAD sync');
  });
  const after=await inventory(api);requirePrivateHeadBaseline(after);checkHead(after.head);
  assert(after.stable===prev.stable,'immutable inventory changed after HEAD sync');
  writeOnceStage(env,phase,{fp:after.fp,headSha:after.headSha,stable:after.stable});
  report('V2_ONCE_HEAD_VERIFIED=true');return;
 }
 checkHead(now.head);
 if(phase==='version-prepare'){
  const prev=readOnceStage(env,'head-apply');
  assert(now.fp===prev.fp&&now.stable===prev.stable,'remote changed after HEAD verification');
  assert(!targetVersions(now).length,'unexpected candidate version exists; no new mutation');
  const e=onceEnv(env,'version',now);
  await prepareReleaseBackup(api,c,e,assertMain);
  writeOnceStage(env,phase,{fp:now.fp,headSha:now.headSha,stable:now.stable});
  return;
 }
 if(phase==='version-apply'){
  const prev=readOnceStage(env,'version-prepare');
  assert(now.fp===prev.fp&&now.stable===prev.stable,'remote changed after version backup');
  const e=onceEnv(env,'version',now);
  verifyReleaseBackup(c,e);
  const v=await createImmutableVersion(api,e,assertMain);
  assert(v.createdNew,'unexpected orphan reuse in initial one-time release');
  const after=await settleVersionInventory(api,now,v.version,true);
  requirePrivateHeadBaseline(after);
  writeOnceStage(env,phase,{fp:after.fp,headSha:after.headSha,stable:after.stable,version:v.version});
  report('V2_ONCE_VERSION_VERIFIED='+v.version);return;
 }
 if(phase==='deploy-prepare'){
  const prev=readOnceStage(env,'version-apply');
  assert(now.fp===prev.fp&&now.stable===prev.stable,'remote changed after version verification');
  const e=onceEnv(env,'deploy',now,prev.version);
  await prepareReleaseBackup(api,c,e,assertMain);
  writeOnceStage(env,phase,{fp:now.fp,headSha:now.headSha,stable:now.stable,version:prev.version});
  return;
 }
 const prev=readOnceStage(env,'deploy-prepare');
 assert(now.fp===prev.fp&&now.stable===prev.stable,'remote changed after deployment backup');
 const e=onceEnv(env,'deploy',now,prev.version);
 verifyReleaseBackup(c,e);
 const v=await deploy(api,e,assertMain);
 const after=await settleDeploymentInventory(api,now,v.id);
 requirePrivateHeadBaseline(after);
 const newDep=normalizedDeployments(after.deps).find(d=>d.id===v.id);
 assert(newDep&&newDep.version===prev.version&&newDep.points.some(p=>p.web?.access==='MYSELF'&&p.web.executeAs==='USER_DEPLOYING'),'final private deployment proof missing');
 assert(JSON.stringify(normalizedDeployments(after.deps).filter(d=>d.id!==v.id))===JSON.stringify(normalizedDeployments(now.deps)),'existing deployments changed after release');
 assert(after.proofs.some(x=>x.version===prev.version&&x.sha===TARGET&&x.access==='MYSELF'),'final immutable source proof missing');
 writeOnceStage(env,phase,{fp:after.fp,headSha:after.headSha,stable:after.stable,version:v.version});
 summarize(after);
 report('V2_ONCE_RELEASE_VERIFIED=true');report('V2_ONCE_RELEASE_VERSION='+v.version);
 report('V2_ONCE_RELEASE_GAS_TARGET_SHA256='+TARGET);
 report('V2_ONCE_RELEASE_NO_FORMAL_DATA_OR_INTAKE=true');
}
async function oneShotMain(phase,env){
 oneShotInvocation(env);latestMain(env);
 assert(env.V2_GAS_CLASPRC_JSON?.length>0,'V2 OAuth secret missing');
 const c=core.credentials(env.V2_GAS_CLASPRC_JSON);
 const api=await makeApi(c,undefined,undefined,undefined,!['version-apply','deploy-apply'].includes(phase));
 const headApi=['head-prepare','head-apply'].includes(phase)?await core.apiFromCredentials(c):null;
 await oneShotPhase(phase,env,c,api,headApi);
}

function resumeEnv(env){
 assert(env.V2_RESUME_DEPLOY==='1','explicit continuation selection required');
 oneShotInvocation(env);
 assert(TARGET===VERIFIED_VERSION2_SHA,'authorized version 2 differs from current reviewed candidate');
 return onceEnv(env,'deploy',{fp:RESUME_FP,headSha:TARGET},RESUME_VERSION);
}
async function resumeMain(phase,env){
 assert(['resume-prepare','resume-deploy'].includes(phase),'resume only permits deployment backup or deployment');
 const e=resumeEnv(env);latestMain(e);reviewedLocal();
 const c=core.credentials(e.V2_GAS_CLASPRC_JSON);
 const api=await makeApi(c,undefined,undefined,undefined,phase==='resume-prepare');
 if(phase==='resume-prepare')return prepareReleaseBackup(api,c,e);
 verifyReleaseBackup(c,e);
 // No HEAD write or version creation client is called by this continuation.
 const v=await deploy(api,e);
 report('V2_RESUME_DEPLOY_VERIFIED=true');
 report('V2_RESUME_DEPLOY_VERSION='+v.version);
 report('V2_RESUME_NO_HEAD_OR_VERSION_MUTATIONS=true');
}

async function main(){
 const phase=process.argv[2];
 if(phase?.startsWith('resume-')){await resumeMain(phase,process.env);return;}
 if(phase?.startsWith('once-')){await oneShotMain(phase.slice(5),process.env);return;}
 if(phase==='auto-audit'){await automaticAudit(process.env);return;}
 const mode=phase==='prepare'?process.env.PRIVATE_MODE:phase;
 invocation(process.env,mode);
 if(phase==='prepare')assert(mode!=='audit','audit has no write-preparation step');
 latestMain(process.env);reviewedLocal();
 assert(process.env.V2_GAS_CLASPRC_JSON?.length>0,'V2 OAuth secret missing');
 const c=core.credentials(process.env.V2_GAS_CLASPRC_JSON);
 const api=await makeApi(c,undefined,undefined,undefined,mode==='audit'||phase==='prepare');
 if(mode==='audit')await audit(api);
 else if(phase==='prepare')await prepareReleaseBackup(api,c,process.env);
 else{
  verifyReleaseBackup(c,process.env);
  if(mode==='version')await createImmutableVersion(api,process.env);
  else await deploy(api,process.env);
 }
}
if(require.main===module)main().catch(e=>{
 console.error(String(e.message).replace(/https?:\/\/\S+/g,'[URL]'));
 process.exitCode=1;
});
module.exports={RESUME_PARENT,RESUME_MESSAGE,RESUME_VERSION,RESUME_FP,resumeEnv,RELEASE_PARENT,RELEASE_MESSAGE,RELEASE_TARGET,RELEASE_BASE_FP,oneShotInvocation,oneShotPhase,onceEnv,autoAuditInvocation,automaticAudit,releaseBackupPath,releaseBackupAad,prepareReleaseBackup,verifyReleaseBackup,SID,REPO,TARGET,HISTORICAL_TARGET,VERSION_CONFIRM,CONFIRM,invocation,reviewedLocal,sourceProof,requirePrivateHeadBaseline,createImmutableVersion,
 checkHead,makeApi,retryDelayMs,safeApiRoute,GET_RETRY_MAX_ATTEMPTS,
 normalizedVersions,normalizedDeployments,
 deploymentVersionShape,redactedDeploymentShapes,
 fingerprint,inventory,audit,deploy,settleVersionInventory,settleDeploymentInventory};
