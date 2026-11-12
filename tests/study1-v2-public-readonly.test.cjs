'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=require('../scripts/study1-v2-gas-head-only.cjs');
const folder=path.join(__dirname,'../gas'),files=core.localSources();
test('login-only ANYONE with deploying identity and full 31-file RPC closure',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(folder,'appsscript.json'),'utf8'));
 assert.equal(m.webapp.access,'ANYONE');assert.equal(m.webapp.executeAs,'USER_DEPLOYING');
 assert.equal(files.length,31);assert.ok(core.publicRpcSurface(files)>=35);
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
