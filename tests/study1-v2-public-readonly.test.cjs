'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=require('../scripts/study1-v2-gas-head-only.cjs');
const folder=path.join(__dirname,'../gas'),files=core.localSources();
test('login-only ANYONE with deploying identity and formal 27-file RPC closure',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(folder,'appsscript.json'),'utf8'));
 assert.equal(m.webapp.access,'ANYONE');assert.equal(m.webapp.executeAs,'USER_DEPLOYING');
 assert.equal(files.length,27);assert.ok(core.publicRpcSurface(files)>=35);
 assert.equal(files.some(f=>f.name==='程式碼'),false,'retired myFunction file removed');
});
test('public viewer can only see research info and closed FORMAL page, not OWNER routes or PDF',()=>{
 const source=fs.readFileSync(path.join(folder,'Website.js'),'utf8');
 const chain={setTitle(){return this;},addMetaTag(){return this;}};
 const served=[];
 const ctx={
  ScriptApp:{getScriptId:()=>core.SID,getService:()=>({getUrl:()=>'https://script.google.com/macros/s/TESTPUBLIC/exec'})},
  HtmlService:{createTemplateFromFile(name){served.push(name);return {name,flowMode:null,siteAppUrl:null,evaluate(){return {...chain,name:this.name,mode:this.flowMode,url:this.siteAppUrl};}}}}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx,{timeout:1500});
 assert.equal(ctx.doGet({parameter:{}}).name,'Index');
 const apply=ctx.doGet({parameter:{view:'apply'}});
 assert.equal(apply.name,'Study1Visitor');assert.equal(apply.mode,'FORMAL');
 assert.equal(ctx.getPublicConfig().open,false);assert.equal(ctx.getPublicConfig().consentReady,false);
 for(const view of ['admin','team','preview','demo'])assert.throws(()=>ctx.doGet({parameter:{view}}),/PUBLIC_READ_ONLY/);
 assert.deepEqual(served,['Index','Study1Visitor'],'denied routes must not instantiate any private HTML');
 for(const forbidden of ["createHtmlOutputFromFile('AdminConsole')",
  "createHtmlOutputFromFile('Study1Unified')","createHtmlOutputFromFile('Study1Team')",
  "view==='demo'","view==='preview'","view==='team'","view==='admin'"])
  assert.ok(!source.includes(forbidden),'retired unreachable route: '+forbidden);
 assert.throws(()=>ctx.getPublicConsentDocument('E1'),/PUBLIC_READ_ONLY/);
});
test('hard-close readiness even if environment would otherwise allow it',()=>{
 const src=fs.readFileSync(path.join(folder,'Study1ParticipantIntake.js'),'utf8');
 assert.match(src,/function study1ParticipantReadiness\(\)\{\s*if\(typeof study1V2PublicRpcDeny_/);
});
test('old system and private deployment URL are not hard-coded as public links',()=>{
 for(const file of ['Index.html','Study1Visitor.html']){
  const html=fs.readFileSync(path.join(folder,file),'utf8');
  assert.ok(!html.includes('AKfycbwJv-Gne_31fj'));
  assert.ok(!html.includes('AKfycbzrtJEzhKT_'));
 }
});

test('Unified/Team/Fixture synthetic sources cannot ship with formal E1 HEAD',()=>{
 for(const id of ['Study1FixtureAdapter','Study1Team','Study1Flow','Study1Unified'])
  assert.equal(files.some(f=>f.name===id),false,id);
 for(const fname of ['Study1FixtureAdapter.js','Study1Team.html','Study1Unified.html','Study1Unified.js']){
  assert.equal(fs.existsSync(path.join(folder,fname)),false,'synthetic runtime removed from gas/: '+fname);
  assert.ok(fs.existsSync(path.join(__dirname,'fixtures/legacy-gas',fname)),
   'historical test-only source preserved: '+fname);
 }
 const html=fs.readFileSync(path.join(folder,'Study1Visitor.html'),'utf8');
 assert.ok(html.includes("document.body.dataset.siteMode!=='FORMAL')return;"));
 assert.doesNotMatch(html,/study1UnifiedPreview|study1Fixture|SIMULATED_SIGN_ONLY/);
 assert.doesNotMatch(html,/demoDoneDetails|v07Result|v08UnknownBoundary|receiptId/);
 assert.ok(!html.includes("document.body.dataset.siteMode==='FORMAL')return;"));
 assert.match(html,/<body data-site-mode="FORMAL">/);
 assert.doesNotMatch(html,/(?:demo\.study1@example\.invalid|00000000|<script[^>]+src=)/);
 for(const f of files.filter(f=>f.type==='SERVER_JS'&&f.name!=='Study1PdfLib'))
  assert.doesNotMatch(f.source,/\bstudy1(?:UnifiedPreview|Fixture)\w*\s*\(/);
 assert.throws(()=>core.publicRpcSurface([...files,
  {name:'Study1Flow',type:'SERVER_JS',source:'function study1UnifiedPreviewGet(){}'}]),
  /non-deployable synthetic executable/);
 const bad=files.map(f=>f.name==='Study1Visitor'?
  {...f,source:f.source.replace("document.body.dataset.siteMode!=='FORMAL')return;",
   "document.body.dataset.siteMode!=='UNSAFE')return;")}:f);
 assert.throws(()=>core.publicRpcSurface(bad),/formal visitor is not isolated/);
 const injected=files.map(f=>f.name==='Study1Visitor'?
  {...f,source:f.source+'\nstudy1UnifiedPreviewGet();'}:f);
 assert.throws(()=>core.publicRpcSurface(injected),/formal visitor is not isolated/);
});
