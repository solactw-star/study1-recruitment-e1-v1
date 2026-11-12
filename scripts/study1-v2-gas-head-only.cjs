'use strict';
/** Study 1 V2: manual, HEAD content only. No versions, deployments, Sheets or live intake. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');

const REPO = 'solactw-star/study1-recruitment-e1-v1';
const SID = '1qg3PuI8sGFOAP-pJ889d9RrN0p_e0zsfqM274HgG4sEg9Qjv-xzqeL2f';
const CONFIRM = 'I_AUTHORIZE_STUDY1_V2_HEAD_ONLY';
const TYPES = Object.freeze({'.js':'SERVER_JS','.gs':'SERVER_JS','.html':'HTML','.json':'JSON'});
// Frozen, reviewed source inventory: newly added GAS code must be explicitly reviewed.
const APPROVED = Object.freeze([
 'AdminConsole','AdminSandbox','BookingCancelHoldPreflight','BookingCore',
 'BookingHoldTransaction','BookingReadOnlyLock','BookingReadOnlyLocked',
 'BookingReadOnlySheet','BookingReschedulePreflight','Index','OtpCore',
 'OtpThrottle','OtpTransaction','Study1EConsentBinding','Study1EConsentOtpAdapter',
 'Study1FixtureAdapter','Study1FormalBooking','Study1FormalConsent',
 'Study1ParticipantIntake','Study1ParticipantTrust','Study1PdfLib',
 'Study1PdfStampCore','Study1SelfReportAuthority','Study1Team','Study1Flow','Study1Unified',
 'Study1Visitor','Study1WizardEnrollment','Study1WizardP0Bridge','Website',
 'appsscript','程式碼'
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
 for(const f of files.filter(x=>x.type==='SERVER_JS'))for(const m of f.source.matchAll(regex)){
  // Nested helper declarations are indented and are not callable via google.script.run.
  // Top-level declarations are flush-left, or follow another top-level declaration on one line.
  const prefix=f.source.slice(f.source.lastIndexOf('\n',m.index)+1,m.index);
  if(prefix.length>0&&prefix.trim()==='')continue;
  if(m[1].endsWith('_')||safe.has(m[1]))continue;
  require_(f.source.slice(m.index+m[0].length).startsWith(gate),
   'unguarded public RPC '+f.name+'.'+m[1]);
  total++;
 }
 require_(total>=35,'exposed RPC inventory unexpectedly reduced');
 const intake=files.find(f=>f.name==='Study1ParticipantIntake'&&f.type==='SERVER_JS')?.source||'';
 require_(intake.includes("if(typeof study1V2PublicRpcDeny_==='function')return {ready:false,experiment:'E1',reason:'REGISTRATION_NOT_OPEN'};"),
  'participant readiness must refuse new intake');
 require_(w.includes('function getPublicConfig(){return {open:false,consentReady:false'),
  'public website intake not closed');
 return total;
}
function closedManifest(files){
 const m=files.find(f=>f.name==='appsscript'&&f.type==='JSON');
 require_(m,'missing Apps Script manifest');
 let obj;
 try{obj=JSON.parse(m.source);}catch{fail('manifest cannot parse');}
 require_(obj.timeZone==='Asia/Taipei' && obj.runtimeVersion==='V8' &&
  ['MYSELF','ANYONE'].includes(obj.webapp?.access) && obj.webapp?.executeAs==='USER_DEPLOYING',
  'V2 manifest must have MYSELF or login-only ANYONE / USER_DEPLOYING');
 if(obj.webapp.access==='ANYONE')publicRpcSurface(files);
 return obj;
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
function localSources(root=path.join(__dirname,'..','gas')){
 const clasp=JSON.parse(fs.readFileSync(path.join(root,'.clasp.json'),'utf8'));
 require_(clasp.scriptId===SID,'local .clasp.json points to a different Script ID');
 const filenames=fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isFile() && x.name!=='.clasp.json');
 const files=filenames.map(x=>{
  const ext=path.extname(x.name);
  require_(Object.hasOwn(TYPES,ext),'unrecognized GAS source extension: '+x.name);
  const name=x.name==='Study1Unified.js'?'Study1Flow':path.basename(x.name,ext);
  return {name,type:TYPES[ext],source:fs.readFileSync(path.join(root,x.name),'utf8')};
 });
 canonical(files);
 require_(JSON.stringify(files.map(f=>f.name).sort())===JSON.stringify(APPROVED),
  'GAS source inventory differs from the fixed reviewed V2 allowlist');
 closedManifest(files);closedWebsite(files);
 return fileData(files);
}
function invocation(env,mode){
 require_(mode==='audit'||mode==='prepare'||mode==='apply','invalid sync phase');
 require_(env.GITHUB_REPOSITORY===REPO && env.GITHUB_REF==='refs/heads/main' &&
  env.GITHUB_EVENT_NAME==='workflow_dispatch' && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'') &&
  env.GITHUB_SHA===env.REVIEWED_SHA,'manual, main, exact SHA and V2 repository required');
 if(mode!=='audit'){
  require_(env.SYNC_MODE==='apply' && env.CONFIRMATION===CONFIRM,
   'explicit V2 apply confirmation required');
  require_(/^[a-f0-9]{64}$/.test(env.EXPECTED_REMOTE_SHA256||''),
   'verified remote SHA from a preceding audit required');
 }
 if(mode==='audit')require_(env.SYNC_MODE==='audit','audit selection required');
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
async function apiFromCredentials(c,fetcher=fetch){
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
  const response=await fetcher(endpoint,{method,
   headers:{Authorization:'Bearer '+token,...(files?{'Content-Type':'application/json'}:{})},
   body:files?JSON.stringify({files:fileData(files)}):undefined,
   signal:AbortSignal.timeout(30000)});
  if(!response.ok)fail('V2 GAS HEAD '+method+' failed HTTP '+response.status+' (no retry)');
  return response.json();
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
 const remote=verifyRemote(await api.getContent());
 console.log('V2_AUDIT_REMOTE_SHA256='+remote.sha);
 console.log('V2_AUDIT_REMOTE_FILE_COUNT='+remote.count);
 console.log('V2_AUDIT_REVIEWED_SHA256='+digest(files));
 console.log('V2_AUDIT_REVIEWED_FILE_COUNT='+files.length);
 console.log('V2_AUDIT_NO_REMOTE_WRITES=true');
 return remote;
}
async function prepare(api,files,c,env){
 const head=await api.getContent(),before=verifyRemote(head),target=digest(files);
 require_(before.sha===env.EXPECTED_REMOTE_SHA256,'remote SHA differs from manually reviewed audit');
 require_(target!==before.sha,'GAS HEAD already equals reviewed local source (no unnecessary write)');
 const bytes=JSON.stringify({scriptId:SID,githubSha:env.GITHUB_SHA,head:{scriptId:head.scriptId,files:fileData(head.files)}},null,2);
 const enc=seal(bytes,c.refresh_token,aad(env));
 require_(unseal(enc,c.refresh_token,aad(env))===bytes,'backup encryption/decryption self-check failed');
 const p=runnerPaths(env);
 fs.writeFileSync(p.backup,JSON.stringify(enc),{mode:0o600,flag:'wx'});
 fs.writeFileSync(p.state,JSON.stringify({scriptId:SID,githubSha:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,
  before:before.sha,target,backupSha:sha(JSON.stringify(enc)),backup:p.backup}),{mode:0o600,flag:'wx'});
 require_(sha(fs.readFileSync(p.backup,'utf8'))===sha(JSON.stringify(enc)),
  'encrypted backup local readback failed');
 const after=verifyRemote(await api.getContent());
 require_(after.sha===before.sha,'remote HEAD changed while preparing backup');
 console.log('V2_PREWRITE_BACKUP_ENCRYPTED=true');
 console.log('V2_PREWRITE_BASE_SHA256='+before.sha);
 console.log('V2_PREWRITE_TARGET_SHA256='+target);
 console.log('V2_PREWRITE_BACKUP_SHA256='+sha(JSON.stringify(enc)));
 return {before:before.sha,target};
}
async function apply(api,files,c,env){
 const p=runnerPaths(env);
 const s=JSON.parse(fs.readFileSync(p.state,'utf8'));
 require_(s.scriptId===SID && s.githubSha===env.GITHUB_SHA && s.runId===env.GITHUB_RUN_ID &&
  s.before===env.EXPECTED_REMOTE_SHA256 && s.target===digest(files) && s.backup===p.backup,
  'wrong or stale prewrite state');
 const encrypted=fs.readFileSync(p.backup,'utf8');
 require_(sha(encrypted)===s.backupSha,'encrypted backup changed after upload');
 const copy=JSON.parse(unseal(JSON.parse(encrypted),c.refresh_token,aad(env)));
 require_(copy.scriptId===SID && copy.githubSha===env.GITHUB_SHA &&
  verifyRemote(copy.head).sha===s.before,'prewrite backup does not match remote baseline');
 const current=verifyRemote(await api.getContent());
 require_(current.sha===s.before,'remote HEAD modified after encrypted backup');
 // No atomic CAS in the Google Apps Script API. Never retry/rollback an ambiguous PUT.
 try{
  await api.putContent(files);
  const after=verifyRemote(await api.getContent());
  require_(after.sha===s.target && after.count===files.length,'full remote HEAD readback mismatch');
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
 const files=localSources();
 require_(process.env.V2_GAS_CLASPRC_JSON?.length>0,
  'GitHub secret V2_GAS_CLASPRC_JSON is absent');
 const c=credentials(process.env.V2_GAS_CLASPRC_JSON);
 const api=await apiFromCredentials(c);
 if(mode==='audit')await audit(api,files);
 else if(mode==='prepare')await prepare(api,files,c,process.env);
 else await apply(api,files,c,process.env);
}
if(require.main===module)main().catch(e=>{
 console.error(String(e.message).replace(/https?:\/\/\S+/g,'[URL]'));
 process.exitCode=1;
});
module.exports={REPO,SID,CONFIRM,APPROVED,invocation,localSources,closedManifest,closedWebsite,publicRpcSurface,
 canonical,digest,credentials,apiFromCredentials,verifyRemote,seal,unseal,
 runnerPaths,aad,audit,prepare,apply};
