'use strict';
// One authorized public read-only release; reuse the existing V2 API, source,
// encryption and inventory helpers. No production data operations.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const core=require('./study1-v2-gas-head-only.cjs'),d=require('./study1-v2-private-deploy.cjs');
const {SID,REPO}=core;
const PARENT='e1b75093d98a56c00f4c941da234703179736a5f',MESSAGE='release-v2 authorized public login-only browse correction 2026-11-15';
const RESUME_PARENT='b2e63c0109cb90c21bb0df04c76dcb78f09ae2ad',RESUME_MESSAGE='release-v2 authorized public version 3 deployment resume 2026-11-15';
const RESUME_TARGET='3449d43bee67d450a1934cd24870b581c487bd84f854511a467e270bccf62158',RESUME_VERSION=3,ORIGINAL_RUN='43711280217';
const BASE_FP='f36f8a5ce9d1658fc7d7cb5370438253d773e3f1d91c344de01ecdded2aed658';
const assert=(v,m)=>{if(!v)throw Error('V2_PUBLIC_RELEASE_BLOCKED: '+m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report=s=>console.log(s);
function authorize(e,event){
 assert(e.V2_PUBLIC_RELEASE==='1'&&e.GITHUB_REPOSITORY===REPO&&e.GITHUB_REF==='refs/heads/main'&&e.GITHUB_EVENT_NAME==='push'&&e.GITHUB_RUN_ATTEMPT==='1','authorized first main event only');
 assert(/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')&&/^\d+$/.test(e.GITHUB_RUN_ID||''),'exact run identity required');
 const x=event||JSON.parse(fs.readFileSync(e.GITHUB_EVENT_PATH,'utf8'));
 const resume=e.V2_PUBLIC_RESUME==='1';
 assert(x.before===(resume?RESUME_PARENT:PARENT)&&x.after===e.GITHUB_SHA&&x.ref===e.GITHUB_REF&&x.head_commit?.id===e.GITHUB_SHA&&x.head_commit?.message===(resume?RESUME_MESSAGE:MESSAGE)&&x.commits?.length===1&&x.repository?.full_name===REPO&&x.forced===false&&x.created===false&&x.deleted===false,'authorization event mismatch');
}
function verifyCheckout(e,parent=PARENT){
 core.latestMain(e);
 const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
 assert(git(['rev-parse','HEAD^'])===parent&&git(['rev-parse','HEAD^:gas'])===git(['rev-parse','HEAD:gas']),'public source differs from reviewed parent');
 const files=core.localSources();
 assert(core.closedManifest(files).webapp.access==='ANYONE','login-only public manifest required');
 core.closedWebsite(files);core.publicRpcSurface(files);
 return files;
}
function verifiedPublic(s,target){
 assert(s.headProof.known&&s.headProof.access==='ANYONE'&&s.headSha===target&&s.safe,'public HEAD or remote inventory not verified');
}
function versioned(s){return d.normalizedDeployments(s.deps).filter(x=>x.kind==='VERSIONED')}
function development(s){return d.normalizedDeployments(s.deps).filter(x=>x.kind==='HEAD')}
function same(a,b,msg){assert(JSON.stringify(a)===JSON.stringify(b),msg)}
function keepOld(before,after){
 assert(after.safe,'unverified inventory');
 const old=d.normalizedVersions(before.versions);
 same(d.normalizedVersions(after.versions).filter(v=>old.some(o=>o.version===v.version)),old,'existing version metadata changed');
 same(after.proofs.filter(v=>before.proofs.some(o=>o.version===v.version)),before.proofs,'existing immutable source changed');
 same(versioned(after).filter(v=>versioned(before).some(o=>o.id===v.id)),versioned(before),'existing private deployment changed');
 const a=development(before),b=development(after);
 assert(a.length===1&&b.length===1&&a[0].id===b[0].id&&b[0].points.some(p=>p.web&&['MYSELF','ANYONE'].includes(p.web.access)&&p.web.executeAs==='USER_DEPLOYING'),'development endpoint identity changed');
}
function backupPath(e){assert(e.RUNNER_TEMP,'runner temp missing');return path.join(e.RUNNER_TEMP,'study1-v2-public-prewrite-'+e.GITHUB_RUN_ID+'.json.enc')}
function aad(e,target){return [REPO,SID,e.GITHUB_SHA,e.GITHUB_RUN_ID,'PUBLIC_READONLY',target,BASE_FP].join('\n')}
async function prepare(api,c,e,files){
 const target=core.digest(files),s=await d.inventory(api);
 d.requirePrivateHeadBaseline(s);
 assert(s.fp===BASE_FP,'remote baseline differs from reviewed private inventory');
 assert(s.proofs.length===2&&s.proofs.every(p=>p.known&&p.access==='MYSELF')&&versioned(s).length===2,'original private versions/deployments not verified');
 const plain=JSON.stringify({head:s.head,versions:s.versions,deps:s.deps,proofs:s.proofs,fp:s.fp,git:e.GITHUB_SHA,target});
 const enc=JSON.stringify(core.seal(plain,c.refresh_token,aad(e,target)));
 assert(core.unseal(JSON.parse(enc),c.refresh_token,aad(e,target))===plain,'backup self-check failed');
 fs.writeFileSync(backupPath(e),enc,{flag:'wx',mode:0o600});
 assert(fs.readFileSync(backupPath(e),'utf8')===enc,'backup readback failed');
 report('V2_PUBLIC_BACKUP_ENCRYPTED=true');report('V2_PUBLIC_TARGET_SHA256='+target);
}
function restoreBackup(c,e,target){
 const b=JSON.parse(core.unseal(JSON.parse(fs.readFileSync(backupPath(e),'utf8')),c.refresh_token,aad(e,target)));
 assert(b.git===e.GITHUB_SHA&&b.target===target&&b.fp===BASE_FP&&b.head.scriptId===SID&&d.fingerprint(b.versions,b.deps,core.digest(b.head.files),b.proofs)===BASE_FP,'backup baseline mismatch');
 return b;
}
async function waitFor(api,validate,pause=sleep){
 for(const ms of [0,2000,4000,8000,16000,30000]){
  if(ms)await pause(ms);
  const s=await d.inventory(api);
  if(validate(s))return s;
 }
 throw Error('V2_PUBLIC_READBACK_UNKNOWN_NO_REPEAT');
}
function publicLink(dep,number){
 const n=d.normalizedDeployments([dep])[0];
 assert(n.version===number&&n.points.length===1,'unexpected published entry points');
 const w=n.points[0].web;
 assert(w&&w.access==='ANYONE'&&w.executeAs==='USER_DEPLOYING','public login-only ACL not verified');
 assert(/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(w.url),'public web app URL not verified');
 return w.url;
}
async function readPublic(api,s,target,pause=sleep){
 const nums=s.proofs.filter(p=>p.known&&p.sha===target&&p.access==='ANYONE').map(p=>p.version);
 const matches=versioned(s).filter(x=>nums.includes(x.version));
 if(!matches.length)return null;
 assert(matches.length===1,'multiple matching public deployments');
 const dep=matches[0];
 for(const ms of [0,2000,4000,8000,16000,30000]){
  if(ms)await pause(ms);
  let got;
  try{got=await api.getDeployment(dep.id)}catch(e){if(/HTTP 404/.test(String(e.message)))continue;throw e}
  same(d.normalizedDeployments([got])[0],dep,'public direct GET/list mismatch');
  const url=publicLink(got,dep.version);
  return {version:dep.version,url};
 }
 throw Error('V2_PUBLIC_DIRECT_READBACK_UNKNOWN_NO_REPEAT');
}
async function release(api,headApi,c,e,files,check=()=>core.latestMain(e),pause=sleep){
 const target=core.digest(files),saved=restoreBackup(c,e,target);
 const before=await d.inventory(api);
 d.requirePrivateHeadBaseline(before);
 assert(before.fp===saved.fp,'remote baseline changed after backup');
 check();
 // Use the exact same reviewed V2 source API. Never repeat a PUT or POST.
 await headApi.putContent(files);
 const synced=await waitFor(api,s=>{
  if(s.headSha!==target){assert(s.fp===before.fp,'unexpected HEAD state');return false}
  verifiedPublic(s,target);keepOld(before,s);
  same(d.normalizedVersions(s.versions),d.normalizedVersions(before.versions),'version changed during HEAD sync');
  same(versioned(s),versioned(before),'deployment changed during HEAD sync');return true;
 },pause);
 report('V2_PUBLIC_HEAD_VERIFIED=true');
 const description='Study1 V2 PUBLIC ANYONE READONLY '+target+' GitHub '+e.GITHUB_SHA+' Run '+e.GITHUB_RUN_ID;
 check();
 assert(core.digest((await headApi.getContent()).files)===target,'HEAD changed before version');
 const v=await api.createVersion(description);
 assert(v?.scriptId===SID&&Number.isSafeInteger(v.versionNumber)&&v.versionNumber>0&&!before.proofs.some(p=>p.version===v.versionNumber),'version response ambiguous');
 const versionedState=await waitFor(api,s=>{
  verifiedPublic(s,target);keepOld(before,s);
  same(versioned(s),versioned(before),'deployment changed during version create');
  if(s.versionCount===before.versionCount)return false;
  assert(s.versionCount===before.versionCount+1&&s.proofs.some(p=>p.version===v.versionNumber&&p.sha===target&&p.known&&p.access==='ANYONE'),'new version mismatch');
  return true;
 },pause);
 report('V2_PUBLIC_VERSION_VERIFIED='+v.versionNumber);
 check();
 // Compare latest inventory once more before new deployment.
 const pre=await d.inventory(api);
 assert(pre.fp===versionedState.fp,'inventory changed before deployment');
 const made=await api.createDeployment(v.versionNumber,description);
 assert(made?.deploymentId&&made.deploymentConfig?.scriptId===SID&&made.deploymentConfig.versionNumber===v.versionNumber,'deployment response ambiguous');
 report('V2_PUBLIC_DEPLOY_POST_ACCEPTED=true');
 const final=await waitFor(api,s=>{
  verifiedPublic(s,target);keepOld(before,s);
  same(s.proofs,versionedState.proofs,'immutable source changed during deploy');
  same(d.normalizedVersions(s.versions),d.normalizedVersions(versionedState.versions),'version changed during deploy');
  if(s.deploymentCount===before.deploymentCount)return false;
  assert(s.deploymentCount===before.deploymentCount+1&&versioned(s).some(x=>x.id===made.deploymentId&&x.version===v.versionNumber),'new deployment identity mismatch');return true;
 },pause);
 const result=await readPublic(api,final,target,pause);
 assert(result&&result.version===v.versionNumber,'public readback missing');
 report('V2_PUBLIC_DEPLOY_VERIFIED=true');report('V2_PUBLIC_VERSION='+result.version);report('V2_PUBLIC_URL='+result.url);
 report('V2_PUBLIC_ACCESS=ANYONE');report('V2_PUBLIC_EXECUTE_AS=USER_DEPLOYING');report('V2_PUBLIC_PRIVATE_DEPLOYMENTS_UNCHANGED=true');report('V2_PUBLIC_LIVE_INTAKE_ENABLED=false');
 return result;
}
// Original run proved HEAD and version 3; deployment POST was not reached.
// Preserve that run's exact encrypted inventory, and never repeat HEAD/version.
function originalBaseline(c,e){
 return restoreBackup(c,{...e,GITHUB_SHA:RESUME_PARENT,GITHUB_RUN_ID:ORIGINAL_RUN},RESUME_TARGET);
}
function resumeStateValid(original,s,target){
 verifiedPublic(s,target);keepOld(original,s);
 same(versioned(s),versioned(original),'unexpected existing deployment before resume');
 if(s.versionCount===original.proofs.length)return false;
 assert(s.versionCount===original.proofs.length+1&&s.proofs.some(p=>p.version===RESUME_VERSION&&p.sha===target&&p.known&&p.access==='ANYONE'),'existing public version 3 not uniquely verified');
 return true;
}
async function resumePrepare(api,c,e,files){
 const target=core.digest(files);assert(target===RESUME_TARGET,'resume source differs from authorized public version');
 const original=originalBaseline(c,e);
 const s=await waitFor(api,state=>resumeStateValid(original,state,target));
 const plain=JSON.stringify({head:s.head,versions:s.versions,deps:s.deps,proofs:s.proofs,fp:s.fp,git:e.GITHUB_SHA,target});
 const enc=JSON.stringify(core.seal(plain,c.refresh_token,aad(e,target)));
 assert(core.unseal(JSON.parse(enc),c.refresh_token,aad(e,target))===plain,'resume backup self-check failed');
 fs.writeFileSync(backupPath(e),enc,{flag:'wx',mode:0o600});
 assert(fs.readFileSync(backupPath(e),'utf8')===enc,'resume backup readback failed');
 report('V2_PUBLIC_RESUME_BACKUP_ENCRYPTED=true');
 report('V2_PUBLIC_RESUME_EXISTING_VERSION='+RESUME_VERSION);
}
async function resumeDeploy(api,c,e,files,pause=sleep){
 const target=core.digest(files);assert(target===RESUME_TARGET,'resume source differs from authorized public version');
 const original=originalBaseline(c,e);
 const saved=JSON.parse(core.unseal(JSON.parse(fs.readFileSync(backupPath(e),'utf8')),c.refresh_token,aad(e,target)));
 assert(saved.git===e.GITHUB_SHA&&saved.target===target&&saved.head.scriptId===SID&&d.fingerprint(saved.versions,saved.deps,core.digest(saved.head.files),saved.proofs)===saved.fp,'resume backup inventory mismatch');
 const before=await waitFor(api,s=>{
  if(!resumeStateValid(original,s,target))return false;
  keepOld(saved,s);
  same(s.proofs,saved.proofs,'immutable version source changed after backup');
  same(d.normalizedVersions(s.versions),d.normalizedVersions(saved.versions),'version inventory changed after backup');
  same(versioned(s),versioned(saved),'deployment inventory changed after backup');return true;
 },pause);
 core.latestMain(e);
 const made=await api.createDeployment(RESUME_VERSION,'Study1 V2 PUBLIC ANYONE READONLY '+target+' GitHub '+e.GITHUB_SHA+' Run '+e.GITHUB_RUN_ID);
 assert(made?.deploymentId&&made.deploymentConfig?.scriptId===SID&&made.deploymentConfig.versionNumber===RESUME_VERSION,'deployment response ambiguous');
 report('V2_PUBLIC_DEPLOY_POST_ACCEPTED=true');
 const final=await waitFor(api,s=>{
  verifiedPublic(s,target);keepOld(original,s);keepOld(before,s);
  same(s.proofs,before.proofs,'immutable version source changed during resume');
  same(d.normalizedVersions(s.versions),d.normalizedVersions(before.versions),'version inventory changed during resume');
  if(s.deploymentCount===before.deploymentCount)return false;
  assert(s.deploymentCount===before.deploymentCount+1&&versioned(s).some(x=>x.id===made.deploymentId&&x.version===RESUME_VERSION),'new public deployment identity mismatch');return true;
 },pause);
 const result=await readPublic(api,final,target,pause);
 assert(result&&result.version===RESUME_VERSION,'public readback missing');
 report('V2_PUBLIC_DEPLOY_VERIFIED=true');report('V2_PUBLIC_VERSION='+result.version);report('V2_PUBLIC_URL='+result.url);
 report('V2_PUBLIC_ACCESS=ANYONE');report('V2_PUBLIC_EXECUTE_AS=USER_DEPLOYING');
 report('V2_PUBLIC_PRIVATE_DEPLOYMENTS_UNCHANGED=true');report('V2_PUBLIC_NO_HEAD_OR_VERSION_MUTATIONS=true');report('V2_PUBLIC_LIVE_INTAKE_ENABLED=false');
 return result;
}

async function main(){
 const phase=process.argv[2],e=process.env;
 const resume=e.V2_PUBLIC_RESUME==='1';
 assert((resume?['resume-prepare','resume-apply','audit']:['prepare','apply','audit']).includes(phase),'unknown or unauthorized phase');
 if(phase!=='audit')authorize(e);
 else d.autoAuditInvocation(e);
 const files=verifyCheckout(e,resume?RESUME_PARENT:PARENT),target=core.digest(files);
 const c=core.credentials(e.V2_GAS_CLASPRC_JSON);
 const api=await d.makeApi(c,undefined,undefined,undefined,!['apply','resume-apply'].includes(phase));
 if(phase==='resume-prepare')return resumePrepare(api,c,e,files);
 if(phase==='resume-apply')return resumeDeploy(api,c,e,files);
 if(phase==='prepare')return prepare(api,c,e,files);
 if(phase==='apply')return release(api,await core.apiFromCredentials(c),c,e,files);
 const s=await d.audit(api);
 if(s.headSha===target){
  verifiedPublic(s,target);
  const result=await readPublic(api,s,target);
  if(result){report('V2_PUBLIC_DEPLOY_VERIFIED=true');report('V2_PUBLIC_VERSION='+result.version);report('V2_PUBLIC_URL='+result.url);}
 }
}
if(require.main===module)main().catch(e=>{console.error(String(e.message).replace(/https?:\/\/\S+/g,'[URL]'));process.exitCode=1;});
module.exports={PARENT,MESSAGE,BASE_FP,RESUME_PARENT,RESUME_MESSAGE,RESUME_VERSION,RESUME_TARGET,authorize,publicLink,keepOld,readPublic,resumeStateValid};
