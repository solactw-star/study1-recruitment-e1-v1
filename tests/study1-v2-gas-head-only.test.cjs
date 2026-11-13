'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const m=require('../scripts/study1-v2-gas-head-only.cjs');
const manifest=()=>JSON.stringify({timeZone:'Asia/Taipei',runtimeVersion:'V8',webapp:{access:'MYSELF',executeAs:'USER_DEPLOYING'}});
const website=()=>`function getPublicConfig(){return {open:false,consentReady:false,contact:'x'};}
function requestOtp(){return rejectIntake_();}
function verifyOtp(){return rejectIntake_();}
function holdSlot(){return rejectIntake_();}
function submitConsent(){return rejectIntake_();}
function listSlots(){return [];}`;
const fixtures=()=>[{name:'appsscript',type:'JSON',source:manifest()},{name:'Website',type:'SERVER_JS',source:website()},{name:'Index',type:'HTML',source:'<html>closed</html>'}];
const env=(mode='apply')=>({GITHUB_REPOSITORY:m.REPO,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:'a'.repeat(40),REVIEWED_SHA:'a'.repeat(40),SYNC_MODE:mode,EXPECTED_REMOTE_SHA256:'b'.repeat(64),CONFIRMATION:m.CONFIRM,GITHUB_RUN_ID:'12345',RUNNER_TEMP:fs.mkdtempSync(path.join(os.tmpdir(),'study1v2-'))});
const creds=()=>({refresh_token:'mock-v2-refresh-token-that-remains-private',client_id:'my-client-id',client_secret:'my-secret'});
const remote=()=>({scriptId:m.SID,files:fixtures()});

test('manual-only V2 repository/ref/SHA and explicit apply approval are mandatory',()=>{
 const good=env();assert.doesNotThrow(()=>m.invocation(good,'prepare'));assert.doesNotThrow(()=>m.invocation({...good,SYNC_MODE:'audit'},'audit'));
 for(const bad of [{GITHUB_REPOSITORY:'solactw-star/study1-recruitment-gas'},{GITHUB_REF:'refs/heads/feature'},
  {GITHUB_EVENT_NAME:'push'},{REVIEWED_SHA:'f'.repeat(40)},{CONFIRMATION:'NO'},
  {SYNC_MODE:'audit'},{EXPECTED_REMOTE_SHA256:''}])
  assert.throws(()=>m.invocation({...good,...bad},'prepare'),/V2_HEAD_ONLY_BLOCKED/);
 assert.throws(()=>m.invocation(good,'not-a-phase'),/V2_HEAD_ONLY_BLOCKED/);
});
test('canonical source hash ignores file order but rejects duplicate, invalid and missing manifest',()=>{
 const f=fixtures();assert.equal(m.digest(f),m.digest([...f].reverse()));
 assert.throws(()=>m.digest([...f,f[1]]),/duplicate/);
 assert.throws(()=>m.digest(f.slice(1)),/manifest/);
 assert.throws(()=>m.digest([...f,{name:'secret',type:'JSON',source:'{}'}]),/JSON files/);
 assert.throws(()=>m.digest([...f,{name:'bad/path',type:'SERVER_JS',source:'x'}]),/invalid/);
});
test('only MYSELF manifest and closed public front-end are accepted',()=>{
 const f=fixtures();assert.equal(m.closedManifest(f).webapp.access,'MYSELF');assert.doesNotThrow(()=>m.closedWebsite(f));
 f[0].source=f[0].source.replace('MYSELF','ANYONE_ANONYMOUS');assert.throws(()=>m.closedManifest(f),/MYSELF/);
 f[0].source=manifest();f[1].source=f[1].source.replace('open:false','open:true');assert.throws(()=>m.closedWebsite(f),/closed/);
});
test('V2 checked-in gas maps to V2 only and exact expected 27-source formal inventory',()=>{
 const dir=process.env.STUDY1_V2_GAS_FIXTURE_DIR;
 if(!dir)return; // optional when independent package uses its own full gas/ directory
 const files=m.localSources(dir);assert.equal(files.length,m.APPROVED.length);
 assert.equal(files.filter(f=>f.type==='JSON').length,1);
 for(const id of ['Study1FixtureAdapter','Study1Team','Study1Flow','Study1Unified'])
  assert.ok(!files.some(f=>f.name===id),'synthetic cannot ship: '+id);
 assert.ok(!files.some(f=>f.name==='程式碼'), 'no inert myFunction entrypoint');
 const clone=fs.mkdtempSync(path.join(os.tmpdir(),'v2-inventory-'));
 for(const p of fs.readdirSync(dir))fs.copyFileSync(path.join(dir,p),path.join(clone,p));
 fs.writeFileSync(path.join(clone,'EXTRA.js'),'x');assert.throws(()=>m.localSources(clone),/allowlist/);
 fs.rmSync(clone,{recursive:true,force:true});
});
test('supports old/new clasp OAuth JSON without exposing credentials',()=>{
 const c=creds();assert.equal(m.credentials(JSON.stringify({tokens:{default:c}})).refresh_token,c.refresh_token);
 const other={token:{refresh_token:c.refresh_token},oauth2ClientSettings:{clientId:c.client_id,clientSecret:c.client_secret}};
 assert.equal(m.credentials(JSON.stringify(other)).client_id,c.client_id);
 assert.throws(()=>m.credentials('{}'),/lacks/);
});
test('OAuth and HTTP update use only new GAS /content endpoint',async()=>{
 const calls=[];const fetcher=async(url,config)=>{
  calls.push({url,method:config.method,body:config.body&&String(config.body)});
  return {ok:true,json:async()=>url.includes('oauth2')?{access_token:'a-bearer-token-this-is-long'}:remote()};
 };
 const api=await m.apiFromCredentials(creds(),fetcher);
 await api.getContent();await api.putContent(fixtures());
 assert.equal(calls.length,3);assert.equal(calls[0].url,'https://oauth2.googleapis.com/token');
 for(const c of calls.slice(1))assert.equal(c.url,'https://script.googleapis.com/v1/projects/'+m.SID+'/content');
 assert.deepEqual(calls.slice(1).map(c=>c.method),['GET','PUT']);
 assert.ok(!calls[2].body.includes('.clasp.json'));
});
test('prewrite AES-GCM snapshot is encrypted and authenticated to run and OAuth',()=>{
 const raw=JSON.stringify(remote()),c=creds();const e=m.seal(raw,c.refresh_token,'run-123');
 assert.equal(m.unseal(e,c.refresh_token,'run-123'),raw);
 assert.ok(!JSON.stringify(e).includes('Study1Team'));
 assert.throws(()=>m.unseal(e,'some-other-refresh-token','run-123'));
 assert.throws(()=>m.unseal(e,c.refresh_token,'run-999'));
});
test('prepare writes encrypted backup before any PUT and full local readback',async()=>{
 const original=remote(),e=env(),c=creds(),f=fixtures();e.EXPECTED_REMOTE_SHA256=m.digest(original.files);
 let reads=0,writes=0;
 const api={getContent:async()=>{reads++;return original;},putContent:async()=>{writes++;}};
 const modified=[...f.map(v=>({...v}))];modified[2].source='<html>new but closed</html>';
 const r=await m.prepare(api,modified,c,e);
 assert.equal(r.before,e.EXPECTED_REMOTE_SHA256);assert.equal(r.target,m.digest(modified));
 assert.equal(reads,2);assert.equal(writes,0);
 const {backup,state}=m.runnerPaths(e);assert.ok(fs.existsSync(backup));assert.ok(fs.existsSync(state));
 const envelope=JSON.parse(fs.readFileSync(backup,'utf8'));
 assert.ok(!fs.readFileSync(backup,'utf8').includes('<html>closed</html>'));
 assert.equal(JSON.parse(m.unseal(envelope,c.refresh_token,m.aad(e))).head.scriptId,m.SID);
 fs.rmSync(e.RUNNER_TEMP,{recursive:true,force:true});
});
test('post-backup drift rejects before PUT; verified success makes just one PUT',async()=>{
 const e=env(),c=creds(),f=fixtures(),before=remote();e.EXPECTED_REMOTE_SHA256=m.digest(before.files);
 const updated=f.map(x=>({...x}));updated[2].source='<html>new content</html>';
 let current=before,writes=0;
 const api={getContent:async()=>current,putContent:async files=>{writes++;current={scriptId:m.SID,files};}};
 await m.prepare(api,updated,c,e);
 current={scriptId:m.SID,files:fixtures().map(x=>x.name==='Index'?{...x,source:'unexpected edit'}:x)};
 await assert.rejects(m.apply(api,updated,c,e),/modified after encrypted backup/);
 assert.equal(writes,0);
 current=before;const result=await m.apply(api,updated,c,e);
 assert.equal(writes,1);assert.equal(result.sha,m.digest(updated));
 fs.rmSync(e.RUNNER_TEMP,{recursive:true,force:true});
});
test('PUT timeout never retries or rolls back',async()=>{
 const e=env(),c=creds(),f=fixtures(),before=remote();e.EXPECTED_REMOTE_SHA256=m.digest(before.files);
 const updated=f.map(x=>x.name==='Index'?{...x,source:'new'}:{...x});
 let calls=0;
 const api={getContent:async()=>before,putContent:async()=>{calls++;throw Error('timeout');}};
 await m.prepare(api,updated,c,e);
 await assert.rejects(m.apply(api,updated,c,e),/POST_PUT_UNKNOWN_NO_RETRY_NO_ROLLBACK/);
 assert.equal(calls,1);
 fs.rmSync(e.RUNNER_TEMP,{recursive:true,force:true});
});
test('source and workflow have no deployment/Sheet mutation or auto trigger',()=>{
 const script=fs.readFileSync(path.join(__dirname,'../scripts/study1-v2-gas-head-only.cjs'),'utf8');
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-v2-gas-head-only.yml'),'utf8');
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/\n\s+push:\s*\n|schedule:|workflow_run:/);
 assert.equal((script.match(/api\.putContent\(/g)||[]).length,1);
 for(const banned of ['sheets.googleapis.com','SpreadsheetApp','MailApp','clasp push','createVersion(',
  'createDeployment(','putDeployment(','deleteDeployment(','https://script.google.com/macros/s/']){
  assert.ok(!script.includes(banned),banned);
 }
 assert.ok(!script.includes('1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z'));
 assert.match(workflow,/secrets\.V2_GAS_CLASPRC_JSON/);
 assert.doesNotMatch(workflow,/CLASPRC_JSON: \$\{\{ secrets\.CLASPRC_JSON/);
});
