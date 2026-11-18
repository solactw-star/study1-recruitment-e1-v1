'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {serve,sharedPage}=require('../scripts/study1-v2-uat-shared.cjs'),PDFLib=require('../gas/Study1PdfLib.js');
const pngCrc=bytes=>{
 let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)
 c=(c&1)?(c>>>1)^0xedb88320:c>>>1;}return (c^0xffffffff)>>>0;
};
function chunk(type,buf){const t=Buffer.from(type,'ascii'),length=Buffer.alloc(4),crc=Buffer.alloc(4);
 length.writeUInt32BE(buf.length);crc.writeUInt32BE(pngCrc(Buffer.concat([t,buf])));
 return Buffer.concat([length,t,buf,crc]);}
function syntheticInk(){
 const w=64,h=32,pixels=Buffer.alloc(h*(w*4+1));
 for(let y=0;y<h;y++){
  const at=y*(w*4+1);pixels[at]=0;
  for(let x=0;x<w;x++){
   const px=at+1+x*4,stroke=x>3&&x<58&&Math.abs(y-(x/2-3))<2;
   pixels[px]=stroke?10:255;pixels[px+1]=stroke?20:255;
   pixels[px+2]=stroke?25:255;pixels[px+3]=255;
  }
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);
 ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),
  chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(pixels)),
  chunk('IEND',Buffer.alloc(0))]);
}


const key=()=>crypto.randomBytes(32).toString('hex'),reqid=()=>crypto.randomBytes(16).toString('hex');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function request(s,token,op,payload={},extra={}){
 const r=await fetch(s.url+'/api',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...extra},body:JSON.stringify({op,payload})});return {status:r.status,body:await r.json()};
}
async function ok(s,t,op,p={}){const r=await request(s,t,op,p);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
async function start(s,t,alias){await ok(s,t,'start',{alias,eligible:true});return ok(s,t,'verify',{code:'12345678'});}
test('two independent HTTP servers share last seat, idempotent booking, exact signed PDF, and restart recovery',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'study1-shared-test-'));let t=Date.parse('2026-11-16T16:30:00Z'),a,b,c;
 try{
  a=await serve({dir,port:0,clock:()=>t});b=await serve({dir,port:0,clock:()=>t});const ka=key(),kb=key(),unknown=key();
  const sa=await start(a,ka,'TEST_01'),sb=await start(b,kb,'TEST_02');assert.equal(sa.length,3);assert.deepEqual(sa,sb);
  const slot=sa[0].slotId,ra=reqid(),rb=reqid();
  const r=await Promise.all([request(a,ka,'hold',{slotId:slot,requestId:ra}),request(b,kb,'hold',{slotId:slot,requestId:rb})]);
  assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);const win=r[0].status===200?{s:a,k:ka,id:ra}:{s:b,k:kb,id:rb},lose=win.s===a?{s:b,k:kb}:{s:a,k:ka};
  const held=await ok(win.s,win.k,'hold',{slotId:slot,requestId:win.id});assert.equal(held.bookingStatus,'HELD');assert.equal((await ok(lose.s,lose.k,'slots')).some(x=>x.slotId===slot),false);
  assert.equal((await request(win.s,win.k,'hold',{slotId:sa[1].slotId,requestId:reqid()})).status,409);
  assert.equal((await request(a,unknown,'read')).status,409);assert.equal((await request(a,unknown,'copy')).status,409);
  assert.equal((await request(a,key(),'start',{alias:held.alias,eligible:true})).status,409);
  const doc=await ok(win.s,win.k,'document'),orig=Buffer.from(doc.bytes,'base64');assert.equal(doc.caseId,held.caseId);assert.equal(hash(orig),doc.sha);assert.equal((await PDFLib.PDFDocument.load(orig)).getPageCount(),5);
  const p={requestId:reqid(),sourceSha:doc.sha,ink:syntheticInk().toString('base64'),read:true,agree:true};
  assert.equal((await request(win.s,win.k,'sign',{...p,sourceSha:'0'.repeat(64)})).status,409);
  assert.equal((await request(win.s,win.k,'sign',{...p,agree:false})).status,409);
  const [one,two]=await Promise.all([ok(a,win.k,'sign',p),ok(b,win.k,'sign',p)]);
  assert.equal(one.caseId,held.caseId);assert.equal(one.bookingStatus,'CONFIRMED');assert.equal(one.sha,two.sha);assert.equal(one.bytes,two.bytes);assert.equal(one.date,'2026/11/17');
  const saved=Buffer.from(one.bytes,'base64');assert.equal(hash(saved),one.sha);assert.notEqual(one.sha,doc.sha);assert.equal((await PDFLib.PDFDocument.load(saved)).getPageCount(),5);
  assert.equal((await request(a,win.k,'sign',{...p,requestId:reqid()})).status,409);
  assert.equal((await request(a,win.k,'cancel')).status,409);assert.equal((await request(lose.s,lose.k,'copy')).status,409);
  await a.close();a=null;await b.close();b=null;c=await serve({dir,port:0,clock:()=>t});const status=await ok(c,win.k,'read'),copy=await ok(c,win.k,'copy');
  assert.equal(status.caseId,held.caseId);assert.equal(status.slotId,slot);assert.equal(status.signedSha,one.sha);assert.equal(copy.bytes,one.bytes);assert.equal((await ok(c,lose.k,'slots')).some(x=>x.slotId===slot),false);
 }finally{for(const s of [a,b,c])if(s)await s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('expiry and cancellation release shared capacity; expired signer cannot confirm',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'study1-expiry-'));let t=Date.parse('2026-11-16T16:30:00Z'),s;
 try{s=await serve({dir,port:0,clock:()=>t});const ka=key(),kb=key(),kc=key();const slots=await start(s,ka,'TEST_03');await start(s,kb,'TEST_04');await start(s,kc,'TEST_05');const slot=slots[0].slotId;
  const h=await ok(s,ka,'hold',{slotId:slot,requestId:reqid()}),d=await ok(s,ka,'document');t+=600001;
  assert.equal((await ok(s,ka,'read')).bookingStatus,'EXPIRED');assert.equal((await request(s,ka,'sign',{requestId:reqid(),sourceSha:d.sha,ink:syntheticInk().toString('base64'),read:true,agree:true})).status,409);
  assert.equal((await ok(s,kb,'hold',{slotId:slot,requestId:reqid()})).bookingStatus,'HELD');await ok(s,kb,'cancel');assert.equal((await ok(s,kc,'hold',{slotId:slot,requestId:reqid()})).bookingStatus,'HELD');assert.notEqual((await ok(s,kc,'read')).caseId,h.caseId);
  assert.equal((await request(s,kc,'read',{}, {Origin:'https://outside.invalid'})).status,403);assert.equal((await request(s,kc,'read',{name:'REAL'})).status,409);
 }finally{if(s)await s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('test service refuses non-UAT directory and serves original-derived shared UI only',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'study1-refuse-'));try{fs.writeFileSync(path.join(dir,'research.csv'),'do not touch');await assert.rejects(serve({dir,port:0}),/TEST_DIRECTORY_REQUIRED/);assert.equal(fs.readFileSync(path.join(dir,'research.csv'),'utf8'),'do not touch');}finally{fs.rmSync(dir,{recursive:true,force:true});}
 const html=sharedPage();assert.match(html,/共用測試時段/);assert.match(html,/重新讀回本案/);assert.match(html,/不保存至正式系統/);assert.doesNotMatch(html,/google\.script\.run|<script[^>]+src=/);for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new (require('node:vm').Script)(m[1]);
});

test('shared visitor rejects cross-case or unconfirmed PDF and clears old links before recovery',async()=>{
 const vm=require('node:vm');
 const source=fs.readFileSync(path.join(__dirname,'../scripts/study1-v2-uat-shared-ui.js'),'utf8');
 const pdf=await PDFLib.PDFDocument.create();for(let i=0;i<5;i++)pdf.addPage();
 const raw=Buffer.from(await pdf.save()),sha=hash(raw),other='a'.repeat(64);
 const held={caseId:'UAT_A',alias:'TEST_01',stage:'HELD',bookingStatus:'HELD',sourceSha:other,startAtUtc:'2026-11-18T02:00:00Z',endAtUtc:'2026-11-18T03:00:00Z',holdUntil:'2026-11-18T02:10:00Z'};
 const done={...held,stage:'DONE',bookingStatus:'CONFIRMED',formal:false,persisted:true,pageCount:5,signedSha:sha,sha,bytes:raw.toString('base64'),date:'2026/11/18'};
 const nodes=new Map(),revoked=[],queue=[];
 const el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,hidden:false,textContent:'',children:[],classList:{toggle(){}},listeners:{},addEventListener(n,fn){this.listeners[n]=fn;},removeAttribute(n){delete this[n]},getContext(){return {fillRect(){}}}});return nodes.get(id);};
 const run=vm.createContext({document:{getElementById:el},window:{addEventListener(){}},crypto:crypto.webcrypto,Uint8Array,Date,Intl,atob,Blob,URL:{createObjectURL:()=> 'blob:verified',revokeObjectURL:u=>revoked.push(u)},fetch:async()=>{const answer=queue.shift();if(!answer)throw Error('unexpected RPC');return {ok:!answer.error,json:async()=>answer}}});
 vm.runInContext(source,run);
 const click=id=>el(id).listeners.click();
 el('caseKey').value='b'.repeat(64);
 queue.push(held);await click('readCase');
 queue.push({caseId:'UAT_B',sha:other,pageCount:5,bytes:done.bytes});await click('confirm');
 assert.equal(el('step-consent').hidden,true);assert.equal(el('officialPdfDownload').href,undefined);
 queue.push(done,{...done,caseId:'UAT_B'});await click('readCase');
 assert.equal(el('step-done').hidden,true);assert.equal(el('formalDonePdfDownload').href,undefined);
 queue.push(done,{...done,bookingStatus:'HELD'});await click('readCase');
 assert.equal(el('step-done').hidden,true);
 queue.push(done,done);await click('readCase');
 assert.equal(el('step-done').hidden,false);assert.equal(el('formalDonePdfDownload').href,'blob:verified');
 el('caseKey').value='c'.repeat(64);queue.push({error:'CASE_NOT_FOUND'});await click('readCase');
 assert.equal(el('step-done').hidden,true);assert.equal(el('formalDonePdfDownload').href,undefined);assert.equal(el('caseSummary').textContent,'');assert.ok(revoked.includes('blob:verified'));
 assert.equal(queue.length,0);
});

test('GAS range transaction keeps shared capacity and full signed PDF together; refuses wrong store, lock loss and unknown writes',async()=>{
 const vm=require('node:vm'),realm=vm.createContext({Date,Uint8Array,Utilities:{
  DigestAlgorithm:{SHA_256:'SHA_256'},computeDigest:(_,b)=>Array.from(crypto.createHash('sha256').update(Buffer.from(b)).digest()),
  formatDate:()=> '2026/11/18'
 }});
 for(const p of ['gas/BookingCore.js','gas/Study1PdfLib.js','gas/Study1PdfStampCore.js','scripts/study1-v2-uat-session.js','scripts/study1-v2-uat-store-transaction.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',p),'utf8'),realm);
 const original=await vm.runInContext('study1UatDocument_("GAS_UAT")',realm);
 const t=Date.parse('2026-11-18T02:00:00.000Z'),storeId='SYNTHETIC_UNIT_TEST_ONLY';
 realm.args=JSON.stringify({source:original.bytes,ink:Array.from(syntheticInk()),layout:original.layout,sha:original.hash,at:new Date(t).toISOString()});
 const signed=await vm.runInContext('(async()=>{const x=JSON.parse(args);return study1PdfComposeSigned_(x.source,x.ink,x.layout,{experiment:"E1",version:"UAT-SYNTHETIC-1",sha256:x.sha},new Date(x.at));})()',realm);
 const config={storeId,sourceSha:original.hash,slots:[['TEST_SLOT_1','2026-11-19T02:00:00.000Z','2026-11-19T03:00:00.000Z',1,'TEST_ONLY','OPEN','TEST','2026-11-18T02:00:00.000Z'],['TEST_SLOT_2','2026-11-19T04:00:00.000Z','2026-11-19T05:00:00.000Z',1,'TEST_ONLY','OPEN','TEST','2026-11-18T02:00:00.000Z']]};
 const matrix=[['STUDY1_E1_SYNTHETIC_CASES_V1',storeId,...Array(7).fill('')],...Array.from({length:12},()=>Array(9).fill(''))];
 let held=false,deny=false,lose=false,badParent=false,hasFormula=false,failFlush=false,partial=false,writes=0,opens=0,clock=t;
 const sheet={getName:()=> 'SYNTHETIC_CASES',getParent:()=>({getId:()=>badParent?'WRONG':storeId}),getLastRow:()=>13,getLastColumn:()=>9,
  getRange:(r,c,n,m)=>({getValues:()=>matrix.slice(r-1,r-1+n).map(x=>x.slice(c-1,c-1+m)),getFormulas:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>hasFormula&&i===1&&j===1?'=1':'')),
   setValues:v=>{assert.equal(held,true);writes++;v.forEach((row,i)=>{matrix[r-1+i]=row.slice();});if(partial)matrix[r-1][1]='';}})};
 const svc={getLock:()=>({tryLock:()=>{if(deny||held)return false;held=true;return true;},hasLock:()=>held&&!lose,releaseLock:()=>{held=false;}}),getSheet:()=>{assert.equal(held,true);opens++;return sheet;},flush:()=>{if(failFlush)throw Error('unknown');},now:()=>clock,decode:s=>Array.from(Buffer.from(s,'base64')),digest:b=>hash(Buffer.from(b))};
 const tx=choose=>realm.study1UatStoreTransaction_(svc,config,choose);
 const record=i=>({alias:'TEST_0'+(i+1),caseId:'UAT_'+String(i+1).repeat(24),tokenHash:String(i+1).repeat(64),state:'OTP',slotId:'',holdUntil:'',holdKey:'',sourceSha:'',signedSha:'',signKey:'',inkSha:'',signedAt:'',date:'',pdf:''});
 const change=(i,fields)=>tx(rows=>({index:i,record:{...rows[i],...fields}}));
 deny=true;assert.throws(()=>tx(()=>null),/UAT_LOCK_BUSY/);assert.equal(opens,0);deny=false;
 lose=true;assert.throws(()=>tx(()=>null),/UAT_LOCK_LOST/);assert.equal(opens,0);assert.equal(held,false);lose=false;
 badParent=true;assert.throws(()=>tx(()=>null),/UAT_STORE_IDENTITY/);badParent=false;
 hasFormula=true;assert.throws(()=>tx(()=>null),/MARKER_OR_FORMULA/);hasFormula=false;
 assert.equal(writes,0);
 for(let i=0;i<2;i++){tx(()=>({index:i,record:record(i)}));change(i,{state:'SLOTS'});}
 const h={state:'HELD',slotId:'TEST_SLOT_1',holdUntil:new Date(t+600000).toISOString(),holdKey:'d'.repeat(32),sourceSha:original.hash};
 change(0,h);
 assert.throws(()=>change(1,h),/UAT_SLOT_UNAVAILABLE/);
 const count=writes;change(0,h);assert.equal(writes,count);
 assert.throws(()=>change(0,{state:'CONFIRMED'}),/UAT_PDF_SCHEMA/);
 const receipt={state:'CONFIRMED',signedSha:signed.signedSha256,signKey:'e'.repeat(32),inkSha:hash(syntheticInk()),signedAt:signed.serverSignedAt,date:signed.taipeiDate,pdf:Buffer.from(signed.signedPdfBytes).toString('base64')};
 failFlush=true;assert.throws(()=>change(0,receipt),/UAT_WRITE_UNKNOWN_READ_CASE/);assert.equal(held,false);failFlush=false;
 const saved=tx(()=>null)[0];assert.equal(saved.state,'CONFIRMED');assert.equal(saved.pdf,receipt.pdf);assert.equal(hash(Buffer.from(saved.pdf,'base64')),saved.signedSha);
 assert.equal((await PDFLib.PDFDocument.load(Buffer.from(saved.pdf,'base64'))).getPageCount(),5);
 const after=writes;change(0,receipt);assert.equal(writes,after);
 assert.throws(()=>change(0,{state:'CANCELLED'}),/UAT_(UNCONFIRMED_PDF|TRANSITION)/);
 assert.throws(()=>change(1,h),/UAT_SLOT_UNAVAILABLE/);
 // Expired/cancelled holds release the second slot, without weakening the first confirmed one.
 const second={...h,slotId:'TEST_SLOT_2'};change(1,second);
 clock=t+600001;assert.throws(()=>change(1,receipt),/UAT_HOLD_EXPIRED/);
 change(1,{state:'EXPIRED'});
 tx(()=>({index:2,record:record(2)}));change(2,{state:'SLOTS'});
 const nextHold={...second,holdUntil:new Date(clock+600000).toISOString(),holdKey:'f'.repeat(32)};
 change(2,nextHold);change(2,{state:'CANCELLED'});
 tx((rows,avail)=>{assert.equal(avail.some(x=>x.slotId==='TEST_SLOT_2'),true);assert.equal(avail.some(x=>x.slotId==='TEST_SLOT_1'),false);return null;});
 // A partially changed persisted PDF is never acknowledged or used for capacity.
 const originalChunk=matrix[1][1];
 matrix[1][1]='pdf:AAAA';assert.throws(()=>tx(()=>null),/UAT_PDF_INTEGRITY/);
 const oldGate='a'.repeat(64),newGate='b'.repeat(64),newerGate='c'.repeat(64),approved={...config,gateSha:oldGate};
 const maintain=m=>realm.study1UatStoreTransaction_(svc,approved,null,m);
 assert.throws(()=>maintain({mode:'preview'}),/UAT_PDF_INTEGRITY/);
 matrix[1][1]=originalChunk;
 const fixed=JSON.stringify(matrix),beforeReset=writes;
 const p=maintain({mode:'preview'});
 assert.equal(p.counts.cases,3);assert.equal(p.counts.confirmed,1);assert.equal(p.counts.pdfs,1);
 assert.deepEqual(JSON.parse(JSON.stringify(p.cases)),[
  {alias:'TEST_01',state:'CONFIRMED',slotId:'TEST_SLOT_1',pdfSaved:true},
  {alias:'TEST_02',state:'EXPIRED',slotId:'TEST_SLOT_2',pdfSaved:false},
  {alias:'TEST_03',state:'CANCELLED',slotId:'TEST_SLOT_2',pdfSaved:false}]);
 assert.deepEqual(JSON.parse(JSON.stringify(p.slots.map(s=>[s.slotId,s.occupied,s.remaining,s.bookable]))),[['TEST_SLOT_1',1,0,false],['TEST_SLOT_2',0,1,true]]);
 assert.doesNotMatch(JSON.stringify(p),/tokenHash|holdKey|sourceSha|signedSha|signKey|inkSha|caseId|"pdf":|gateSha|storeId/);
 assert.ok(!JSON.stringify(p).includes(receipt.pdf));
 assert.equal(writes,beforeReset);assert.equal(JSON.stringify(matrix),fixed);
 assert.throws(()=>maintain({mode:'clear',expectedSha:'0'.repeat(64),nextGateSha:newGate}),/STALE_PREVIEW/);
 assert.throws(()=>maintain({mode:'clear',expectedSha:p.snapshotSha,nextGateSha:oldGate}),/CLEANUP_REQUEST/);
 assert.throws(()=>maintain({mode:'clear',expectedSha:p.snapshotSha,nextGateSha:newGate,storeId:'OTHER'}),/CLEANUP_REQUEST/);
 hasFormula=true;assert.throws(()=>maintain({mode:'clear',expectedSha:p.snapshotSha,nextGateSha:newGate}),/MARKER_OR_FORMULA/);hasFormula=false;
 matrix[4][0]='FORMAL_OR_UNKNOWN';assert.throws(()=>maintain({mode:'clear',expectedSha:p.snapshotSha,nextGateSha:newGate}),/CASE_SCHEMA/);matrix[4][0]='';
 tx(()=>({index:3,record:record(3)}));
 assert.throws(()=>maintain({mode:'clear',expectedSha:p.snapshotSha,nextGateSha:newGate}),/STALE_PREVIEW/);
 const current=maintain({mode:'preview'});const beforeClear=writes;
 let lifecycleWrites=0;
 const staleSvc={...svc,beforeCleanup:()=>{throw Error('CONFIG_STALE');},afterCleanup:()=>{lifecycleWrites++;return true;}};
 assert.throws(()=>realm.study1UatStoreTransaction_(staleSvc,approved,null,{mode:'clear',expectedSha:current.snapshotSha,nextGateSha:newGate}),/CONFIG_STALE/);
 assert.equal(writes,beforeClear);assert.equal(lifecycleWrites,0);
 const cleared=maintain({mode:'clear',expectedSha:current.snapshotSha,nextGateSha:newGate});
 assert.equal(writes,beforeClear+1);assert.equal(cleared.cleared.cases,4);assert.equal(cleared.remainingCases,0);
 assert.equal(cleared.remainingPdfCopies,0);assert.equal(cleared.gateRotationRequired,true);
 assert.equal(cleared.availability.length,2);assert.ok(matrix.slice(1).every(r=>r.every(x=>x==='')));
 assert.equal(matrix[0][0],'STUDY1_E1_SYNTHETIC_CASES_V1');assert.equal(matrix[0][1],storeId);assert.equal(matrix[0][2],'gate:'+newGate);
 assert.throws(()=>maintain({mode:'preview'}),/MARKER_OR_FORMULA/);
 assert.throws(()=>tx(()=>({index:0,record:record(0)})),/MARKER_OR_FORMULA/);
 const fresh={...approved,gateSha:newGate},runNew=(fn,m)=>realm.study1UatStoreTransaction_(svc,fresh,fn,m);
 runNew(()=>({index:0,record:record(0)}));const freshPreview=runNew(null,{mode:'preview'});
 failFlush=true;assert.throws(()=>runNew(null,{mode:'clear',expectedSha:freshPreview.snapshotSha,nextGateSha:newerGate}),/UAT_CLEANUP_UNKNOWN_READBACK/);failFlush=false;
 assert.throws(()=>runNew(null,{mode:'preview'}),/MARKER_OR_FORMULA/);
 const audit=realm.study1UatStoreTransaction_(svc,{...approved,gateSha:newerGate},null,{mode:'preview'});
 assert.equal(audit.counts.cases,0);assert.equal(held,false);
 const auditBefore=writes,stable=JSON.stringify(matrix),auditSvc={...svc,checkReconcileConfig:()=>assert.equal(held,true)};
 const reconcile=gateSha=>realm.study1UatStoreTransaction_(auditSvc,{...approved,gateSha},null,{mode:'reconcile'});
 assert.equal(reconcile(newGate).state,'CONFIG_MISMATCH_EMPTY');assert.equal(reconcile(newerGate).state,'MATCHED_EMPTY');
 assert.equal(reconcile(newGate).readOnly,true);assert.doesNotMatch(JSON.stringify(reconcile(newGate)),/gateSha|storeId|tokenHash/);
 assert.equal(writes,auditBefore);assert.equal(JSON.stringify(matrix),stable);
 hasFormula=true;assert.throws(()=>reconcile(newGate),/MARKER_OR_FORMULA/);hasFormula=false;
 matrix[1][0]='FORMAL_OR_UNKNOWN';assert.throws(()=>reconcile(newGate),/RECONCILE_UNVERIFIED/);matrix[1][0]='';
 assert.throws(()=>realm.study1UatStoreTransaction_({...svc,checkReconcileConfig:()=>{throw Error('CONFIG_STALE');}},fresh,null,{mode:'reconcile'}),/CONFIG_STALE/);
 assert.equal(writes,auditBefore);assert.equal(held,false);
 realm.study1UatStoreTransaction_(svc,{...approved,gateSha:newerGate},()=>({index:0,record:record(0)}));
 assert.equal(reconcile(newerGate).state,'MATCHED_NONEMPTY');
 const nonempty=realm.study1UatStoreTransaction_(svc,{...approved,gateSha:newerGate},null,{mode:'preview'});
 const recoverySvc={...svc,beforeCleanup:()=>assert.equal(held,true),afterCleanup:()=>true};
 const recovery={mode:'recover_gate',expectedSha:nonempty.snapshotSha,nextGateSha:'f'.repeat(64)};
 const before=writes;
 assert.throws(()=>realm.study1UatStoreTransaction_(recoverySvc,{...approved,gateSha:newerGate},null,recovery),/REQUIRES_EMPTY/);
 assert.equal(writes,before);
 // Independent empty-store fixture, preserving header and all case cells.
 matrix[1]=Array(9).fill('');
 const empty=realm.study1UatStoreTransaction_(svc,{...approved,gateSha:newerGate},null,{mode:'preview'});
 const req={...recovery,expectedSha:empty.snapshotSha};
 assert.throws(()=>realm.study1UatStoreTransaction_(svc,{...approved,gateSha:newerGate},null,req),/LIFECYCLE/);
 assert.throws(()=>realm.study1UatStoreTransaction_(recoverySvc,{...approved,gateSha:newGate},null,req),/MARKER_OR_FORMULA/);
 assert.equal(writes,before);
 const headerSvc={...recoverySvc,getSheet:()=>({...sheet,getRange:(r,c,n,m)=>{
  const rr=sheet.getRange(r,c,n,m);return {...rr,setValues:v=>{assert.deepEqual([r,c,n,m],[1,1,1,9]);rr.setValues(v);}};
 }})};
 const restored=realm.study1UatStoreTransaction_(headerSvc,{...approved,gateSha:newerGate},null,req);
 assert.equal(restored.gateRecovered,true);assert.equal(restored.remainingCases,0);
 assert.equal(matrix[0][2],'gate:'+req.nextGateSha);assert.ok(matrix.slice(1).every(r=>r.every(x=>x==='')));
 assert.equal(writes,before+1);assert.equal(held,false);
});

test('internal GAS service binding authorizes only own case with explicit gate, real service method contract and no full snapshot return',()=>{
 const vm=require('node:vm'),id='TEST_ONLY_BOOK_123456789012345',gate='a'.repeat(64),keyA='b'.repeat(64),keyB='c'.repeat(64);
 const config={storeId:id,gateSha:hash(gate),sourceSha:'d'.repeat(64),slots:[['TEST_SLOT_1','2099-01-01T02:00:00.000Z','2099-01-01T03:00:00.000Z',1,'TEST_ONLY','OPEN','TEST','2026-11-17T00:00:00.000Z']]};
 const matrix=[['STUDY1_E1_SYNTHETIC_CASES_V1',id,...Array(7).fill('')],...Array.from({length:12},()=>Array(9).fill(''))];
 let locked=false,lockCalls=0,opens=0,writes=0,flushes=0,wrongName=false,extraSheet=false;
 const sheet={getName:()=> 'SYNTHETIC_CASES',getParent:()=>({getId:()=>id}),getLastRow:()=>13,getLastColumn:()=>9,
  getRange:(row,col,n,m)=>({getValues:()=>matrix.slice(row-1,row-1+n).map(r=>r.slice(col-1,col-1+m)),getFormulas:()=>Array.from({length:n},()=>Array(m).fill('')),setValues:v=>{assert.equal(locked,true);writes++;matrix[row-1]=v[0].slice();}})};
 const realm=vm.createContext({Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},computeDigest:(_,b)=>Array.from(crypto.createHash('sha256').update(Buffer.from(b)).digest()),base64Decode:s=>Array.from(Buffer.from(s,'base64'))},
  LockService:{getScriptLock:()=>{lockCalls++;return {tryLock:()=>{if(locked)return false;locked=true;return true;},hasLock:()=>locked,releaseLock:()=>{locked=false;}}}},
  SpreadsheetApp:{openById:x=>{assert.equal(locked,true);assert.equal(x,id);opens++;return {getId:()=>id,getName:()=>wrongName?'Wrong book':'Study1 E1 SYNTHETIC UAT ONLY',getSheets:()=>extraSheet?[sheet,sheet]:[sheet]};},flush:()=>{assert.equal(locked,true);flushes++;}}});
 for(const p of ['gas/BookingCore.js','gas/Study1PdfStampCore.js','scripts/study1-v2-uat-store-transaction.js','scripts/study1-v2-uat-gas-services.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',p),'utf8'),realm);
 const tx=(caseKey,fn,accessGate=gate,approved=config)=>realm.study1UatGasCaseTransaction_(approved,{gate:accessGate,caseKey},fn);
 const create=(k,alias)=>{const tokenHash=hash(k);return {alias,caseId:'UAT_'+tokenHash.slice(0,24),tokenHash,state:'OTP',slotId:'',holdUntil:'',holdKey:'',sourceSha:'',signedSha:'',signKey:'',inkSha:'',signedAt:'',date:'',pdf:''};};
 const peek=mine=>({record:null,value:mine?{caseId:mine.caseId}:null});
 assert.throws(()=>tx(keyA,peek,'f'.repeat(64)),/UAT_ACCESS_DENIED/);assert.equal(opens,0);assert.equal(lockCalls,0);
 assert.throws(()=>tx(gate,peek),/UAT_ACCESS_DENIED/);
 assert.throws(()=>tx(keyA,peek,gate,{...config,unexpected:true}),/UAT_SERVER_CONFIG_REQUIRED/);
 wrongName=true;assert.throws(()=>tx(keyA,peek),/UAT_STORE_IDENTITY/);wrongName=false;
 extraSheet=true;assert.throws(()=>tx(keyA,peek),/UAT_STORE_IDENTITY/);extraSheet=false;
 assert.equal(writes,0);assert.equal(locked,false);
 const a=create(keyA,'TEST_01'),b=create(keyB,'TEST_02');
 assert.equal(tx(keyA,mine=>{assert.equal(mine,null);return {record:a,value:a.caseId};}),a.caseId);
 assert.equal(tx(keyB,peek),null);
 assert.throws(()=>tx(keyB,()=>({record:a,value:null})),/UAT_CASE_BINDING/);
 assert.throws(()=>tx(keyB,()=>({record:{...b,alias:'TEST_01'},value:null})),/UAT_CASE_UNAVAILABLE/);
 assert.equal(tx(keyB,()=>({record:b,value:b.caseId})),b.caseId);
 assert.equal(tx(keyA,peek).caseId,a.caseId);assert.equal(tx(keyB,peek).caseId,b.caseId);
 assert.throws(()=>tx(keyA,()=>({record:b,value:null})),/UAT_CASE_BINDING/);
 assert.equal(writes,2);assert.equal(flushes,2);assert.equal(locked,false);
 assert.ok(!JSON.stringify(matrix).includes(gate));assert.ok(!JSON.stringify(matrix).includes(keyA));assert.ok(!JSON.stringify(matrix).includes(keyB));
 const beforeOwner=opens;realm.study1AdminOwnerRequired_=()=>{throw Error('OWNER_DENIED');};
 realm.study1UatTrustedConfig_=()=>{throw Error('must not read config before owner');};
 assert.throws(()=>realm.study1UatCleanup_({mode:'preview'}),/OWNER_DENIED/);assert.equal(opens,beforeOwner);
});

test('GAS authorized case projection excludes stored credentials and only returns a verified complete PDF copy',async()=>{
 const vm=require('node:vm'),realm=vm.createContext({Date,Uint8Array,Utilities:{
  DigestAlgorithm:{SHA_256:'SHA_256'},computeDigest:(_,b)=>Array.from(crypto.createHash('sha256').update(Buffer.from(b)).digest()),
  base64Decode:s=>Array.from(Buffer.from(s,'base64')),formatDate:()=> '2026/11/18'
 }});
 for(const p of ['gas/Study1PdfLib.js','gas/Study1PdfStampCore.js','scripts/study1-v2-uat-session.js','scripts/study1-v2-uat-gas-services.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',p),'utf8'),realm);
 const original=await vm.runInContext('study1UatDocument_("GAS_UAT")',realm);
 const at=Date.parse('2026-11-18T02:00:00.000Z'),slots=[['TEST_SLOT_1','2026-11-19T02:00:00.000Z','2026-11-19T03:00:00.000Z',1,'TEST_ONLY','OPEN','TEST','2026-11-18T02:00:00.000Z']];
 realm.args=JSON.stringify({source:original.bytes,ink:Array.from(syntheticInk()),layout:original.layout,sha:original.hash,at:new Date(at).toISOString()});
 const signed=await vm.runInContext('(async()=>{const x=JSON.parse(args);return study1PdfComposeSigned_(x.source,x.ink,x.layout,{experiment:"E1",version:"UAT-SYNTHETIC-1",sha256:x.sha},new Date(x.at));})()',realm);
 const held={alias:'TEST_01',caseId:'UAT_'+'a'.repeat(24),tokenHash:'b'.repeat(64),state:'HELD',slotId:'TEST_SLOT_1',holdUntil:new Date(at+600000).toISOString(),holdKey:'c'.repeat(32),sourceSha:original.hash,signedSha:'',signKey:'',inkSha:'',signedAt:'',date:'',pdf:''};
 const view=realm.study1UatCaseView_,copy=realm.study1UatCaseCopy_;
 assert.equal(view(held,slots,at).bookingStatus,'HELD');
 assert.equal(view(held,slots,at+600000).bookingStatus,'EXPIRED');
 assert.equal(held.state,'HELD');
 assert.throws(()=>view(null,slots,at),/UAT_CASE_NOT_FOUND/);
 assert.throws(()=>view(held,[],at),/UAT_CASE_SLOT/);
 assert.throws(()=>view(held,[...slots,...slots],at),/UAT_CASE_SLOT/);
 await assert.rejects(copy(held,slots,at),/UAT_COPY_NOT_CONFIRMED/);
 const record={...held,state:'CONFIRMED',signedSha:signed.signedSha256,signKey:'d'.repeat(32),inkSha:hash(syntheticInk()),signedAt:signed.serverSignedAt,date:signed.taipeiDate,pdf:Buffer.from(signed.signedPdfBytes).toString('base64')};
 const summary=view(record,slots,at);
 assert.equal(summary.stage,'DONE');assert.equal(summary.pageCount,null);
 for(const k of ['tokenHash','holdKey','signKey','inkSha','pdf','bytes'])assert.equal(Object.hasOwn(summary,k),false);
 const receipt=await copy(record,slots,at);
 assert.equal(receipt.caseId,record.caseId);assert.equal(receipt.formal,false);assert.equal(receipt.persisted,true);assert.equal(receipt.pageCount,5);assert.equal(receipt.bytes,record.pdf);assert.equal(hash(Buffer.from(receipt.bytes,'base64')),receipt.sha);
 for(const k of ['tokenHash','holdKey','signKey','inkSha','pdf'])assert.equal(Object.hasOwn(receipt,k),false);
 await assert.rejects(copy({...record,pdf:Buffer.from('wrong').toString('base64')},slots,at),/UAT_PDF_INTEGRITY/);
 const one=await PDFLib.PDFDocument.create();one.addPage();const oneBytes=Buffer.from(await one.save());
 await assert.rejects(copy({...record,pdf:oneBytes.toString('base64'),signedSha:hash(oneBytes)},slots,at),/UAT_PDF_PAGE_COUNT/);
});

test('private GAS operation contract completes booking and real five-page PDF through bound service; denies wrong cases and unknown writes',async()=>{
 const vm=require('node:vm'),id='TEST_ONLY_BOOK_123456789012345',gate='a'.repeat(64),keyA='b'.repeat(64),keyB='c'.repeat(64),keyC='d'.repeat(64);
 const start=Date.parse('2026-11-18T02:00:00.000Z');let clock=start;
 class FakeDate extends Date{static now(){return clock;}}
 const matrix=[['STUDY1_E1_SYNTHETIC_CASES_V1',id,...Array(7).fill('')],...Array.from({length:12},()=>Array(9).fill(''))];
 let locked=false,opens=0,writes=0,failFlush=false;
 const sheet={getName:()=> 'SYNTHETIC_CASES',getParent:()=>({getId:()=>id}),getLastRow:()=>13,getLastColumn:()=>9,
  getRange:(row,col,n,m)=>({getValues:()=>matrix.slice(row-1,row-1+n).map(r=>r.slice(col-1,col-1+m)),getFormulas:()=>Array.from({length:n},()=>Array(m).fill('')),setValues:v=>{assert.equal(locked,true);writes++;matrix[row-1]=v[0].slice();}})};
 const realm=vm.createContext({Date:FakeDate,Uint8Array,Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},computeDigest:(_,b)=>Array.from(crypto.createHash('sha256').update(Buffer.from(b)).digest()),base64Decode:s=>Array.from(Buffer.from(s,'base64')),base64Encode:b=>Buffer.from(b).toString('base64'),formatDate:()=> '2026/11/18'},
  LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},hasLock:()=>locked,releaseLock:()=>{locked=false;}})},
  SpreadsheetApp:{openById:x=>{assert.equal(locked,true);assert.equal(x,id);opens++;return {getId:()=>id,getName:()=> 'Study1 E1 SYNTHETIC UAT ONLY',getSheets:()=>[sheet]};},flush:()=>{assert.equal(locked,true);if(failFlush)throw Error('UNKNOWN');}}});
 for(const p of ['gas/BookingCore.js','gas/Study1PdfLib.js','gas/Study1PdfStampCore.js','scripts/study1-v2-uat-session.js','scripts/study1-v2-uat-store-transaction.js','scripts/study1-v2-uat-gas-services.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',p),'utf8'),realm);
 const original=await vm.runInContext('study1UatDocument_("GAS_UAT")',realm);
 const config={storeId:id,gateSha:hash(gate),sourceSha:original.hash,slots:[
  ['TEST_SLOT_1','2026-11-19T02:00:00.000Z','2026-11-19T03:00:00.000Z',1,'TEST_ONLY','OPEN','TEST','2026-11-18T02:00:00.000Z'],
  ['TEST_SLOT_2','2026-11-19T04:00:00.000Z','2026-11-19T05:00:00.000Z',1,'TEST_ONLY','OPEN','TEST','2026-11-18T02:00:00.000Z']]};
 const run=(key,op,p={},g=gate)=>realm.study1UatGasOperation_(config,{gate:g,caseKey:key},op,p);
 await assert.rejects(run(keyA,'start',{alias:'TEST_01',eligible:true},'e'.repeat(64)),/UAT_ACCESS_DENIED/);assert.equal(opens,0);
 await assert.rejects(run(keyA,'start',{alias:'TEST_01',eligible:true,email:'not allowed'}),/UAT_REQUEST/);
 await assert.rejects(run(keyA,'start',{alias:'REAL_PERSON',eligible:true}),/UAT_SYNTHETIC_IDENTITY_REQUIRED/);
 assert.equal(writes,0);
 const a=await run(keyA,'start',{alias:'TEST_01',eligible:true});
 assert.equal(a.stage,'OTP');assert.equal((await run(keyA,'start',{alias:'TEST_01',eligible:true})).caseId,a.caseId);assert.equal(writes,1);
 await assert.rejects(run(keyB,'start',{alias:'TEST_01',eligible:true}),/UAT_CASE_UNAVAILABLE/);
 await assert.rejects(run(keyA,'verify',{code:'00000000'}),/UAT_SYNTHETIC_OTP_INVALID/);
 await assert.rejects(run(keyA,'document'),/UAT_HOLD_REQUIRED/);
 const slotList=await run(keyA,'verify',{code:'12345678'});assert.equal(slotList.length,2);
 await run(keyB,'start',{alias:'TEST_02',eligible:true});await run(keyB,'verify',{code:'12345678'});
 const hold={slotId:'TEST_SLOT_1',requestId:'1'.repeat(32)};
 const h=await run(keyA,'hold',hold);assert.equal(h.bookingStatus,'HELD');const n=writes;
 assert.equal((await run(keyA,'hold',hold)).caseId,a.caseId);assert.equal(writes,n);
 await assert.rejects(run(keyB,'hold',hold),/UAT_SLOT_UNAVAILABLE/);
 const doc=await run(keyA,'document');assert.equal(doc.caseId,a.caseId);assert.equal(doc.sha,original.hash);assert.equal(doc.pageCount,5);assert.equal(hash(Buffer.from(doc.bytes,'base64')),doc.sha);
 const sign={requestId:'2'.repeat(32),sourceSha:doc.sha,ink:Buffer.from(syntheticInk()).toString('base64'),read:true,agree:true};
 await assert.rejects(run(keyA,'sign',{...sign,agree:false}),/UAT_DOCUMENT_BINDING/);
 await assert.rejects(run(keyA,'sign',{...sign,sourceSha:'f'.repeat(64)}),/UAT_DOCUMENT_BINDING/);
 await assert.rejects(run(keyA,'sign',{...sign,ink:'AAAA'}),/UAT_INK/);
 await assert.rejects(run(keyB,'copy'),/UAT_COPY_NOT_CONFIRMED/);
 failFlush=true;await assert.rejects(run(keyA,'sign',sign),/UAT_WRITE_UNKNOWN_READ_CASE/);failFlush=false;
 assert.equal(locked,false);const read=await run(keyA,'read');assert.equal(read.stage,'DONE');
 const receipt=await run(keyA,'copy');assert.equal(receipt.bookingStatus,'CONFIRMED');assert.equal(receipt.caseId,a.caseId);assert.equal(receipt.sourceSha,doc.sha);assert.equal(receipt.sha,read.signedSha);assert.equal(hash(Buffer.from(receipt.bytes,'base64')),receipt.sha);
 assert.equal((await PDFLib.PDFDocument.load(Buffer.from(receipt.bytes,'base64'))).getPageCount(),5);
 const after=writes;assert.equal((await run(keyA,'sign',sign)).sha,receipt.sha);assert.equal(writes,after);
 await assert.rejects(run(keyA,'sign',{...sign,requestId:'3'.repeat(32)}),/UAT_SIGN_REPLAY_CONFLICT/);
 await assert.rejects(run(keyA,'cancel'),/UAT_CONFIRMED_IMMUTABLE/);
 const h2=await run(keyB,'hold',{slotId:'TEST_SLOT_2',requestId:'4'.repeat(32)});assert.equal(h2.bookingStatus,'HELD');
 clock+=600001;assert.equal((await run(keyB,'read')).bookingStatus,'EXPIRED');
 await assert.rejects(run(keyB,'sign',sign),/UAT_HOLD_REQUIRED/);
 await run(keyC,'start',{alias:'TEST_03',eligible:true});await run(keyC,'verify',{code:'12345678'});
 await run(keyC,'hold',{slotId:'TEST_SLOT_2',requestId:'5'.repeat(32)});assert.equal((await run(keyC,'cancel')).bookingStatus,'CANCELLED');
 // A cleanup between PDF parsing and its return invalidates the old request.
 const reopen=realm.study1UatCaseCopy_;
 realm.study1UatCaseCopy_=async(...args)=>{
  const result=await reopen(...args);
  const nextGate=hash('e'.repeat(64));
  // Simulate the atomic header rotation actually verified in the range test.
  matrix[0]=['STUDY1_E1_SYNTHETIC_CASES_V1',id,'gate:'+nextGate,
   'reset:'+new Date(clock).toISOString(),'cases:3','holds:0','confirmed:1','pdf:1',''];
  for(let i=1;i<matrix.length;i++)matrix[i]=Array(9).fill('');
  return result;
 };
 await assert.rejects(run(keyA,'copy'),/MARKER_OR_FORMULA/);
 await assert.rejects(run(keyA,'start',{alias:'TEST_01',eligible:true}),/MARKER_OR_FORMULA/);
 realm.study1UatCaseCopy_=reopen;
 assert.ok(!JSON.stringify(matrix).includes(gate));assert.ok(!JSON.stringify(matrix).includes(keyA));
});

test('trusted UAT configuration and narrow request envelope fail closed without exposing raw service errors',async()=>{
 const vm=require('node:vm'),id='TEST_ONLY_BOOK_123456789012345',gate='a'.repeat(64),key='b'.repeat(64),now=Date.parse('2026-11-17T01:00:00.000Z'),iso=t=>new Date(t).toISOString();
 class FakeDate extends Date{static now(){return now;}}
 const config={profile:'E1_SYNTHETIC_UAT_V1',storeId:id,sourceSha:'c'.repeat(64),gateSha:hash(gate),expiresAt:iso(now+86400000),slots:[['TEST_SLOT_1',iso(now+7200000),iso(now+10800000),1,'TEST_ONLY','OPEN','TEST',iso(now)]]};
 const realm=vm.createContext({Date:FakeDate,Uint8Array,Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},computeDigest:(_,b)=>Array.from(crypto.createHash('sha256').update(Buffer.from(b)).digest())}});
 for(const p of ['gas/Study1PdfStampCore.js','scripts/study1-v2-uat-gas-services.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',p),'utf8'),realm);
 const validate=(c,fp=hash(id))=>realm.study1UatConfigValidate_(JSON.stringify(c),now,fp);
 assert.equal(validate(config).storeId,id);
 assert.equal(Object.hasOwn(validate(config),'expiresAt'),false);
 for(const bad of [{...config,profile:'FORMAL'},{...config,storeId:'OTHER_BOOK_123456789012345'},{...config,expiresAt:iso(now)},{...config,expiresAt:iso(now+8*86400000)},{...config,gate:gate},{...config,slots:[...config.slots,...config.slots]},{...config,slots:[config.slots[0].map((x,i)=>i===4?'REAL_PLACE':x)]},{...config,gateSha:config.sourceSha}]){
  assert.throws(()=>validate(bad),/UAT_SERVER_CONFIG_REQUIRED/);
 }
 assert.throws(()=>validate(config,'d'.repeat(64)),/UAT_SERVER_CONFIG_REQUIRED/);
 let propertyReads=0,scriptId='WRONG';realm.ScriptApp={getScriptId:()=>scriptId};
 realm.PropertiesService={getScriptProperties:()=>({getProperty:k=>{propertyReads++;assert.equal(k,'STUDY1_E1_SYNTHETIC_UAT_V1');return JSON.stringify(config);}})};
 assert.throws(()=>realm.study1UatTrustedConfig_(),/UAT_SERVER_CONFIG_REQUIRED/);assert.equal(propertyReads,0);
 scriptId='1qg3PuI8sGFOAP-pJ889d9RrN0p_e0zsfqM274HgG4sEg9Qjv-xzqeL2f';
 assert.throws(()=>realm.study1UatTrustedConfig_(),/UAT_SERVER_CONFIG_REQUIRED/);assert.equal(propertyReads,1); // mock ID cannot match real pinned store
 let calls=0;realm.study1UatTrustedConfig_=()=>validate(config);
 realm.study1UatGasOperation_=async(c,a,op,p)=>{calls++;assert.equal(c.storeId,id);assert.equal(a.gate,gate);assert.equal(a.caseKey,key);assert.equal(op,'read');assert.equal(Object.keys(p).length,0);return {caseId:'UAT_TEST',formal:false};};
 const req={gate,caseKey:key,operation:'read',payload:{}};
 for(const bad of [{...req,storeId:id},{...req,gate:key},{...req,operation:'FORMAL'},{...req,caseKey:'bad'},{...req,payload:[]}]){
  const ans=await realm.study1UatControlledRequest_(bad);assert.equal(ans.ok,false);assert.equal(ans.error,'UAT_REQUEST_REJECTED');
 }
 assert.equal(calls,0);
 assert.equal((await realm.study1UatControlledRequest_(req)).value.caseId,'UAT_TEST');assert.equal(calls,1);
 realm.study1UatGasOperation_=async()=>{throw Error('private secret '+id+' '+gate);};
 const rejected=await realm.study1UatControlledRequest_(req);assert.equal(rejected.error,'UAT_REQUEST_REJECTED');assert.ok(!JSON.stringify(rejected).includes(id));
 realm.study1UatGasOperation_=async()=>{throw Error('UAT_WRITE_UNKNOWN_READ_CASE');};
 assert.equal((await realm.study1UatControlledRequest_(req)).error,'UAT_WRITE_UNKNOWN_READ_CASE');
});

test('reviewable online UAT candidate uses original apply template, owner boundary and only the isolated RPC',async()=>{
 const vm=require('node:vm'),core=require('../scripts/study1-v2-release-source.cjs'),adapter=require('../scripts/study1-v2-uat-original-visitor.cjs');
 const base=core.localSources(),candidate=adapter.onlineCandidate(base),get=(a,id)=>a.find(f=>f.name===id).source;
 assert.equal(core.closedManifest(candidate).webapp.access,'MYSELF');assert.equal(candidate.length,base.length+3);
 const added=candidate.filter(f=>!base.some(x=>x.name===f.name));
 for(const file of added){
  const names=[...file.source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m=>m[1]);
  assert.ok(names.length>0&&names.every(n=>n.endsWith('_')),file.name);
 }
 assert.doesNotMatch(get(candidate,'Study1UatSession'),/function study1UatSession\(/);
 assert.match(get(candidate,'Study1UatSession'),/function study1UatDocument_\(/);
 assert.equal(core.closedManifest(base).webapp.access,'ANYONE');assert.ok(core.publicRpcSurface(base)>=35);
 assert.throws(()=>core.publicRpcSurface(candidate),/formal visitor is not isolated|unguarded public RPC/);
 for(const f of base.filter(f=>!['Website','Study1Visitor','appsscript'].includes(f.name)))assert.equal(get(candidate,f.name),f.source);
 const html=get(candidate,'Study1Visitor'),original=get(base,'Study1Visitor');
 assert.ok(original.includes('data-site-mode="FORMAL"'));assert.ok(html.includes('data-site-mode="GAS_UAT"'));
 for(const id of ['choose','screen','otp','slots','confirm','consent','done'])assert.ok(html.includes('id="step-'+id+'"'));
 for(const id of ['visitorSignaturePreview','officialPdfViewer','formalDonePdfDownload','testAlias','uatGate','caseKey'])assert.ok(html.includes('id="'+id+'"'));
 assert.doesNotMatch(html,/id="(?:formalName|formalEmail|formalPhone|screenQuestions|chooseE2)"|study1ParticipantBegin|study1FormalHoldSlot|localStorage|sessionStorage/);
 assert.equal((html.match(/<script>/g)||[]).length,1);const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];new vm.Script(js);
 let active='',effective='',configs=0,requests=0,served=0;
 const ctx=vm.createContext({Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},study1UatTrustedConfig_:()=>{configs++;return {};},
  study1UatControlledRequest_:async request=>{requests++;return {ok:true,value:request.operation};},
  HtmlService:{createTemplateFromFile(name){served++;return {name,evaluate(){return {name,mode:this.flowMode,setTitle(){return this;},addMetaTag(){return this;}}}}}}});
 vm.runInContext(get(candidate,'AdminSandbox'),ctx);
 vm.runInContext(get(candidate,'Website'),ctx);
 const owner=vm.runInContext('STUDY1_ADMIN_OWNER_',ctx);
 for(const pair of [['',owner],['other@example.invalid',owner],[owner,''],[owner,'other@example.invalid'],['',''],['other@example.invalid','other@example.invalid']]){
  [active,effective]=pair;
  assert.throws(()=>ctx.doGet({parameter:{view:'apply'}}),/拒絕存取/);assert.equal(configs,0);assert.equal(served,0);
  assert.equal((await ctx.study1E1SyntheticUat({operation:'read'})).ok,false);assert.equal(requests,0);
 }
 active=effective=owner;const page=ctx.doGet({parameter:{view:'apply'}});assert.equal(page.name,'Study1Visitor');assert.equal(page.mode,'GAS_UAT');assert.equal(configs,1);
 assert.equal((await ctx.study1E1SyntheticUat({operation:'read'})).value,'read');assert.equal(requests,1);
 assert.throws(()=>ctx.requestOtp(),/尚未開放/);assert.throws(()=>ctx.submitConsent(),/尚未開放/);assert.equal(ctx.getPublicConfig().open,false);
 for(const view of ['admin','team','preview','demo'])assert.throws(()=>ctx.doGet({parameter:{view}}),/PUBLIC_READ_ONLY/);
});
test('original seven-step GAS controller uses narrow RPC, blocks ambiguous mutation and verifies complete same-case PDF',async()=>{
 const vm=require('node:vm'),adapter=require('../scripts/study1-v2-uat-original-visitor.cjs'),{gasController}=adapter,nodes=new Map(),calls=[],revoked=[];
 // Constrain the mock to the real assembled HTML rather than auto-creating arbitrary missing IDs.
 const markup=adapter.originalVisitor().split('<script>')[0];
 const ids=[...markup.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)].map(m=>m[2]);
 assert.equal(new Set(ids).size,ids.length,'candidate contains duplicate element IDs');
 const actualIds=new Set(ids);
 const full=await PDFLib.PDFDocument.create();for(let i=0;i<5;i++)full.addPage();const original=Buffer.from(await full.save()),sourceSha=hash(original);
 full.getPage(4).drawText('TEST');const signed=Buffer.from(await full.save()),signedSha=hash(signed);
 const el=id=>{assert.ok(actualIds.has(id),'controller references absent candidate HTML ID: '+id);if(!nodes.has(id))nodes.set(id,{value:'',checked:false,hidden:false,disabled:false,textContent:'',children:[],classList:{toggle(){}},listeners:{},
  addEventListener(n,fn){this.listeners[n]=fn;},removeAttribute(n){delete this[n]},replaceChildren(){this.children=[];this.value='';},appendChild(n){this.children.push(n);if(!this.value)this.value=n.value;},
  getContext(){return {fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}}},getBoundingClientRect(){return {left:0,top:0,width:700,height:160}},setPointerCapture(){},width:700,height:160,
  toDataURL(){return 'data:image/png;base64,'+syntheticInk().toString('base64');}});return nodes.get(id);};
 const doc={body:{dataset:{siteMode:'GAS_UAT'}},getElementById:el,createElement:()=>({value:'',textContent:''})};
 let state='OTP',wrongOriginal=false,loseHold=true,loseSign=true;
 const request=r=>{
  calls.push(r.operation);assert.deepEqual(Object.keys(r).sort(),['caseKey','gate','operation','payload']);assert.equal(r.gate,'a'.repeat(64));
  const caseId='UAT_'+hash(r.caseKey).slice(0,24),summary=()=>({caseId,alias:'TEST_01',formal:false,persisted:true,stage:state==='CONFIRMED'?'DONE':state,bookingStatus:state,
   slotId:'TEST_SLOT_1',startAtUtc:'2026-11-19T02:00:00.000Z',endAtUtc:'2026-11-19T03:00:00.000Z',holdUntil:'2026-11-19T02:10:00.000Z',sourceSha,signedSha:state==='CONFIRMED'?signedSha:null}),
   available=[{slotId:'TEST_SLOT_1',startAtUtc:'2026-11-19T02:00:00.000Z',endAtUtc:'2026-11-19T03:00:00.000Z',remaining:1}];
  if(r.operation==='start')return summary();
  if(r.operation==='verify'){state='SLOTS';return available;}
  if(r.operation==='slots')return available;
  if(r.operation==='hold'){state='HELD';if(loseHold){loseHold=false;throw Error('unknown committed');}return summary();}
  if(r.operation==='read')return summary();
  if(r.operation==='document')return {caseId:wrongOriginal?'UAT_wrong':caseId,sha:sourceSha,pageCount:5,bytes:original.toString('base64')};
  if(r.operation==='sign'){state='CONFIRMED';if(loseSign){loseSign=false;throw Error('unknown committed');}}
  if(r.operation==='copy'||r.operation==='sign')return {...summary(),sha:signedSha,bytes:signed.toString('base64'),pageCount:5,date:'2026/11/19'};
  throw Error('unexpected request');
 };
 const google={script:{run:{withFailureHandler(f){return {withSuccessHandler(s){return {study1E1SyntheticUat(r){try{s({ok:true,value:request(r)});}catch(e){f(e);}}};}};}}}};
 const ctx=vm.createContext({document:doc,window:{google,addEventListener(){}},google,crypto:crypto.webcrypto,TextEncoder,Uint8Array,Intl,Date,Blob,atob,
  URL:{createObjectURL:()=> 'blob:verified-'+calls.length,revokeObjectURL:u=>revoked.push(u)}});
 vm.runInContext('('+gasController.toString()+')();',ctx);
 const click=id=>el(id).listeners.click();
 el('uatGate').value='a'.repeat(64);el('testAlias').value='TEST_01';el('fictionalEligible').checked=true;
 await click('chooseE1');await click('screenNext');assert.equal(el('step-otp').hidden,false);
 el('otpInput').value='bad';await click('otpVerify');assert.deepEqual(calls,['start']);
 el('otpInput').value='12345678';await click('otpVerify');assert.equal(el('step-slots').hidden,false);
 await click('hold');await click('hold');assert.equal(calls.filter(x=>x==='hold').length,1);
 await click('readCase');assert.equal(el('step-confirm').hidden,false);
 wrongOriginal=true;await click('confirm');assert.equal(el('step-consent').hidden,true);assert.equal(el('officialPdfDownload').href,undefined);
 wrongOriginal=false;await click('confirm');assert.equal(el('step-consent').hidden,false);assert.match(el('officialPdfDownload').href,/blob:verified/);
 const event=(x,y)=>({clientX:x,clientY:y,pointerId:1,preventDefault(){}});
 el('visitorSignaturePreview').listeners.pointerdown(event(0,0));el('visitorSignaturePreview').listeners.pointermove(event(40,40));
 el('readPdf').checked=true;el('agree').checked=true;await click('finish');await click('finish');assert.equal(calls.filter(x=>x==='sign').length,1);
 assert.equal(el('step-done').hidden,true);await click('readCase');assert.equal(el('step-done').hidden,false);assert.equal(el('formalDonePages').textContent,'5');assert.equal(el('formalDonePdfSha').textContent,signedSha);assert.ok(revoked.length>0);
 assert.equal(calls.at(-1),'copy');
 const formal=vm.createContext({document:{body:{dataset:{siteMode:'FORMAL'}},getElementById(){throw Error('must not touch formal DOM');}}});
 vm.runInContext('('+gasController.toString()+')();',formal);
});

test('release preflight identifies exact deterministic private candidate and synthetic source, without credentials or remote mutation',async()=>{
 const vm=require('node:vm'),core=require('../scripts/study1-v2-release-source.cjs'),adapter=require('../scripts/study1-v2-uat-original-visitor.cjs');
 const base=core.localSources(),candidate=adapter.onlineCandidate(base),get=(a,n)=>a.find(f=>f.name===n).source;
 const candidateSha=core.digest(candidate),baselineSha=core.digest(base);
 assert.equal(candidateSha,core.digest(adapter.onlineCandidate(base)));
 // The last locally reviewed profile cannot change the resulting UAT bytes.
 // This is NOT a remote mutation mode or an authorization to reuse a release.
 assert.equal(candidateSha,core.digest(adapter.onlineCandidate()));
 const anonymous=core.anonymousReadOnlyCandidate(base),management=core.privateOwnerManagementCandidate(base);
 for(const previous of [anonymous,management,[...anonymous].reverse()]){
  assert.deepEqual(adapter.onlineCandidate(previous),candidate);
 }
 for(const previous of [base,anonymous,management]){
  const changed=previous.map(f=>f.name==='Index'?{...f,source:f.source+'\n<!-- drift -->'}:f);
  assert.throws(()=>adapter.onlineCandidate(changed),/UAT_BASE_INVENTORY/);
 }
 assert.throws(()=>adapter.onlineCandidate(candidate),/UAT_BASE_INVENTORY/);
 assert.throws(()=>core.requireReviewedInventory(candidate),/allowlist/);

 assert.notEqual(candidateSha,baselineSha);
 assert.equal(candidate.length,30);
 assert.deepEqual(base.filter(f=>get(candidate,f.name)!==f.source).map(f=>f.name).sort(),['Study1Visitor','Website','appsscript']);
 assert.deepEqual(candidate.filter(f=>!base.some(x=>x.name===f.name)).map(f=>f.name).sort(),['Study1UatGasServices','Study1UatSession','Study1UatStoreTransaction']);
 assert.ok(base.every(f=>!f.source.includes('STUDY1_E1_SYNTHETIC_UAT_V1')));
 const manifest=core.closedManifest(candidate);
 assert.equal(manifest.webapp.access,'MYSELF');assert.equal(manifest.webapp.executeAs,'USER_DEPLOYING');assert.equal(manifest.timeZone,'Asia/Taipei');assert.equal(manifest.runtimeVersion,'V8');
 for(const file of candidate.filter(f=>f.type==='SERVER_JS'))new vm.Script(file.source,{filename:file.name+'.gs'});
 assert.throws(()=>core.publicRpcSurface(candidate),/formal visitor is not isolated|unguarded public RPC/);
 const realm=vm.createContext({Date,Uint8Array,Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},computeDigest:(_,b)=>Array.from(crypto.createHash('sha256').update(Buffer.from(b)).digest())}});
 for(const name of ['BookingCore','Study1PdfLib','Study1PdfStampCore','Study1UatSession','Study1UatStoreTransaction','Study1UatGasServices'])vm.runInContext(get(candidate,name),realm);
 const doc=await vm.runInContext('study1UatDocument_("GAS_UAT")',realm),second=await vm.runInContext('study1UatDocument_("GAS_UAT")',realm);
 assert.equal(doc.hash,second.hash);assert.equal(doc.hash,hash(Buffer.from(doc.bytes)));assert.deepEqual(doc.bytes,second.bytes);
 assert.equal((await PDFLib.PDFDocument.load(Buffer.from(doc.bytes))).getPageCount(),5);
 const at=Date.parse('2026-11-17T02:00:00.000Z'),iso=t=>new Date(t).toISOString(),fakeStore='TEST_ONLY_PREFLIGHT_BOOK_1234567890';
 const config={profile:'E1_SYNTHETIC_UAT_V1',storeId:fakeStore,gateSha:hash('a'.repeat(64)),sourceSha:doc.hash,expiresAt:iso(at+86400000),slots:[1,2,3,4].map((n,i)=>['TEST_SLOT_'+n,iso(at+3600000*(2+i*2)),iso(at+3600000*(3+i*2)),1,'TEST_ONLY','OPEN','TEST',iso(at)])};
 const raw=JSON.stringify(config);assert.ok(Buffer.byteLength(raw,'utf8')<=6000);
 const approved=realm.study1UatConfigValidate_(raw,at,hash(fakeStore));
 assert.equal(approved.sourceSha,doc.hash);assert.equal(approved.slots.length,4);
 // Print only reproducible non-secret evidence; no real config, keys, IDs, or PDF bytes.
 console.log('UAT_RELEASE_PREFLIGHT '+JSON.stringify({baselineSha,candidateSha,sourceSha:doc.hash,sourceBytes:doc.bytes.length,pages:5,files:candidate.length,access:manifest.webapp.access,executeAs:manifest.webapp.executeAs,configExampleBytes:Buffer.byteLength(raw,'utf8'),remoteMutations:false}));
});

test('same official site source routes preserve formal closure and require real OWNER for test and cleanup',async()=>{
 const vm=require('node:vm'),core=require('../scripts/study1-v2-release-source.cjs'),adapter=require('../scripts/study1-v2-uat-original-visitor.cjs');
 const files=adapter.sameSiteCandidate(),get=n=>files.find(f=>f.name===n).source;
 assert.equal(JSON.parse(get('appsscript')).webapp.access,'ANYONE_ANONYMOUS');
 // Review evidence only: this does NOT enroll the candidate in any release
 // profile or authorize a remote mutation. Compare every file against the
 // existing anonymous closed baseline, not the superseded MYSELF build.
 const baseline=core.anonymousReadOnlyCandidate(core.localSources()),baseNames=baseline.map(f=>f.name).sort();
 const extra=['Study1UatGasServices','Study1UatSession','Study1UatStoreTransaction'];
 assert.deepEqual(files.map(f=>f.name).sort(),[...baseNames,...extra].sort());
 const modified=baseline.filter(f=>get(f.name)!==f.source).map(f=>f.name).sort();
 assert.deepEqual(modified,['AdminConsole','Study1Visitor','Website']);
 for(const f of baseline)assert.equal(files.find(x=>x.name===f.name).type,f.type);
 assert.equal(get('appsscript'),baseline.find(f=>f.name==='appsscript').source);
 const globals=source=>[...source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m=>m[1]).filter(n=>!n.endsWith('_')).sort();
 const oldGlobals=globals(baseline.find(f=>f.name==='Website').source);
 assert.deepEqual(globals(get('Website')),[...oldGlobals,'study1E1SyntheticUat','study1SiteTestCleanup'].sort());
 for(const name of extra)assert.deepEqual(globals(get(name)),[]);
 const candidateSha=core.digest(files);
 assert.match(candidateSha,/^[a-f0-9]{64}$/);
 assert.equal(candidateSha,core.digest(adapter.sameSiteCandidate()));
 console.log('SAME_SITE_REVIEW_ONLY '+JSON.stringify({candidateSha256:candidateSha,fileCount:files.length,modified,added:extra,access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING',releaseAuthorized:false}));
 assert.throws(()=>core.publicRpcSurface(files));
 assert.throws(()=>core.requireReviewedInventory(files),/allowlist/);
 const html=get('Study1Visitor'),admin=get('AdminConsole');
 assert.match(html,/<\? if \(flowMode === 'GAS_UAT'\) \{ \?>/);
 assert.match(html,/data-site-mode="FORMAL"/);assert.match(html,/data-site-mode="GAS_UAT"/);
 assert.match(html,/view=apply&test=1/);assert.match(admin,/siteTestClear/);
 assert.doesNotMatch(admin,/adminSaveSandboxConfig|study1ConsentVersionUpload|adminRunSandboxSelfTest/);
 for(const f of files.filter(x=>x.type==='SERVER_JS'))new vm.Script(f.source,{filename:f.name});
 for(const text of [html,admin])for(const m of text.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
 let active='',effective='',config=0,requests=0,maintenance=[],opened=[];
 const c=vm.createContext({Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
  HtmlService:{createTemplateFromFile(name){opened.push(name);return {evaluate(){return {name,mode:this.flowMode,siteOwner:this.siteOwner,setTitle(){return this;},addMetaTag(){return this;}};}}}},
  Utilities:{getUuid:()=> 'mock-only-uuid',DigestAlgorithm:{SHA_256:'SHA_256'},computeDigest:(_,b)=>Array.from(crypto.createHash('sha256').update(Buffer.from(b)).digest())}});
 for(const n of ['AdminSandbox','Study1PdfStampCore','Study1UatGasServices','Website'])vm.runInContext(get(n),c);
 const owner=vm.runInContext('STUDY1_ADMIN_OWNER_',c);
 c.study1UatTrustedConfig_=()=>{config++;return {};};
 c.study1UatControlledRequest_=async r=>{requests++;return {ok:true,value:r.operation};};
 c.study1UatCleanup_=m=>{maintenance.push(JSON.parse(JSON.stringify(m)));return {scope:'SYNTHETIC_CASES_ONLY'};};
 const propKey='STUDY1_E1_SYNTHETIC_UAT_V1',future=new Date(Date.now()+3600000).toISOString();
 let raw=JSON.stringify({gateSha:'d'.repeat(64),expiresAt:future,otherTestSetting:'preserve'}),propWrites=0;
 const props={getProperty:k=>{assert.equal(k,propKey);return raw;},setProperty:(k,v)=>{assert.equal(k,propKey);raw=v;propWrites++;}};
 c.study1UatTrustedConfigSnapshot_=()=>({props,raw,approved:{gateSha:JSON.parse(raw).gateSha,storeId:'TEST_MOCK_BOOK'}});
 c.study1UatStoreServices_=id=>{assert.equal(id,'TEST_MOCK_BOOK');return {};};
 c.study1UatStoreTransaction_=(services,approved,choose,m)=>{
  assert.equal(choose,null);
  if(m.mode==='reconcile'){services.checkReconcileConfig();return {formal:false,scope:'SYNTHETIC_CASES_ONLY',state:'MATCHED_EMPTY',readOnly:true};}
  services.beforeCleanup();maintenance.push(JSON.parse(JSON.stringify(m)));
  assert.equal(services.afterCleanup(),true);return {gateRotationRequired:false};
 };
 for(const [user,runner] of [['',owner],['other@example.invalid',owner],[owner,'other@example.invalid'],[owner,'']]){
  active=user;effective=runner;
  const form=c.doGet({parameter:{view:'apply'}});assert.equal(form.mode,'FORMAL');assert.equal(form.siteOwner,false);
  assert.throws(()=>c.doGet({parameter:{view:'apply',test:'1'}}),/拒絕存取/);
  assert.throws(()=>c.doGet({parameter:{view:'admin'}}),/拒絕存取/);
  assert.equal((await c.study1E1SyntheticUat({operation:'start'})).ok,false);
  assert.equal(c.study1SiteTestCleanup({mode:'preview'}).ok,false);
  assert.equal(c.study1SiteTestCleanup({mode:'reconcile'}).ok,false);
  assert.equal(c.study1SiteTestCleanup({mode:'recover_gate',expectedSha:'a'.repeat(64),confirmation:'RECOVER_EMPTY_TEST_GATE',entropy:'b'.repeat(64)}).ok,false);
 }
 assert.equal(config,0);assert.equal(requests,0);assert.equal(maintenance.length,0);assert.ok(!opened.includes('AdminConsole'));
 active=owner;effective=owner;const page=c.doGet({parameter:{view:'apply',test:'1'}});assert.equal(page.mode,'GAS_UAT');assert.equal(page.name,'Study1Visitor');
 assert.equal(c.doGet({parameter:{view:'admin'}}).name,'AdminConsole');
 assert.equal((await c.study1E1SyntheticUat({operation:'read'})).value,'read');
 assert.equal(c.study1SiteTestCleanup({mode:'preview'}).ok,true);
 assert.equal(c.study1SiteTestCleanup({mode:'reconcile'}).value.state,'MATCHED_EMPTY');
 assert.equal(c.study1SiteTestCleanup({mode:'reconcile',storeId:'OTHER'}).ok,false);assert.equal(propWrites,0);
 const sha='a'.repeat(64);
 for(const input of [{mode:'clear',expectedSha:sha},{mode:'clear',expectedSha:sha,confirmation:'CLEAR_TEST_ONLY',storeId:'OTHER'},
   {mode:'clear',expectedSha:sha,confirmation:'CLEAR_TEST_ONLY',nextGateSha:sha}])
  assert.equal(c.study1SiteTestCleanup(input).ok,false);
 assert.equal(maintenance.length,1);
 const cleared=c.study1SiteTestCleanup({mode:'clear',expectedSha:sha,confirmation:'CLEAR_TEST_ONLY',entropy:'b'.repeat(64)});
 assert.equal(cleared.ok,true);assert.match(cleared.value.replacementGate,/^[a-f0-9]{64}$/);
 assert.equal(maintenance.length,2);assert.equal(maintenance[1].expectedSha,sha);assert.match(maintenance[1].nextGateSha,/^[a-f0-9]{64}$/);
 assert.equal(propWrites,1);assert.equal(JSON.parse(raw).gateSha,hash(cleared.value.replacementGate));assert.equal(JSON.parse(raw).otherTestSetting,'preserve');
 assert.equal(c.study1SiteTestCleanup({mode:'recover_gate',expectedSha:sha,confirmation:'CLEAR_TEST_ONLY',entropy:'b'.repeat(64)}).ok,false);
 const restored=c.study1SiteTestCleanup({mode:'recover_gate',expectedSha:sha,confirmation:'RECOVER_EMPTY_TEST_GATE',entropy:'b'.repeat(64)});
 assert.equal(restored.ok,true);assert.equal(maintenance.at(-1).mode,'recover_gate');assert.equal(propWrites,2);assert.equal(JSON.parse(raw).gateSha,hash(restored.value.replacementGate));
 assert.throws(()=>c.requestOtp(),/尚未開放/);assert.throws(()=>c.submitConsent(),/尚未開放/);assert.equal(c.getPublicConfig().open,false);
 for(const view of ['team','preview','demo'])assert.throws(()=>c.doGet({parameter:{view}}),/PUBLIC_READ_ONLY/);
});
test('same-site assembler source contract rejects unreviewed inventory, bytes, types and RPC deltas',()=>{
 const core=require('../scripts/study1-v2-release-source.cjs'),adapter=require('../scripts/study1-v2-uat-original-visitor.cjs');
 const baseline=core.anonymousReadOnlyCandidate(),target=adapter.sameSiteCandidate();
 const prove=files=>adapter.requireSameSiteSourceDelta(baseline,files);
 assert.equal(prove(target),core.digest(target));
 const change=(name,fn)=>target.map(f=>f.name===name?fn({...f}):f);
 const restore=name=>change(name,f=>({...f,source:baseline.find(b=>b.name===name).source}));
 for(const [files,reason] of [
  [[...target,{name:'Unreviewed',type:'SERVER_JS',source:'function extra_(){}'}],/candidate inventory/],
  [target.filter(f=>f.name!=='Study1UatSession'),/candidate inventory/],
  [change('BookingCore',f=>({...f,source:f.source+'\n// unreviewed change'})),/unexpected source changes/],
  [change('appsscript',f=>({...f,source:f.source+' '})),/unexpected source changes/],
  [change('AdminConsole',f=>({...f,type:'SERVER_JS'})),/file type changed/],
  [restore('Website'),/unexpected source changes/],
  [change('Website',f=>({...f,source:f.source+'\nfunction unreviewedRpc(){}'})),/unexpected Website RPC change/],
  [change('Study1UatSession',f=>({...f,type:'HTML'})),/unexpected kernel surface/],
  [change('Study1UatStoreTransaction',f=>({...f,source:f.source+'\nfunction unreviewedRpc(){}'})),/unexpected kernel surface/]
 ])assert.throws(()=>prove(files),reason);
 assert.throws(()=>core.requireReviewedInventory(target),/allowlist/);
 assert.throws(()=>core.publicRpcSurface(target));
});
test('same-site admin preview and confirm button block unknown destructive retries',async()=>{
 const vm=require('node:vm'),adapter=require('../scripts/study1-v2-uat-original-visitor.cjs'),nodes=new Map(),requests=[];
 let confirmed=false,fail=false;
 for(const id of ['siteTestPreview','siteTestClear','siteTestCleanupSummary','siteTestNewGate','siteTestCases','siteTestSlots','siteTestRecoverGate'])nodes.set(id,{disabled:false,textContent:'',addEventListener(n,fn){this[n]=fn;}});
 const counts={cases:2,holds:1,confirmed:1,pdfs:1},sha='b'.repeat(64);
 const cases=[{alias:'TEST_01',state:'HELD',slotId:'TEST_SLOT_1',pdfSaved:false},{alias:'TEST_02',state:'CONFIRMED',slotId:'TEST_SLOT_2',pdfSaved:true}];
 const slots=[1,2].map(n=>({slotId:'TEST_SLOT_'+n,startAtUtc:'2099-01-01T02:00:00.000Z',endAtUtc:'2099-01-01T03:00:00.000Z',capacity:1,occupied:1,remaining:0,bookable:false}));
 let badPreview=false,emptyPreview=false;
 const google={script:{run:{withFailureHandler(f){return {withSuccessHandler(s){return {study1SiteTestCleanup(r){
  requests.push(JSON.parse(JSON.stringify(r)));if(r.mode==='preview')s({ok:true,value:{formal:false,scope:'SYNTHETIC_CASES_ONLY',snapshotSha:sha,counts:emptyPreview?{cases:0,holds:0,confirmed:0,pdfs:0}:counts,cases:emptyPreview?[]:badPreview?[{...cases[0],tokenHash:'secret'},cases[1]]:cases,slots:emptyPreview?slots.map(x=>({...x,occupied:0,remaining:1,bookable:true})):slots}});
  else if(r.mode==='reconcile')s({ok:true,value:{formal:false,scope:'SYNTHETIC_CASES_ONLY',state:'CONFIG_MISMATCH_EMPTY',readOnly:true}});
  else if(fail)f(Error('UNKNOWN'));else if(r.mode==='recover_gate')s({ok:true,value:{formal:false,scope:'SYNTHETIC_CASES_ONLY',gateRecovered:true,remainingCases:0,gateRotationRequired:false,replacementGate:'d'.repeat(64)}});else s({ok:true,value:{formal:false,scope:'SYNTHETIC_CASES_ONLY',cleared:counts,remainingCases:0,remainingPdfCopies:0,gateRotationRequired:false,replacementGate:'c'.repeat(64)}});
 }};}};}}}};
 const run=()=>vm.runInNewContext('('+adapter.sameSiteCleanupController.toString()+')();',{document:{getElementById:id=>nodes.get(id)},window:{google,confirm:()=>confirmed,crypto:{getRandomValues:a=>a.fill(1)},addEventListener(){}},google});
 run();const p=nodes.get('siteTestPreview'),c=nodes.get('siteTestClear'),s=nodes.get('siteTestCleanupSummary');
 assert.equal(c.disabled,true);await c.click();assert.equal(requests.length,0);await p.click();assert.equal(c.disabled,false);
 assert.match(nodes.get('siteTestCases').textContent,/TEST_02｜已確認/);assert.match(nodes.get('siteTestSlots').textContent,/剩餘 0/);
 await c.click();assert.equal(requests.length,1);confirmed=true;fail=true;await c.click();assert.equal(c.disabled,true);assert.match(s.textContent,/不重送/);
 await p.click();assert.equal(c.disabled,true);assert.equal(requests.at(-1).mode,'reconcile');assert.match(s.textContent,/不一致/);await c.click();assert.equal(requests.filter(r=>r.mode==='clear').length,1);
 fail=false;run();await p.click();await c.click();assert.equal(c.disabled,true);assert.match(s.textContent,/已核實清除/);
 assert.deepEqual(requests.filter(r=>r.mode==='clear').at(-1),{mode:'clear',expectedSha:sha,confirmation:'CLEAR_TEST_ONLY',entropy:'01'.repeat(32)});
 assert.equal(nodes.get('siteTestNewGate').value,'c'.repeat(64));assert.match(nodes.get('siteTestCases').textContent,/無測試案件/);
 badPreview=true;run();await p.click();assert.equal(c.disabled,true);assert.match(nodes.get('siteTestCases').textContent,/尚未核實/);assert.doesNotMatch(nodes.get('siteTestCases').textContent,/secret/);
 badPreview=false;emptyPreview=true;run();await p.click();const recover=nodes.get('siteTestRecoverGate');assert.equal(c.disabled,true);assert.equal(recover.disabled,false);
 await recover.click();assert.equal(recover.disabled,true);assert.match(s.textContent,/沒有刪除案件/);assert.equal(nodes.get('siteTestNewGate').value,'d'.repeat(64));
 assert.deepEqual(requests.at(-1),{mode:'recover_gate',expectedSha:sha,confirmation:'RECOVER_EMPTY_TEST_GATE',entropy:'01'.repeat(32)});
});

test('same-site post-release evidence checks original URL, immutable content and every other deployment without authorization or mutations',()=>{
 const core=require('../scripts/study1-v2-release-source.cjs'),d=require('../scripts/study1-v2-release-evidence.cjs');
 const adapter=require('../scripts/study1-v2-uat-original-visitor.cjs');
 const baseline=core.anonymousReadOnlyCandidate(),target=adapter.sameSiteCandidate(),privateFiles=core.privateOwnerManagementCandidate(core.localSources());
 const reviewedTargetSha256=core.digest(target),content=files=>({scriptId:core.SID,files});
 const version=n=>({scriptId:core.SID,versionNumber:n,createTime:'2026-11-17T00:00:00Z',description:'TEST '+n});
 const dep=(id,n,access)=>({deploymentId:id,deploymentConfig:{scriptId:core.SID,...(n===null?{}:{versionNumber:n}),manifestFileName:'appsscript',description:'TEST'},entryPoints:[{entryPointType:'WEB_APP',webApp:{entryPointConfig:{access,executeAs:'USER_DEPLOYING'},url:'https://script.google.com/macros/s/'+id+'/exec'}}]});
 const prior=dep('TEST_OFFICIAL',2,'ANYONE_ANONYMOUS'),current=dep('TEST_OFFICIAL',3,'ANYONE_ANONYMOUS');
 const others=[dep('TEST_DEV',null,'ANYONE_ANONYMOUS'),dep('TEST_PRIVATE',1,'MYSELF')];
 const oldProofs=[{version:1,...d.sourceProof(content(privateFiles),true)},{version:2,...d.sourceProof(content(baseline),true)}];
 const snapshot=(files,versions,deps,proofs,safe)=>{const head=content(files),headSha=core.digest(files);return {head,headSha,versions,deps,proofs,safe,fp:d.fingerprint(versions,deps,headSha,proofs,true)};};
 const before=snapshot(baseline,[version(1),version(2)],[...others,prior],oldProofs,true);
 const newProof={version:3,...d.sourceProof(content(target),true)};
 assert.equal(newProof.known,false); // unchanged legacy guard
 const after=snapshot(target,[version(1),version(2),version(3)],[...others,current],[...oldProofs,newProof],false);
 const input={before,after,priorDirect:prior,currentDirect:current,newContent:content(target),reviewedTargetSha256};
 const verify=x=>adapter.verifySameSiteReadback(x);
 const receipt=verify(input);
 assert.deepEqual(receipt,{readbackVerified:true,releaseAuthorized:false,runtimeVerified:false,sameOfficialUrl:true,otherDeploymentsUnchanged:true,historicalVersionsUnchanged:true,version:3,sourceSha256:reviewedTargetSha256});
 assert.doesNotMatch(JSON.stringify(receipt),/TEST_OFFICIAL|TEST_PRIVATE|scriptId|https:/);
 const mutate=fn=>{const s=structuredClone(input);fn(s);if(s.after)s.after.fp=d.fingerprint(s.after.versions,s.after.deps,s.after.headSha,s.after.proofs,true);return s;};
 const targetDep=s=>s.after.deps.find(x=>x.deploymentId==='TEST_OFFICIAL');
 for(const bad of [
  x=>{x.reviewedTargetSha256='0'.repeat(64);},
  x=>{x.before.safe=false;},
  x=>{targetDep(x).entryPoints[0].webApp.url='https://script.google.com/macros/s/WRONG/exec';},
  x=>{x.currentDirect.deploymentConfig.versionNumber=2;},
  x=>{x.priorDirect.deploymentId='WRONG';},
  x=>{x.after.deps.push(dep('TEST_EXTRA',2,'ANYONE_ANONYMOUS'));},
  x=>{x.after.deps.find(y=>y.deploymentId==='TEST_PRIVATE').deploymentConfig.description='changed';},
  x=>{x.after.versions[0].description='changed';},
  x=>{x.after.proofs[0].sha='0'.repeat(64);},
  x=>{x.newContent=content(baseline);},
  x=>{x.after.headSha=core.digest(baseline);},
  x=>{x.newContent.scriptId='OTHER';}
 ])assert.throws(()=>verify(mutate(bad)));
 assert.throws(()=>core.requireReviewedInventory(target),/allowlist/);
 assert.throws(()=>core.publicRpcSurface(target));
});


test('single lifecycle local check uses current same-site candidate without release permission',async()=>{
 const lifecycle=require('../scripts/study1-v2-release-lifecycle.cjs');
 const core=require('../scripts/study1-v2-release-source.cjs');
 const adapter=require('../scripts/study1-v2-uat-original-visitor.cjs');
 const {receipt,state}=await lifecycle.check('check');
 assert.equal(state,undefined);
 assert.deepEqual(receipt.candidate,{sourceSha256:core.digest(adapter.sameSiteCandidate()),fileCount:adapter.sameSiteCandidate().length,profile:'SAME_SITE_REVIEW_ONLY'});
 assert.deepEqual(receipt.stages,{check:'COMPLETED',deploy:'BLOCKED_PENDING_INDEPENDENT_PERMISSION',rollback:'BLOCKED_PENDING_INDEPENDENT_PERMISSION'});
 assert.equal(receipt.releaseAuthorized,false);assert.equal(receipt.writeAuthorized,false);assert.equal(receipt.runtimeVerified,false);assert.equal(receipt.mutationPerformed,false);
 const {spawnSync}=require('node:child_process');
 const script=require('node:path').join(__dirname,'../scripts/study1-v2-release-lifecycle.cjs');
 const ok=spawnSync(process.execPath,[script,'check'],{encoding:'utf8'});
 assert.equal(ok.status,0,ok.stderr);assert.deepEqual(JSON.parse(ok.stdout),receipt);
 for(const args of [['deploy'],['rollback'],['check','remote']]){
  const denied=spawnSync(process.execPath,[script,...args],{encoding:'utf8'});
  assert.equal(denied.status,1);assert.match(denied.stderr,/V2_RELEASE_CLI_LOCAL_CHECK_ONLY/);
 }
});
