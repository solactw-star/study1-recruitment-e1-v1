'use strict';
/** Study 1 V2: manual, HEAD content only. No versions, deployments, Sheets or live intake. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');

const {REPO,SID,APPROVED,fail,require_,sha,fileData,canonical,digest,readDevelopmentSources,requireReviewedInventory,localSources,closedManifest,closedWebsite,publicRpcSurface,anonymousReadOnlyCandidate,privateOwnerReadOnlyCandidate,privateOwnerManagementCandidate,verifyRemote,reviewedPrivateTarget}=require('./study1-v2-release-source.cjs');
const CONFIRM = 'I_AUTHORIZE_STUDY1_V2_HEAD_ONLY';
const PRIVATE_CONFIRM = 'I_AUTHORIZE_STUDY1_V2_PRIVATE_E1_HEAD_ONLY';
// reviewedPrivateTarget() is derived from the shared source layer, never from an old deployment hash.
function releaseProfile(env){const profile=env.SOURCE_PROFILE||'public_readonly';
 require_(['public_readonly','private_e1_management'].includes(profile),'invalid V2 source profile');
 return profile;
}
function releaseFiles(env,base=localSources()){
 const profile=releaseProfile(env);
 requireReviewedInventory(base);
 closedManifest(base);closedWebsite(base);
 const files=profile==='private_e1_management'?privateOwnerManagementCandidate(base):base;
 require_(profile!=='private_e1_management'||digest(files)===reviewedPrivateTarget(),
  'reviewed private E1 management SHA mismatch');
 require_(!env.REVIEWED_TARGET_SHA256||env.REVIEWED_TARGET_SHA256===digest(files),'reviewed target SHA mismatch');
 return files;
}
function invocation(env,mode){
 require_(mode==='audit'||mode==='prepare'||mode==='apply','invalid sync phase');
 require_(env.GITHUB_REPOSITORY===REPO && env.GITHUB_REF==='refs/heads/main' &&
  env.GITHUB_EVENT_NAME==='workflow_dispatch' && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'') &&
  env.GITHUB_SHA===env.REVIEWED_SHA,'manual, main, exact SHA and V2 repository required');
 if(mode!=='audit'){
  require_(env.GITHUB_RUN_ATTEMPT==='1','mutation reruns forbidden; use new read-only audit and independent dispatch');
  require_(env.SYNC_MODE==='apply' && env.CONFIRMATION===(releaseProfile(env)==='private_e1_management'?PRIVATE_CONFIRM:CONFIRM),
   'explicit V2 apply confirmation required');
  require_(/^[a-f0-9]{64}$/.test(env.EXPECTED_REMOTE_SHA256||''),
   'verified remote SHA from a preceding audit required');
 }
 if(mode==='audit')require_(env.SYNC_MODE==='audit','audit selection required');
 if(releaseProfile(env)==='private_e1_management'){
  require_(env.REVIEWED_TARGET_SHA256===reviewedPrivateTarget(),'exact private E1 management target SHA required');
  if(mode!=='audit')require_(/^[a-f0-9]{64}$/.test(env.EXPECTED_INVENTORY_SHA256||''),'private HEAD apply requires prior full inventory audit');
 }
}
function latestMain(env){
 const local=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const remote=execFileSync('git',['ls-remote','origin','refs/heads/main'],{encoding:'utf8',timeout:20000}).trim().split(/\s+/)[0];
 require_(local===env.GITHUB_SHA&&remote===env.GITHUB_SHA,'main changed after dispatch');
}
function credentials(raw){
 let j;try{j=JSON.parse(raw);}catch{fail('V2 OAuth secret is not valid JSON');}
 const c=j.tokens?.default || (j.token&&j.oauth2ClientSettings?{
  ...j.token,client_id:j.oauth2ClientSettings.clientId,client_secret:j.oauth2ClientSettings.clientSecret}:null);
 require_(c && typeof c.refresh_token==='string' && c.refresh_token.length>15 &&
  typeof c.client_id==='string' && c.client_id.length>5 &&
  typeof c.client_secret==='string' && c.client_secret.length>5,
  'V2 OAuth secret lacks refresh_token/client_id/client_secret');
 return c;
}
async function apiFromCredentials(c,fetcher=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),random=Math.random){
 const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:c.refresh_token,
  client_id:c.client_id,client_secret:c.client_secret});
 const auth=await fetcher('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,
  signal:AbortSignal.timeout(20000)});
 require_(auth.ok,'V2 OAuth refresh rejected HTTP '+auth.status);
 const token=(await auth.json()).access_token;
 require_(typeof token==='string'&&token.length>15,'OAuth access token unavailable');
 const endpoint='https://script.googleapis.com/v1/projects/'+encodeURIComponent(SID)+'/content';
 async function request(method,files){
  // Apply the same bounded read-only transport policy as the existing
  // inventory API. A transient GET failure must not cause a successful
  // HEAD write to be misclassified before its full readback.
  const {GET_RETRY_MAX_ATTEMPTS,retryDelayMs}=require('./study1-v2-private-deploy.cjs');
  const max=method==='GET'?GET_RETRY_MAX_ATTEMPTS:1;
  for(let attempt=1;attempt<=max;attempt++){
   const response=await fetcher(endpoint,{method,
    headers:{Authorization:'Bearer '+token,...(files?{'Content-Type':'application/json'}:{})},
    body:files?JSON.stringify({files:fileData(files)}):undefined,
    signal:AbortSignal.timeout(30000)});
   if(response.ok)return response.json();
   const status=response.status;
   if(method==='GET'&&(status===429||status===503)&&attempt<max){
    const ms=retryDelayMs(status,attempt,random());
    console.log('V2_HEAD_GET_RETRY_HTTP_STATUS='+status+' attempt='+attempt+'/'+max+' delay_ms='+ms);
    await sleep(ms);continue;
   }
   fail('V2 GAS HEAD '+method+' failed HTTP '+status+' after '+attempt+' attempt(s) (no further retry)');
  }
 }
 return {getContent:()=>request('GET'),putContent:files=>request('PUT',files)};
}
function seal(bytes,refreshToken,aad){
 const salt=crypto.randomBytes(32),iv=crypto.randomBytes(12);
 const key=crypto.hkdfSync('sha256',Buffer.from(refreshToken),salt,Buffer.from('study1-v2-head-only-backup'),32);
 const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from(aad));
 const encrypted=Buffer.concat([cipher.update(Buffer.from(bytes)),cipher.final()]);
 return {format:'study1-v2-gas-prewrite-aes256gcm-v1',salt:salt.toString('base64'),
  iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),
  ciphertext:encrypted.toString('base64'),plaintext_sha256:sha(bytes)};
}
function unseal(envelope,refreshToken,aad){
 require_(envelope?.format==='study1-v2-gas-prewrite-aes256gcm-v1','bad backup format');
 const salt=Buffer.from(envelope.salt,'base64'),iv=Buffer.from(envelope.iv,'base64');
 const key=crypto.hkdfSync('sha256',Buffer.from(refreshToken),salt,Buffer.from('study1-v2-head-only-backup'),32);
 const dec=crypto.createDecipheriv('aes-256-gcm',key,iv);
 dec.setAAD(Buffer.from(aad));dec.setAuthTag(Buffer.from(envelope.tag,'base64'));
 const plain=Buffer.concat([dec.update(Buffer.from(envelope.ciphertext,'base64')),dec.final()]).toString('utf8');
 require_(sha(plain)===envelope.plaintext_sha256,'backup plaintext SHA mismatch');
 return plain;
}
function runnerPaths(env){
 require_(env.RUNNER_TEMP && env.GITHUB_RUN_ID && /^\d+$/.test(env.GITHUB_RUN_ID),
  'runner temp or GitHub run ID missing');
 return {backup:path.join(env.RUNNER_TEMP,'study1-v2-prewrite-'+env.GITHUB_RUN_ID+'.json.enc'),
  state:path.join(env.RUNNER_TEMP,'study1-v2-head-state-'+env.GITHUB_RUN_ID+'.json')};
}
function aad(env){return [REPO,SID,env.GITHUB_SHA,env.GITHUB_RUN_ID].join('\n');}
async function audit(api,files){
 // Inspection has no target-mode precondition. Both the currently known
 // anonymous/public/private history and the separately reviewed target are
 // evidence, not permission for a transition. Use the existing inventory
 // implementation; do not create a second snapshot or loosen a write gate.
 const d=require('./study1-v2-private-deploy.cjs');
 const target={sha:digest(files),count:files.length,access:closedManifest(files).webapp.access};
 const state=await d.audit(api,true);
 const remote=verifyRemote(state.head);
 const access=state.headProof.access;
 console.log('V2_AUDIT_REMOTE_SHA256='+remote.sha);
 console.log('V2_AUDIT_REMOTE_FILE_COUNT='+remote.count);
 console.log('V2_AUDIT_REVIEWED_SHA256='+target.sha);
 console.log('V2_AUDIT_REVIEWED_FILE_COUNT='+target.count);
 console.log('V2_AUDIT_BASELINE_ACCESS='+access);
 console.log('V2_AUDIT_TARGET_ACCESS='+target.access);
 console.log('V2_AUDIT_MODE_DIFFERS='+(access!==target.access));
 console.log('V2_AUDIT_INVENTORY_SHA256='+state.fp);
 console.log('V2_AUDIT_BASELINE_KNOWN_SAFE='+state.safe);
 console.log('V2_AUDIT_WRITE_AUTHORIZED=false');
 console.log('V2_AUDIT_NO_REMOTE_WRITES=true');
 return {...remote,baselineAccess:access,targetAccess:target.access,
  targetSha:target.sha,inventorySha:state.fp,baselineKnownSafe:state.safe,
  modeDiffers:access!==target.access,writeAuthorized:false};
}
async function prepare(api,files,c,env,allowAlreadySynced=false){
 const head=await api.getContent(),before=verifyRemote(head),target=digest(files);
 require_(before.sha===env.EXPECTED_REMOTE_SHA256,'remote SHA differs from manually reviewed audit');
 const alreadySynced=target===before.sha;
 // Only an ordinary, currently authorized HEAD-only invocation may finish
 // without a write. Historical one-shot release callers keep their previous
 // exact baseline requirements. This does not authorize a mode transition.
 require_(!alreadySynced||allowAlreadySynced===true,'GAS HEAD already equals reviewed local source (no unnecessary write)');
 const bytes=JSON.stringify({scriptId:SID,githubSha:env.GITHUB_SHA,head:{scriptId:head.scriptId,files:fileData(head.files)}},null,2);
 const enc=seal(bytes,c.refresh_token,aad(env));
 require_(unseal(enc,c.refresh_token,aad(env))===bytes,'backup encryption/decryption self-check failed');
 const p=runnerPaths(env);
 fs.writeFileSync(p.backup,JSON.stringify(enc),{mode:0o600,flag:'wx'});
 fs.writeFileSync(p.state,JSON.stringify({scriptId:SID,githubSha:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,
  before:before.sha,target,profile:releaseProfile(env),inventory:env.EXPECTED_INVENTORY_SHA256||'',backupSha:sha(JSON.stringify(enc)),backup:p.backup}),{mode:0o600,flag:'wx'});
 require_(sha(fs.readFileSync(p.backup,'utf8'))===sha(JSON.stringify(enc)),
  'encrypted backup local readback failed');
 const after=verifyRemote(await api.getContent());
 require_(after.sha===before.sha,'remote HEAD changed while preparing backup');
 console.log('V2_PREWRITE_BACKUP_ENCRYPTED=true');
 console.log('V2_PREWRITE_BASE_SHA256='+before.sha);
 console.log('V2_PREWRITE_TARGET_SHA256='+target);
 console.log('V2_PREWRITE_BACKUP_SHA256='+sha(JSON.stringify(enc)));
 if(alreadySynced)console.log('V2_PREWRITE_HEAD_ALREADY_MATCHES=true');
 return {before:before.sha,target};
}
async function apply(api,files,c,env,beforePut=async()=>{},afterPut=async()=>{},allowAlreadySynced=false){
 const p=runnerPaths(env);
 const s=JSON.parse(fs.readFileSync(p.state,'utf8'));
 require_(s.scriptId===SID && s.githubSha===env.GITHUB_SHA && s.runId===env.GITHUB_RUN_ID &&
  s.before===env.EXPECTED_REMOTE_SHA256 && s.target===digest(files) && s.backup===p.backup &&
  s.profile===releaseProfile(env)&&s.inventory===(env.EXPECTED_INVENTORY_SHA256||''),
  'wrong or stale prewrite state');
 const encrypted=fs.readFileSync(p.backup,'utf8');
 require_(sha(encrypted)===s.backupSha,'encrypted backup changed after upload');
 const copy=JSON.parse(unseal(JSON.parse(encrypted),c.refresh_token,aad(env)));
 require_(copy.scriptId===SID && copy.githubSha===env.GITHUB_SHA &&
  verifyRemote(copy.head).sha===s.before,'prewrite backup does not match remote baseline');
 const current=verifyRemote(await api.getContent());
 require_(current.sha===s.before,'remote HEAD modified after encrypted backup');
 await beforePut();
 if(s.before===s.target){
  require_(allowAlreadySynced===true,'GAS HEAD already matches; no mutation authorized for this phase');
  // The same authorization, encrypted backup, source binding, main and
  // inventory guards still run. An already-complete stage performs no PUT,
  // does not report a write, and grants no version or deployment authority.
  const unchanged=verifyRemote(await api.getContent());
  require_(unchanged.sha===s.target&&unchanged.count===files.length,'already-synced HEAD changed during phase');
  await afterPut();
  console.log('V2_HEAD_ONLY_ALREADY_SYNCED=true');
  console.log('V2_HEAD_SHA256='+unchanged.sha);
  console.log('V2_HEAD_FILE_COUNT='+unchanged.count);
  console.log('V2_HEAD_PUT_COUNT=0');
  console.log('V2_DEPLOYMENT_MUTATIONS=0');
  return {...unchanged,alreadySynced:true,mutationPerformed:false};
 }
 // No atomic CAS in the Google Apps Script API. Never retry/rollback an ambiguous PUT.
 try{
  await api.putContent(files);
  const after=verifyRemote(await api.getContent());
  require_(after.sha===s.target && after.count===files.length,'full remote HEAD readback mismatch');
  await afterPut();
  console.log('V2_HEAD_ONLY_SYNC_VERIFIED=true');
  console.log('V2_HEAD_SHA256='+after.sha);
  console.log('V2_HEAD_FILE_COUNT='+after.count);
  console.log('V2_DEPLOYMENT_MUTATIONS=0');
  return after;
 }catch(e){throw Error('V2_HEAD_POST_PUT_UNKNOWN_NO_RETRY_NO_ROLLBACK: '+e.message);}
}
async function main(){
 const mode=process.argv[2];invocation(process.env,mode);
 latestMain(process.env);
 const files=releaseFiles(process.env);
 require_(process.env.V2_GAS_CLASPRC_JSON?.length>0,
  'GitHub secret V2_GAS_CLASPRC_JSON is absent');
 const c=credentials(process.env.V2_GAS_CLASPRC_JSON);
 if(mode==='audit'){
  // The audit phase never constructs a client with project mutation methods
  // enabled. In particular it never applies a PRIVATE target guard to the
  // previous HEAD. Mutation phases retain all of their existing restrictions.
  const d=require('./study1-v2-private-deploy.cjs');
  return audit(await d.makeApi(c,undefined,undefined,undefined,true),files);
 }
 const api=await apiFromCredentials(c);
 if(releaseProfile(process.env)==='private_e1_management'){
  const d=require('./study1-v2-private-deploy.cjs');
  const inventoryApi=await d.makeApi(c);
  const first=await d.audit(inventoryApi);
  const guard=async()=>{
   const now=await d.inventory(inventoryApi);
   d.requirePrivateHeadBaseline(now);
   require_(now.fp===process.env.EXPECTED_INVENTORY_SHA256,'private HEAD inventory differs from prior audit');
   require_(now.headSha===process.env.EXPECTED_REMOTE_SHA256,'private HEAD baseline differs');
   latestMain(process.env);
   return now;
  };
  d.requirePrivateHeadBaseline(first);
  require_(first.fp===process.env.EXPECTED_INVENTORY_SHA256,'private HEAD inventory differs from prior audit');
  if(mode==='prepare'){await guard();await prepare(api,files,c,process.env,true);}
  else await apply(api,files,c,process.env,guard,async()=>{
   const after=await d.inventory(inventoryApi);
   d.requirePrivateHeadBaseline(after);
   require_(after.headSha===reviewedPrivateTarget()&&after.stable===first.stable,'private HEAD or immutable deployment inventory readback mismatch');
  },true);
  return;
 }
 if(mode==='prepare')await prepare(api,files,c,process.env,true);
 else await apply(api,files,c,process.env,async()=>latestMain(process.env),async()=>{},true);
}
module.exports={anonymousReadOnlyCandidate,get PRIVATE_TARGET(){return reviewedPrivateTarget();},PRIVATE_CONFIRM,releaseProfile,releaseFiles,privateOwnerManagementCandidate,privateOwnerReadOnlyCandidate,REPO,SID,CONFIRM,APPROVED,invocation,readDevelopmentSources,localSources,closedManifest,closedWebsite,publicRpcSurface,
 canonical,digest,credentials,apiFromCredentials,verifyRemote,seal,unseal,latestMain,
 runnerPaths,aad,audit,prepare,apply};
if(require.main===module)main().catch(e=>{
 console.error(String(e.message).replace(/https?:\/\/\S+/g,'[URL]'));
 process.exitCode=1;
});
