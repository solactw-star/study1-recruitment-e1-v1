'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const core=require('../scripts/study1-v2-gas-head-only.cjs');
const repo=path.join(__dirname,'..'),gas=path.join(repo,'gas');
const archive=path.join(__dirname,'fixtures/legacy-gas');
const expected=Object.freeze({
 'Study1Unified.js':'ef489b01d25a81c9f71af15476b55df7dec63f3f',
 'Study1Unified.html':'15f50b46aa01e520208f6b7c01846fa5dea935a6',
 'Study1Team.html':'066f086b302793f82280c007166d0f427a632003',
 'Study1FixtureAdapter.js':'2230b704fd7ce560b0691ac4314b7a99c749e5d8'
});
const gitBlobSha=b=>crypto.createHash('sha1')
 .update('blob '+b.length+'\0').update(b).digest('hex');

test('four retired GAS executables physically absent and original test snapshots byte-identical',()=>{
 for(const [name,sha] of Object.entries(expected)){
  assert.equal(fs.existsSync(path.join(gas,name)),false,name+' must not be GAS executable');
  const bytes=fs.readFileSync(path.join(archive,name));
  assert.equal(gitBlobSha(bytes),sha,name+' fixture must preserve original verified Git blob');
 }
});
test('FORMAL E1 GAS inventory has only reviewed 27 sources and cannot read fixtures',()=>{
 const files=core.localSources();
 assert.equal(files.length,27);
 for(const id of ['Study1Flow','Study1Unified','Study1Team','Study1FixtureAdapter'])
  assert.ok(!files.some(x=>x.name===id),id);
 const visitor=files.find(x=>x.name==='Study1Visitor').source;
 assert.ok(visitor.includes("document.body.dataset.siteMode!=='FORMAL')return;"));
 assert.doesNotMatch(visitor,/study1UnifiedPreviewGet|study1UnifiedPreviewCommand|SIMULATED_SIGN_ONLY/);
 assert.doesNotMatch(visitor,/demoDoneDetails|v07Result|v08UnknownBoundary|receiptId/);
});
test('legacy offline VM helpers do not become public RPCs or bypass server-side deny',()=>{
 const files=core.localSources();
 const website=files.find(x=>x.name==='Website').source;
 for(const route of ['admin','team','preview','demo'])assert.ok(website.includes("'"+route+"'"));
 assert.match(website,/STUDY1_V2_PUBLIC_READ_ONLY/);
 assert.throws(()=>core.publicRpcSurface([...files,
  {name:'Study1Flow',type:'SERVER_JS',source:fs.readFileSync(path.join(archive,'Study1Unified.js'),'utf8')}]),
  /non-deployable synthetic executable/);
});
test('legacy fixture loader maps only retired sources outside executable GAS directory',()=>{
 const {legacySourcePath,legacy}=require('./helpers/study1-legacy-source.cjs');
 for(const name of Object.keys(expected)){
  assert.ok(legacy.has(name));
  assert.equal(legacySourcePath(gas,name),path.join(archive,name));
 }
 assert.equal(legacySourcePath(gas,'Study1FormalBooking.js'),
  path.join(gas,'Study1FormalBooking.js'));
});
