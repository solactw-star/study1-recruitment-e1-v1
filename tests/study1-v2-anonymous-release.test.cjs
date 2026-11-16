'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../scripts/study1-v2-gas-head-only.cjs'),d=require('../scripts/study1-v2-private-deploy.cjs'),r=require('../scripts/study1-v2-anonymous-release.cjs');
const base=()=>core.localSources(),candidate=()=>core.anonymousReadOnlyCandidate(base());
const env=()=>({V2_ANONYMOUS_RELEASE:'1',GITHUB_REPOSITORY:core.REPO,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'1'});
const event=e=>({before:r.PARENT,after:e.GITHUB_SHA,head_commit:{id:e.GITHUB_SHA,message:r.MESSAGE},commits:[{}],ref:e.GITHUB_REF,repository:{full_name:core.REPO},forced:false,created:false,deleted:false});
function dep(v,access,id='deployment-'+v){return {deploymentId:id,deploymentConfig:{scriptId:core.SID,versionNumber:v,manifestFileName:'appsscript'},entryPoints:[{entryPointType:'WEB_APP',webApp:{entryPointConfig:{access,executeAs:'USER_DEPLOYING'},url:'https://script.google.com/macros/s/'+id+'/exec'}}]};}
function initial(){return {safe:true,headSha:r.OLD[2][0],headProof:{known:true,access:'ANYONE'},proofs:r.OLD.map(([sha,access],i)=>({version:i+1,sha,access,known:true})),versions:r.OLD.map((x,i)=>({scriptId:core.SID,versionNumber:i+1})),deps:[dep(0,'ANYONE','head'),...r.OLD.map((x,i)=>dep(i+1,x[1]))],fp:'initial'};}
test('anonymous candidate changes only manifest and passes original closed public safety',()=>{
 const b=base(),a=candidate();assert.equal(a.length,core.APPROVED.length);
 for(const f of b.filter(f=>f.name!=='appsscript'))assert.deepEqual(a.find(x=>x.name===f.name),f);
 assert.deepEqual(core.closedManifest(a,true),{...core.closedManifest(b),webapp:{executeAs:'USER_DEPLOYING',access:'ANYONE_ANONYMOUS'}});
 assert.throws(()=>core.closedManifest(a),/MYSELF/);
 assert.ok(core.publicRpcSurface(a)>=35);core.closedWebsite(a);
 assert.ok(d.sourceProof({scriptId:core.SID,files:a},true).known);
 const unknown=a.map(f=>f.name==='Index'?{...f,source:f.source+' '}:f);
 assert.equal(d.sourceProof({scriptId:core.SID,files:unknown},true).known,false);
 assert.throws(()=>core.anonymousReadOnlyCandidate(core.privateOwnerManagementCandidate(b)));
 const unsafe=b.map(f=>f.name==='Website'?{...f,source:f.source+'\nfunction leak(){return 1;}\n'}:f);
 assert.throws(()=>core.anonymousReadOnlyCandidate(unsafe),/unguarded public RPC/);
});
test('only exact first authorized main event can release',()=>{
 const e=env(),x=event(e);r.authorize(e,x);
 for(const bad of [{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_REF:'refs/heads/other'},{V2_ANONYMOUS_RELEASE:''},{GITHUB_EVENT_NAME:'workflow_dispatch'}])assert.throws(()=>r.authorize({...e,...bad},x));
 for(const bad of [{before:'b'.repeat(40)},{forced:true},{commits:[{},{}]},{head_commit:{id:e.GITHUB_SHA,message:'other'}}])assert.throws(()=>r.authorize(e,{...x,...bad}));
});
test('baseline accepts only exact v1/v2 private and v3 authorized public inventory',()=>{
 const s=initial();r.baseline(s);
 assert.throws(()=>r.baseline({...s,safe:false}));
 assert.throws(()=>r.baseline({...s,proofs:s.proofs.map(p=>p.version===3?{...p,sha:'x'}:p)}));
 assert.throws(()=>r.baseline({...s,deps:s.deps.map(p=>p.deploymentConfig.versionNumber===2?dep(2,'ANYONE_ANONYMOUS'):p)}));
 const a=dep(4,'ANYONE_ANONYMOUS');assert.equal(r.link(a,4,'ANYONE_ANONYMOUS'),'https://script.google.com/macros/s/deployment-4/exec');
 assert.throws(()=>r.link(dep(4,'ANYONE'),4,'ANYONE_ANONYMOUS'));
});
test('old deployment ACL/identity and immutable sources must remain unchanged',()=>{
 const s=initial();r.keep(s,s);
 assert.throws(()=>r.keep(s,{...s,deps:s.deps.map(p=>p.deploymentConfig.versionNumber===2?dep(2,'ANYONE'):p)}),/existing deployment changed/);
 assert.throws(()=>r.keep(s,{...s,proofs:s.proofs.map(p=>p.version===2?{...p,sha:'drift'}:p)}),/old immutable contents changed/);
});
test('one publish preserves old deployments; competing state or ambiguous POST does not retry',async()=>{
 const f=candidate(),target=core.digest(f),s=initial();
 function scenario(fail){
  let state=s,counts=[0,0,0];
  const api={createVersion:async()=>{counts[1]++;if(fail==='version')throw Error('unknown POST');state={...state,versions:[...state.versions,{scriptId:core.SID,versionNumber:4}],proofs:[...state.proofs,{version:4,sha:target,known:true,access:'ANYONE_ANONYMOUS'}],fp:'version'};return {scriptId:core.SID,versionNumber:4};},createDeployment:async()=>{counts[2]++;const made=dep(4,'ANYONE_ANONYMOUS');state={...state,deps:[...state.deps,made],fp:'deploy'};return made;},getDeployment:async id=>state.deps.find(x=>x.deploymentId===id)};
  const head={putContent:async()=>{counts[0]++;state={...state,headSha:target,headProof:{known:true,access:'ANYONE_ANONYMOUS'},deps:state.deps.map(p=>p.deploymentId==='head'?dep(0,'ANYONE_ANONYMOUS','head'):p),fp:'head'};}};
  const read=async()=>fail==='competition'&&counts[0]===0?{...state,fp:'other'}:state;
  return {run:()=>r.publish(api,head,s,f,()=>{},async()=>{},read),counts};
 }
 const ok=scenario();assert.equal((await ok.run()).version,4);assert.deepEqual(ok.counts,[1,1,1]);
 const bad=scenario('version');await assert.rejects(bad.run(),/unknown POST/);assert.deepEqual(bad.counts,[1,1,0]);
 const race=scenario('competition');await assert.rejects(race.run(),/inventory changed/);assert.deepEqual(race.counts,[0,0,0]);
});

test('GET-only v4 recovery requires exact historical source, unique deployment and direct anonymous ACL',async()=>{
 const target='ab5906a7e733cd2ea3520bc01e4ed137e3bd87c04f496da1ad06bf0c961c56c3',s=initial(),v=dep(4,'ANYONE_ANONYMOUS');
 const state={...s,proofs:[...s.proofs,{version:4,sha:target,access:'ANYONE_ANONYMOUS',known:true}],deps:[...s.deps,v]};
 let gets=0;
 const api={getDeployment:async id=>{gets++;assert.equal(id,v.deploymentId);return v;}};
 assert.equal(await d.verifyAnonymousV4(api,s),null);
 assert.equal(await d.verifyAnonymousV4(api,state),'https://script.google.com/macros/s/deployment-4/exec');
 assert.equal(gets,1);
 await assert.rejects(d.verifyAnonymousV4(api,{...state,safe:false}),/source\/inventory/);
 await assert.rejects(d.verifyAnonymousV4(api,{...state,deps:[...state.deps,dep(4,'ANYONE_ANONYMOUS','duplicate')]}),/not unique/);
 await assert.rejects(d.verifyAnonymousV4({getDeployment:async()=>dep(4,'ANYONE')},state),/differs from list/);
});
