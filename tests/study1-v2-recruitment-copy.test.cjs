'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const m=require('../scripts/study1-v2-recruitment-copy.cjs');
const html=fs.readFileSync(path.join(__dirname,'../gas/Index.html'),'utf8'),p=m.parseIndex(html);
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40);
const draft=(overrides={})=>({kind:'RECRUITMENT_COPY_REVIEW_DRAFT',source:m.FILE,baseRevision:'d'.repeat(64),baseSha256:m.hash(html),
 title:'合成標題 & 說明',intro:p.intro,open:false,approved:false,published:false,...overrides});
function fixture(){
 let main=A,branch=null,pr=null,review=[],files=[{filename:m.FILE,status:'modified'}],source=new Map([[A,html]]),writes=[],parent=A,failPr=false,afterMergeFail=false;
 const api=(route,method='GET',body)=>{
  if(method!=='GET')writes.push({route,method,body});
  if(route==='git/ref/heads/main')return {ref:'refs/heads/main',object:{sha:main}};
  if(route.startsWith('contents/'+m.FILE+'?ref=')){
   const ref=route.split('ref=')[1];return {path:m.FILE,type:'file',encoding:'base64',sha:'e'.repeat(40),content:Buffer.from(source.get(ref)).toString('base64')};
  }
  if(route==='git/refs'&&method==='POST'){assert.equal(body.sha,A);branch=body.ref;return {ref:branch,object:{sha:A}};}
  if(route==='contents/'+m.FILE&&method==='PUT'){assert.equal(body.branch,'b11-copy/123');source.set(B,Buffer.from(body.content,'base64').toString());return {commit:{sha:B}};}
  if(route==='git/ref/heads/b11-copy/123')return {ref:branch,object:{sha:B}};
  if(route==='pulls'&&method==='POST'){if(failPr)throw Error('PR disabled');pr={number:7,state:'open',draft:false,merged:false,user:{login:'bot'},base:{repo:{full_name:m.REPO},ref:'main'},head:{repo:{full_name:m.REPO},ref:'b11-copy/123',sha:B}};return pr;}
  if(route==='pulls/7'&&method==='GET')return pr;
  if(route==='pulls/7/files?per_page=100')return files;
  if(route==='commits/'+B)return {sha:B,parents:[{sha:parent}]};
  if(route==='pulls/7/reviews?per_page=100')return review;
  if(route==='collaborators/reviewer/permission')return {permission:'write'};
  if(route==='pulls/7/merge'&&method==='PUT'){assert.equal(body.sha,B);main=C;source.set(C,source.get(B));pr={...pr,merged:true,merge_commit_sha:C};if(afterMergeFail)throw Error('response lost');return {merged:true,sha:C};}
  throw Error('unhandled '+route);
 };
 const save=()=>m.save(api,{confirmation:m.SAVE,runId:'123',draft:JSON.stringify(draft())});
 const publish=(overrides={})=>m.publish(api,{confirmation:m.PUBLISH,pr:'7',head:B,approvalRef:'PI_TEST_001',reason:'合成核定',...overrides});
 const approve=(overrides={})=>review.push({id:review.length+1,user:{login:'reviewer'},author_association:'COLLABORATOR',state:'APPROVED',commit_id:B,body:'PI_APPROVAL_REF=PI_TEST_001',...overrides});
 return {api,save,publish,approve,writes,source,set files(v){files=v},set failPr(v){failPr=v},set main(v){main=v},set afterMergeFail(v){afterMergeFail=v}};
}
test('B11 source patch modifies only hero title and intro; escapes ampersand, preserves all eligibility and closed routes',()=>{
 const next=m.draftCandidate(html,draft());
 assert.equal(m.parseIndex(next).title,'合成標題 & 說明');
 assert.match(next,/合成標題 &amp; 說明/);
 assert.equal(next.split('<div class="actions">')[1],html.split('<div class="actions">')[1]);
 assert.deepEqual(m.verifyCandidate(html,next),{title:'合成標題 & 說明',intro:p.intro});
 assert.throws(()=>m.verifyCandidate(html,next.replace('目前尚未開放報名','已開放報名')),/outside/);
});
test('B11 stale SHA, forged approval, HTML, formula-like extra settings and no-op reject',()=>{
 for(const d of [draft({baseSha256:'1'.repeat(64)}),draft({published:true}),draft({open:true}),draft({title:'<script>'}),draft({eligibility:'changed'}),draft({title:p.title})])
  assert.throws(()=>m.draftCandidate(html,d));
});
test('B11 save persists exact original Index to isolated branch, opens PR and readbacks, leaves main and GAS unchanged',()=>{
 const f=fixture(),r=f.save();
 assert.equal(r.status,'DRAFT_SAVED');assert.equal(r.head,B);assert.equal(r.pull,7);assert.equal(r.gasDeployed,false);
 assert.equal(f.source.get(A),html);assert.equal(f.source.get(B),m.draftCandidate(html,draft()));
 assert.deepEqual(f.writes.map(w=>w.route),['git/refs','contents/'+m.FILE,'pulls']);
});
test('B11 disabled PR creation preserves verified draft branch without retries',()=>{
 const f=fixture();f.failPr=true;const r=f.save();assert.equal(r.status,'DRAFT_SAVED');assert.equal(r.pull,null);assert.ok(r.compare.includes('b11-copy/123'));
 assert.equal(f.writes.length,3);
});
test('B11 independently reviewed exact PR merges original main only, confirms readback, no deployment',()=>{
 const f=fixture();f.save();f.approve();const r=f.publish();
 assert.equal(r.status,'MAIN_COPY_PUBLISHED');assert.equal(r.main,C);assert.equal(r.gasDeployed,false);
 assert.equal(f.source.get(C),f.source.get(B));assert.equal(f.writes.at(-1).body.sha,B);
});
test('B11 stale head, self approval, wrong PI evidence, revoked review, unapproved or scope change reject before merge',()=>{
 for(const variant of ['none','self','stale','wrong-ref','revoked','extra','tamper','main-changed']){
  const f=fixture();f.save();
  if(variant==='self')f.approve({user:{login:'bot'}});
  else if(variant==='stale')f.approve({commit_id:A});
  else if(variant==='wrong-ref')f.approve({body:'PI_APPROVAL_REF=PI_OTHER_001'});
  else if(variant!=='none')f.approve();
  if(variant==='revoked')f.approve({state:'CHANGES_REQUESTED'});
  if(variant==='extra')f.files=[{filename:m.FILE,status:'modified'},{filename:'gas/Website.js',status:'modified'}];
  if(variant==='tamper')f.source.set(B,f.source.get(B).replace('目前尚未開放報名','已開放報名'));
  if(variant==='main-changed'){f.source.set(C,html+' ');f.main=C;}
  const n=f.writes.length;assert.throws(()=>f.publish(),/B11_COPY_BLOCKED/);assert.equal(f.writes.length,n,variant);
 }
});
test('B11 ambiguous merge response never retries; original PR/main can be inspected',()=>{
 const f=fixture();f.save();f.approve();f.afterMergeFail=true;
 assert.throws(()=>f.publish(),/response lost/);
 assert.equal(f.writes.filter(w=>w.route.endsWith('/merge')).length,1);
 assert.equal(f.source.get(C),f.source.get(B));
 assert.throws(()=>f.publish(),/not an eligible/);
 assert.equal(f.writes.filter(w=>w.route.endsWith('/merge')).length,1);
});
