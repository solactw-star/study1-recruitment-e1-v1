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
