'use strict';
/** Study 1 V2: manual, HEAD content only. No versions, deployments, Sheets or live intake. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');

const REPO = 'solactw-star/study1-recruitment-e1-v1';
const SID = '1qg3PuI8sGFOAP-pJ889d9RrN0p_e0zsfqM274HgG4sEg9Qjv-xzqeL2f';
const CONFIRM = 'I_AUTHORIZE_STUDY1_V2_HEAD_ONLY';
const PRIVATE_CONFIRM = 'I_AUTHORIZE_STUDY1_V2_PRIVATE_E1_HEAD_ONLY';
// reviewedPrivateTarget() is derived from this reviewed checkout below, never from an old deployment hash.
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
const TYPES = Object.freeze({'.js':'SERVER_JS','.gs':'SERVER_JS','.html':'HTML','.json':'JSON'});
// The retired synthetic UI/fixture modules remain in the repo for historical
// offline test imports, but must never be executable in formal E1 GAS HEAD.
const TEST_ONLY_NONDEPLOYABLE=Object.freeze([
 'Study1FixtureAdapter.js','Study1Team.html','Study1Unified.html','Study1Unified.js'
]);
// Current reviewed release inventory, not a permanent file-count requirement.
// Development source loading is separate. A changed inventory requires explicit
// source review before any release; existing release profiles remain unchanged.
const APPROVED = Object.freeze([
 'AdminConsole','AdminSandbox','BookingCancelHoldPreflight','BookingCore',
 'BookingHoldTransaction','BookingReadOnlyLock','BookingReadOnlyLocked',
 'BookingReadOnlySheet','BookingReschedulePreflight','Index','OtpCore',
 'OtpThrottle','OtpTransaction','Study1EConsentBinding','Study1EConsentOtpAdapter',
 'Study1FormalBooking','Study1FormalConsent',
 'Study1ParticipantIntake','Study1ParticipantTrust','Study1PdfLib',
 'Study1PdfStampCore','Study1SelfReportAuthority',
 'Study1Visitor','Study1WizardEnrollment','Study1WizardP0Bridge','Website',
 'appsscript'
].sort());
const fail = m => {throw Error('V2_HEAD_ONLY_BLOCKED: '+m);};
const require_ = (v,m) => {if(!v)fail(m);};
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const fileData = files => files.map(({name,type,source})=>({name,type,source}));
function canonical(files) {
 require_(Array.isArray(files)&&files.length>0,'empty or invalid GAS source inventory');
 const names=new Set();
 const result=files.map(f=>{
  require_(f && typeof f.name==='string' && /^[^\/\\.][^\/\\]*$/.test(f.name) &&
   ['SERVER_JS','HTML','JSON'].includes(f.type) && typeof f.source==='string' &&
   f.source.length>0 && !names.has(f.name),'invalid, empty, or duplicate GAS file');
  names.add(f.name);
  return [f.name,f.type,f.source];
 }).sort((a,b)=>a[0].localeCompare(b[0],'en'));
 require_(files.filter(f=>f.name==='appsscript'&&f.type==='JSON').length===1,
  'exactly one appsscript JSON manifest required');
 require_(files.filter(f=>f.type==='JSON').length===1,'unexpected JSON files');
 return result.map(x=>JSON.stringify(x)).join('\n');
}
const digest = files => sha(canonical(files));
/** Reject public source releases unless every callable private RPC is deny-gated. */
function publicRpcSurface(files){
 // Explicit fail-closed check even when this inventory is supplied by a caller.
 const legacy=['Study1FixtureAdapter','Study1Team','Study1Unified','Study1Flow'];
 require_(!files.some(f=>legacy.includes(f.name)),
  'non-deployable synthetic executable in formal GAS source inventory');
 const visitor=files.find(f=>f.name==='Study1Visitor'&&f.type==='HTML')?.source||'';
 require_(visitor.includes("document.body.dataset.siteMode!=='FORMAL')return;")&&
  !visitor.includes("document.body.dataset.siteMode==='FORMAL')return;")&&
  !/study1UnifiedPreview|SIMULATED_SIGN_ONLY|function v08Preview_/.test(visitor),
  'formal visitor is not isolated from synthetic controller');
 for(const f of files.filter(f=>f.type==='SERVER_JS'&&f.name!=='Study1PdfLib'))
  require_(!/\bstudy1(?:UnifiedPreview|Fixture)[A-Za-z0-9_]*\s*\(/.test(f.source),
   'formal server depends on retired synthetic runtime: '+f.name);
 const w=files.find(f=>f.name==='Website'&&f.type==='SERVER_JS')?.source||'';
 require_(w.includes("function study1V2PublicRpcDeny_(){throw new Error('STUDY1_V2_PUBLIC_READ_ONLY');}"),
  'missing public RPC deny helper');
 require_(w.includes("['admin','team','preview','demo'].includes(e.parameter.view)"),
  'public admin routes exposed');
 const safe=new Set(['doGet','getPublicConfig','study1ParticipantReadiness','requestOtp',
  'verifyOtp','holdSlot','cancelHold','submitConsent','listSlots']);
 const regex=/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
 const gate="if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();";
 let total=0;
 for(const f of files.filter(x=>x.type==='SERVER_JS')){
  // pdf-lib is a minified UMD bundle; its inner functions are not GAS RPCs.
  // Pin the entire vendor blob, and reject any unreviewed change instead of
  // misclassifying minifier-local names as remotely callable functions.
  if(f.name==='Study1PdfLib'){
   const blob=crypto.createHash('sha1').update('blob '+Buffer.byteLength(f.source)+'\0'+f.source).digest('hex');
   require_(blob==='f0916cac6bcfa54425c819a16e6ca11360a8d7c5',
    'reviewed minified PDF bundle changed');
   continue;
  }
  for(const m of f.source.matchAll(regex)){
  // Nested helper declarations are indented and are not callable via google.script.run.
  // Top-level declarations are flush-left, or follow another top-level declaration on one line.
  const prefix=f.source.slice(f.source.lastIndexOf('\n',m.index)+1,m.index);
  if(prefix.length>0&&prefix.trim()==='')continue;
  if(m[1].endsWith('_')||safe.has(m[1]))continue;
  require_(f.source.slice(m.index+m[0].length).startsWith(gate),
   'unguarded public RPC '+f.name+'.'+m[1]);
  total++;
  }
 }
 require_(total>=35,'exposed RPC inventory unexpectedly reduced');
 const intake=files.find(f=>f.name==='Study1ParticipantIntake'&&f.type==='SERVER_JS')?.source||'';
 require_(intake.includes("if(typeof study1V2PublicRpcDeny_==='function')return {ready:false,experiment:'E1',reason:'REGISTRATION_NOT_OPEN'};"),
  'participant readiness must refuse new intake');
 require_(w.includes('function getPublicConfig(){return {open:false,consentReady:false'),
  'public website intake not closed');
 return total;
}
function closedManifest(files,allowAnonymous=false){
 const m=files.find(f=>f.name==='appsscript'&&f.type==='JSON');
 require_(m,'missing Apps Script manifest');
 let obj;
 try{obj=JSON.parse(m.source);}catch{fail('manifest cannot parse');}
 require_(obj.timeZone==='Asia/Taipei' && obj.runtimeVersion==='V8' &&
  ( ['MYSELF','ANYONE'].includes(obj.webapp?.access) || (allowAnonymous===true&&obj.webapp?.access==='ANYONE_ANONYMOUS') ) && obj.webapp?.executeAs==='USER_DEPLOYING',
  'V2 manifest must have MYSELF or login-only ANYONE / USER_DEPLOYING');
 if(obj.webapp.access!=='MYSELF')publicRpcSurface(files);
 return obj;
}
// Explicit opt-in candidate: no change to the normal public/private build sources.
function anonymousReadOnlyCandidate(base=localSources()){
 require_(closedManifest(base).webapp.access==='ANYONE','anonymous candidate requires reviewed public baseline');
 requireReviewedInventory(base);
 closedWebsite(base);publicRpcSurface(base);
 const files=base.map(f=>{if(f.name!=='appsscript')return {...f};
  const m=JSON.parse(f.source);m.webapp.access='ANYONE_ANONYMOUS';
  return {...f,source:JSON.stringify(m,null,2)+'\n'};
 });
 require_(closedManifest(files,true).webapp.access==='ANYONE_ANONYMOUS','anonymous manifest required');
 closedWebsite(files);return files;
}
function closedWebsite(files){
 const w=files.find(f=>f.name==='Website'&&f.type==='SERVER_JS')?.source;
 require_(w && w.includes('function getPublicConfig(){return {open:false,consentReady:false') &&
  w.includes('function requestOtp(){return rejectIntake_();}') &&
  w.includes('function verifyOtp(){return rejectIntake_();}') &&
  w.includes('function holdSlot(){return rejectIntake_();}') &&
  w.includes('function submitConsent(){return rejectIntake_();}') &&
  w.includes('function listSlots(){return [];}'),
  'V2 public intake remains closed in Website.js');
}
function readDevelopmentSources(root=path.join(__dirname,'..','gas')){
 const clasp=JSON.parse(fs.readFileSync(path.join(root,'.clasp.json'),'utf8'));
 require_(clasp.scriptId===SID,'local .clasp.json points to a different Script ID');
 const filenames=fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isFile() && x.name!=='.clasp.json');
 // Synthetic sources are kept only for offline tests, never sent to GAS.
 require_(!filenames.some(x=>TEST_ONLY_NONDEPLOYABLE.includes(x.name)),
  'retired synthetic source reintroduced into executable GAS directory');
 const files=filenames.map(x=>{
  const ext=path.extname(x.name);
  require_(Object.hasOwn(TYPES,ext),'unrecognized GAS source extension: '+x.name);
  const name=x.name==='Study1Unified.js'?'Study1Flow':path.basename(x.name,ext);
  return {name,type:TYPES[ext],source:fs.readFileSync(path.join(root,x.name),'utf8')};
 });
 canonical(files);
 return fileData(files);
}
function requireReviewedInventory(files){
 canonical(files);
 require_(JSON.stringify(files.map(f=>f.name).sort())===JSON.stringify(APPROVED),
  'GAS source inventory differs from the current reviewed V2 allowlist');
}
function localSources(root=path.join(__dirname,'..','gas')){
 const files=readDevelopmentSources(root);
 requireReviewedInventory(files);
 closedManifest(files);closedWebsite(files);
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
function verifyRemote(head){
 require_(head?.scriptId===SID,'remote returned the wrong Script ID');
 const count=canonical(head.files).split('\n').length;
 require_(count>=2,'remote HEAD is not a full GAS source set');
 return {sha:digest(head.files),count};
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
function privateOwnerReadOnlyCandidate(files){
 // Offline only: never used by main(), localSources(), prepare(), apply(), or workflow.
 // Start exclusively from the reviewed, closed public source inventory.
 requireReviewedInventory(files);
 require_(closedManifest(files).webapp.access==='ANYONE',
  'private candidate requires the unchanged login-only public baseline');
 closedWebsite(files);
 const patch=(source,from,to)=>{
  require_(source.split(from).length===2,'private candidate source anchor drift');
  return source.replace(from,()=>to);
 };
 const owners={
  AdminSandbox:['study1ConsentVersionList','study1EConsentOwnerList',
   'study1EConsentOwnerSignedPdfDownload','study1EConsentOwnerWithdrawalCases'],
  Study1FormalBooking:['study1OwnerE1OperationsAudit','study1OwnerE1RecoveryAudit','study1OwnerE1Workspace','study1OwnerE1SlotChangePreview','study1OwnerE1RecruitmentDraft','study1OwnerE1Profile','study1OwnerE1ProfilePdf'],
  Study1WizardP0Bridge:['study1OwnerE1SlotAudit']
 };
 const gate="if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();";
 const result=files.map(f=>{
  let s=f.source;
  if(f.name==='appsscript'){
   const manifest=JSON.parse(s);
   manifest.webapp.access='MYSELF';
   s=JSON.stringify(manifest,null,2)+'\n';
  }else if(f.name==='Website'){
   s=patch(s,'function doGet(e){',`function doGet(e){
 if(e&&e.parameter&&e.parameter.view==='admin'){
  study1AdminOwnerRequired_();
  return HtmlService.createHtmlOutputFromFile('AdminConsole')
   .setTitle('Study 1｜OWNER 私人唯讀管理')
   .addMetaTag('viewport','width=device-width, initial-scale=1');
 }`);
  }else if(f.name==='AdminConsole'){
   s=patch(s,'<section><h2>測試研究內容','<section hidden><h2>測試研究內容');
   s=patch(s,'<section><h2>測試預約設定','<section hidden><h2>測試預約設定');
   s=patch(s,'\nreload();\n})();','\n// Private read-only candidate: no automatic sandbox RPC.\n})();');
   s=patch(s,'<label for="e1PdfFile">','<div hidden><label for="e1PdfFile">');
   s=patch(s,'<label for="e1PdfChoose">','</div><label for="e1PdfChoose">');
   s=patch(s,'<label><input type="checkbox" id="e1PdfChooseAttest">',
    '<div hidden><label><input type="checkbox" id="e1PdfChooseAttest">');
   s=patch(s,'<h3>已完成簽署的完整 PDF｜OWNER 私人副本</h3>',
    '</div><p>本私人唯讀候選僅供核對既有 PDF 與下載已核實副本；不提供上傳、選用或設定來源。</p><h3>已完成簽署的完整 PDF｜OWNER 私人副本</h3>');
   s=patch(s,' <h3>OWNER 手動核對已簽 PDF 與原預約（禁止自動重試）</h3>',
    ' <div hidden><h3>OWNER 手動核對已簽 PDF 與原預約（禁止自動重試）</h3>');
   s=patch(s,'</section>\n\n<section id="staffWithdrawal"',
    '</div></section>\n\n<section id="staffWithdrawal"');
   s=patch(s,'<title>Study 1｜OWNER 後台（正式 E1 文件與隔離測試分區）</title>',
    '<title>Study 1｜OWNER 私人唯讀管理</title>');
   s=patch(s,'<header><h1>Study 1｜研究室 OWNER 後台</h1><p>正式 E1 文件與隔離測試分區；目前不接受真人報名、預約或電子簽署。</p></header>',
    '<header><h1>Study 1｜研究室 OWNER 私人唯讀管理</h1><p>核對 E1 原始場次、PDF、預約與通知；不開放真人報名、預約或電子簽署。</p></header>');
   s=patch(s,'<strong>隔離測試與正式文件分區</strong><p>測試設定不會修改正式研究資料；獨立的 E1 OWNER PDF 區將使用原私人 Drive 與同意書版本索引，但不開放真人收件。所有正式操作仍須通過伺服器端 OWNER 身分驗證。</p>',
    '<strong>私人唯讀驗收候選｜非正式營運</strong><p>僅已驗證研究室 OWNER 可核對既有來源；所有寫入、寄信、場次調整、簽署與真人收件 RPC 仍被拒絕。資料是否齊備及正式啟用須另行核對及授權。</p>');
  }else if(Object.hasOwn(owners,f.name)){
   for(const name of owners[f.name]){
    const re=new RegExp('^function '+name+'\\([^\\n]*\\)\\{','gm');
    const hits=[...s.matchAll(re)];
    require_(hits.length===1,'private candidate RPC declaration drift: '+name);
    const prefix=hits[0][0],at=hits[0].index+prefix.length;
    require_(s.slice(at).startsWith(gate)&&
     /^\s*study1AdminOwnerRequired_\(\);/.test(s.slice(at+gate.length)),
     'private candidate RPC must already require OWNER before reads: '+name);
    s=patch(s,prefix+gate,prefix);
   }
  }
  return {...f,source:s};
 });
 require_(closedManifest(result).webapp.access==='MYSELF',
  'private candidate must remain MYSELF');
 closedWebsite(result);
 let publicRejected=false;
 try{publicRpcSurface(result);}catch(e){
  publicRejected=String(e.message).includes('unguarded public RPC');
 }
 require_(publicRejected,'private candidate must not pass public release guard');
 return result;
}
function privateOwnerManagementCandidate(files){
 // Offline only; no automatic HEAD sync, version creation, or deployment.
 // Extend, rather than replace, the already reviewed read-only candidate.
 const base=privateOwnerReadOnlyCandidate(files);
 const patch=(s,a,b)=>{
  require_(s.split(a).length===2,'private management source anchor drift');
  return s.replace(a,()=>b);
 };
 const gate="if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();";
 const original=files.find(f=>f.name==='AdminConsole').source;
 const boundary='<h3>已完成簽署的完整 PDF｜OWNER 私人副本</h3>';
 const start='<label for="e1PdfFile">';
 const first=original.indexOf(start),last=original.indexOf(boundary);
 require_(first>=0&&last>first,'private management PDF UI anchor drift');
 const result=base.map(f=>{
  let s=f.source;
  if(f.name==='AdminSandbox'){
   // Scope all three existing RPCs to E1; preserve the original OWNER,
   // closed flags, lock/revision, ACL, original SHA and readback checks.
   const upload='function study1ConsentVersionUpload(input){'+gate;
   const select='function study1ConsentVersionSelect(input){'+gate;
   const pub='function study1ConsentVersionPublication(input){'+gate;
   s=patch(s,upload,'function study1ConsentVersionUpload(input){\n study1AdminOwnerRequired_();\n if(!input||input.experiment!==\'E1\'||input.researcherPresigned!==true)throw Error(\'E1_PRESIGNED_MANAGEMENT_ONLY\');');
   s=patch(s,select,'function study1ConsentVersionSelect(input){');
   s=patch(s,"if(!entry)throw Error('只能選擇原私人資料夾中的已存版本');","if(!entry)throw Error('只能選擇原私人資料夾中的已存版本');\n  if(entry.experiment!=='E1'||entry.researcherPresigned!==true)throw Error('E1_PRESIGNED_MANAGEMENT_ONLY');");
   s=patch(s,pub,"function study1ConsentVersionPublication(input){\n study1AdminOwnerRequired_();\n if(!input||input.experiment!=='E1'||typeof input.id!=='string'||!input.id)throw Error('E1_PRESIGNED_MANAGEMENT_ONLY');");
   // Verify the selected private source even when the pointer already matches.
   s=patch(s,"  if(before.published[input.experiment]===input.id)return before;\n","");
   s=patch(s,"   if(!entry||before.current[input.experiment]!==input.id||","   if(!entry||entry.researcherPresigned!==true||before.current[input.experiment]!==input.id||");
   s=patch(s,"  const after={...before,revision:before.revision+1,\n   published:","  if(before.published[input.experiment]===input.id)return before;\n  const after={...before,revision:before.revision+1,\n   published:");
  }else if(f.name==='Study1FormalBooking'){
   const signature='function study1OwnerE1SlotChangeCommit(input){';
   s=patch(s,signature+gate+'\n study1AdminOwnerRequired_();',signature+'\n study1AdminOwnerRequired_();');
  }else if(f.name==='AdminConsole'){
   const a=s.indexOf('<div hidden>'+start),b=s.indexOf(boundary);
   require_(a>=0&&b>a,'private read-only PDF UI anchor drift');
   s=patch(s,s.slice(a,b),original.slice(first,last));
   s=patch(s,'<title>Study 1｜OWNER 私人唯讀管理</title>','<title>Study 1｜OWNER 私人 E1 管理</title>');
   s=patch(s,'<h1>Study 1｜研究室 OWNER 私人唯讀管理</h1>','<h1>Study 1｜研究室 OWNER 私人 E1 管理</h1>');
   s=patch(s,'<strong>私人唯讀驗收候選｜非正式營運</strong><p>僅已驗證研究室 OWNER 可核對既有來源；所有寫入、寄信、場次調整、簽署與真人收件 RPC 仍被拒絕。資料是否齊備及正式啟用須另行核對及授權。</p>','<strong>私人 E1 文件管理候選｜非正式營運</strong><p>僅研究室 OWNER 可在獨立授權後管理 E1 研究者預簽 PDF 及已核定單筆場次；不開放報名、參與者預約異動、寄信或簽署。正式資料操作仍需個別授權，場次寫入僅限獨立核定且收件關閉。</p>');
   // Unknown write result never re-enables writes merely because a GET succeeds.
   s=patch(s,'try{unknown=false;render(x);}',"try{render(x);if(unknown)msg.textContent+=' 先前寫入結果未知；本頁仍鎖定寫入，須由 OWNER 獨立核對原紀錄後另行處置，不得重送。';}");
  }else if(f.name==='Website'){
   s=patch(s,".setTitle('Study 1｜OWNER 私人唯讀管理')",".setTitle('Study 1｜OWNER 私人 E1 管理')");
  }
  return {...f,source:s};
 });
 require_(closedManifest(result).webapp.access==='MYSELF','private management requires MYSELF');
 closedWebsite(result);
 let rejected=false;
 try{publicRpcSurface(result);}catch(e){rejected=String(e.message).includes('unguarded public RPC');}
 require_(rejected,'private management candidate rejected by public release guard');
 return result;
}
// Bind this run to the closed, allowlisted private candidate of its exact checkout.
let privateTarget;
function reviewedPrivateTarget(){
 // Pin the first successfully reviewed checkout in this process, not at import.
 // A failed or incomplete development checkout grants no release authority.
 if(privateTarget===undefined)privateTarget=digest(privateOwnerManagementCandidate(localSources()));
 return privateTarget;
}
module.exports={anonymousReadOnlyCandidate,get PRIVATE_TARGET(){return reviewedPrivateTarget();},PRIVATE_CONFIRM,releaseProfile,releaseFiles,privateOwnerManagementCandidate,privateOwnerReadOnlyCandidate,REPO,SID,CONFIRM,APPROVED,invocation,readDevelopmentSources,localSources,closedManifest,closedWebsite,publicRpcSurface,
 canonical,digest,credentials,apiFromCredentials,verifyRemote,seal,unseal,latestMain,
 runnerPaths,aad,audit,prepare,apply};
if(require.main===module)main().catch(e=>{
 console.error(String(e.message).replace(/https?:\/\/\S+/g,'[URL]'));
 process.exitCode=1;
});
