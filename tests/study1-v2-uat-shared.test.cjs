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
   setValues:v=>{assert.equal(held,true);writes++;matrix[r-1]=v[0].slice();if(partial)matrix[r-1][1]='';}})};
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
 matrix[1][1]='pdf:AAAA';assert.throws(()=>tx(()=>null),/UAT_PDF_INTEGRITY/);
 assert.equal(held,false);
});
