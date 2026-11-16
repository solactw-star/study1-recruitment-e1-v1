'use strict';
// One explicitly authorized read-only anonymous release. Existing V2 API/backup
// helpers only. No function execution, properties, Sheets, Drive or email.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const core=require('./study1-v2-gas-head-only.cjs'),d=require('./study1-v2-private-deploy.cjs');
const {SID,REPO}=core;
const PARENT='17a4da5df8614305736d7e7a8a4169ed794ffa74';
const MESSAGE='release-v2 authorized anonymous closed public entry 2026-11-16';
const OLD=[
 ['73dea801154abbe847863a07df2e623fc1d68622a4442f006d1be7473dd5a0f7','MYSELF'],
 ['b33dd95f092e562ab7948645fcf997e2545b9ad9fefe1e6f9bc4cffd9d4d0da3','MYSELF'],
 ['3449d43bee67d450a1934cd24870b581c487bd84f854511a467e270bccf62158','ANYONE']
];
const assert=(v,m)=>{if(!v)throw Error('V2_ANONYMOUS_BLOCKED: '+m)};
const same=(a,b,m)=>assert(JSON.stringify(a)===JSON.stringify(b),m);
const report=s=>console.log(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function authorize(e,event){
 assert(e.V2_ANONYMOUS_RELEASE==='1'&&e.GITHUB_REPOSITORY===REPO&&e.GITHUB_REF==='refs/heads/main'&&e.GITHUB_EVENT_NAME==='push'&&e.GITHUB_RUN_ATTEMPT==='1','one authorized first main push only');
 assert(/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')&&/^\d+$/.test(e.GITHUB_RUN_ID||''),'exact event identity required');
 const x=event||JSON.parse(fs.readFileSync(e.GITHUB_EVENT_PATH,'utf8'));
 assert(x.before===PARENT&&x.after===e.GITHUB_SHA&&x.head_commit?.id===e.GITHUB_SHA&&x.head_commit?.message===MESSAGE&&x.commits?.length===1&&x.ref===e.GITHUB_REF&&x.repository?.full_name===REPO&&x.forced===false&&x.created===false&&x.deleted===false,'authorization event mismatch');
}
function checkout(e){
 core.latestMain(e);
 const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
 assert(git(['rev-parse','HEAD^'])===PARENT&&git(['rev-parse','HEAD^:gas'])===git(['rev-parse','HEAD:gas']),'reviewed GAS source changed');
 return core.anonymousReadOnlyCandidate();
}
const deps=s=>d.normalizedDeployments(s.deps,true);
const versioned=s=>deps(s).filter(x=>x.kind==='VERSIONED');
const development=s=>deps(s).filter(x=>x.kind==='HEAD');
const versions=s=>d.normalizedVersions(s.versions);
function link(dep,v,access){
 const n=d.normalizedDeployments([dep],true)[0],w=n.points[0]?.web;
 assert(n.version===v&&n.points.length===1&&w?.access===access&&w.executeAs==='USER_DEPLOYING','deployment ACL/version/identity mismatch');
 assert(/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(w.url),'deployment URL invalid');
 return w.url;
}
function baseline(s){
 assert(s.safe&&s.headSha===OLD[2][0]&&s.headProof.access==='ANYONE','original authorized v3 HEAD not verified');
 assert(s.proofs.length===3&&versions(s).length===3&&versioned(s).length===3&&development(s).length===1,'unexpected existing versions/deployments');
 for(let i=0;i<OLD.length;i++){
  const v=i+1,[sha,access]=OLD[i],proof=s.proofs.find(p=>p.version===v);
  assert(proof?.known&&proof.sha===sha&&proof.access===access,'unknown existing immutable version '+v);
  const match=versioned(s).filter(p=>p.version===v);
  assert(match.length===1,'existing deployment not unique');
  const raw=s.deps.find(p=>p.deploymentId===match[0].id);link(raw,v,access);
 }
}
function keep(before,s){
 const olds=versions(before);
 same(versions(s).filter(x=>olds.some(o=>o.version===x.version)),olds,'old version changed');
 same(s.proofs.filter(x=>before.proofs.some(o=>o.version===x.version)),before.proofs,'old immutable contents changed');
 const oldD=versioned(before);
 same(versioned(s).filter(x=>oldD.some(o=>o.id===x.id)),oldD,'existing deployment changed');
 const a=development(before),b=development(s);
 assert(a.length===1&&b.length===1&&a[0].id===b[0].id,'development identity changed');
}
function backupPath(e){assert(e.RUNNER_TEMP,'runner temp missing');return path.join(e.RUNNER_TEMP,'study1-v2-anonymous-prewrite-'+e.GITHUB_RUN_ID+'.json.enc')}
const aad=(e,target)=>[REPO,SID,e.GITHUB_SHA,e.GITHUB_RUN_ID,'ANONYMOUS_CLOSED',target].join('\n');
async function prepare(api,c,e,files){
 const target=core.digest(files),s=await d.inventory(api,true);baseline(s);
 for(const x of versioned(s)){
  same(d.normalizedDeployments([await api.getDeployment(x.id)],true)[0],x,'existing deployment GET/list mismatch');
 }
 const plain=JSON.stringify({head:s.head,versions:s.versions,deps:s.deps,proofs:s.proofs,fp:s.fp,git:e.GITHUB_SHA,target});
 const enc=JSON.stringify(core.seal(plain,c.refresh_token,aad(e,target)));
 assert(core.unseal(JSON.parse(enc),c.refresh_token,aad(e,target))===plain,'backup self-check failed');
 fs.writeFileSync(backupPath(e),enc,{flag:'wx',mode:0o600});
 assert(fs.readFileSync(backupPath(e),'utf8')===enc,'backup readback failed');
 report('V2_ANONYMOUS_BACKUP_ENCRYPTED=true');report('V2_ANONYMOUS_TARGET_SHA256='+target);
}
function restore(c,e,target){
 const b=JSON.parse(core.unseal(JSON.parse(fs.readFileSync(backupPath(e),'utf8')),c.refresh_token,aad(e,target)));
 assert(b.git===e.GITHUB_SHA&&b.target===target&&b.head.scriptId===SID&&d.fingerprint(b.versions,b.deps,core.digest(b.head.files),b.proofs,true)===b.fp,'backup identity/integrity mismatch');
 return b;
}
async function wait(read,validate,pause=sleep){
 for(const ms of [0,2000,4000,8000,16000,30000]){
  if(ms)await pause(ms);const s=await read();if(validate(s))return s;
 }
 throw Error('V2_ANONYMOUS_READBACK_UNKNOWN_NO_REPEAT');
}
function targetHead(s,target){
 assert(s.headSha===target&&s.headProof.known&&s.headProof.access==='ANYONE_ANONYMOUS'&&s.safe,'anonymous HEAD/inventory not verified');
}
async function publish(api,headApi,before,files,check,pause=sleep,read=()=>d.inventory(api,true)){
 const target=core.digest(files);baseline(before);
 core.closedManifest(files,true);assert(core.closedManifest(files,true).webapp.access==='ANYONE_ANONYMOUS','expected anonymous candidate');
 core.closedWebsite(files);core.publicRpcSurface(files);
 check();const pre=await read();baseline(pre);assert(pre.fp===before.fp,'inventory changed after backup');
 await headApi.putContent(files);
 const synced=await wait(read,s=>{
  keep(before,s);same(versions(s),versions(before),'unexpected version during HEAD sync');same(versioned(s),versioned(before),'unexpected deployment during HEAD sync');
  if(s.headSha===before.headSha)return false;
  assert(s.headSha===target,'unexpected HEAD source');
  if(!s.safe)return false;targetHead(s,target);return true;
 },pause);
 report('V2_ANONYMOUS_HEAD_VERIFIED=true');
 check();const current=await read();targetHead(current,target);keep(before,current);
 assert(current.fp===synced.fp,'inventory changed before version');
 const description='Study1 V2 ANONYMOUS READONLY '+target;
 const v=await api.createVersion(description);
 assert(v?.scriptId===SID&&Number.isSafeInteger(v.versionNumber)&&v.versionNumber>0&&!before.proofs.some(p=>p.version===v.versionNumber),'ambiguous version response');
 const afterVersion=await wait(read,s=>{
  targetHead(s,target);keep(before,s);same(versioned(s),versioned(before),'deployment changed during version build');
  if(versions(s).length===versions(before).length)return false;
  assert(versions(s).length===versions(before).length+1&&s.proofs.some(p=>p.version===v.versionNumber&&p.sha===target&&p.known&&p.access==='ANYONE_ANONYMOUS'),'new immutable version mismatch');return true;
 },pause);
 report('V2_ANONYMOUS_VERSION_VERIFIED='+v.versionNumber);
 check();const again=await read();targetHead(again,target);keep(before,again);
 assert(again.fp===afterVersion.fp,'inventory changed before deployment');
 const made=await api.createDeployment(v.versionNumber,description);
 assert(made?.deploymentId&&made.deploymentConfig?.scriptId===SID&&made.deploymentConfig.versionNumber===v.versionNumber,'ambiguous deployment response');
 report('V2_ANONYMOUS_DEPLOY_POST_ACCEPTED=true');
 const final=await wait(read,s=>{
  targetHead(s,target);keep(before,s);same(versions(s),versions(afterVersion),'version changed during deployment');same(s.proofs,afterVersion.proofs,'immutable contents changed during deployment');
  if(versioned(s).length===versioned(before).length)return false;
  assert(versioned(s).length===versioned(before).length+1&&versioned(s).some(p=>p.id===made.deploymentId&&p.version===v.versionNumber),'new deployment mismatch');return true;
 },pause);
 const listed=versioned(final).find(x=>x.id===made.deploymentId);
 let direct;
 for(const ms of [0,2000,4000,8000,16000,30000]){
  if(ms)await pause(ms);try{direct=await api.getDeployment(made.deploymentId);break}catch(e){if(!/HTTP 404/.test(String(e.message)))throw e;}
 }
 assert(direct,'direct deployment readback unknown');
 same(d.normalizedDeployments([direct],true)[0],listed,'new direct GET/list mismatch');
 const url=link(direct,v.versionNumber,'ANYONE_ANONYMOUS');
 report('V2_ANONYMOUS_DEPLOY_VERIFIED=true');report('V2_ANONYMOUS_VERSION='+v.versionNumber);report('V2_ANONYMOUS_URL='+url);
 report('V2_ANONYMOUS_PRIVATE_DEPLOYMENTS_UNCHANGED=true');report('V2_ANONYMOUS_LIVE_INTAKE_ENABLED=false');
 return {version:v.versionNumber,url};
}
async function main(){
 const e=process.env,phase=process.argv[2];
 assert(['prepare','apply','audit'].includes(phase),'invalid phase');
 authorize(e);const files=checkout(e),target=core.digest(files);
 const c=core.credentials(e.V2_GAS_CLASPRC_JSON);
 const api=await d.makeApi(c,undefined,undefined,undefined,phase!=='apply');
 if(phase==='prepare')return prepare(api,c,e,files);
 if(phase==='audit'){const s=await d.audit(api,true);report('V2_ANONYMOUS_RECONCILE_NO_MUTATIONS=true');return s;}
 const saved=restore(c,e,target),before=await d.inventory(api,true);baseline(before);
 assert(before.fp===saved.fp,'baseline changed after backup');
 return publish(api,await core.apiFromCredentials(c),before,files,()=>core.latestMain(e));
}
if(require.main===module)main().catch(e=>{console.error(String(e.message).replace(/https?:\/\/\S+/g,'[URL]'));process.exitCode=1});
module.exports={PARENT,MESSAGE,OLD,authorize,baseline,keep,link,publish};
