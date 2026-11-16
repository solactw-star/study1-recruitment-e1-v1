'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const PDFLib=require('../gas/Study1PdfLib.js'),core=require('../scripts/study1-v2-gas-head-only.cjs'),u=require('../scripts/study1-v2-uat-page.cjs');
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

function harness(){let now=Date.parse('2026-11-16T16:30:00Z');const sandbox=vm.createContext({PDFLib,crypto:crypto.webcrypto,Uint8Array,Date,Intl});vm.runInContext(u.kernel(),sandbox);return {s:sandbox.study1UatSession(()=>now),advance:ms=>now+=ms};}
function held(s){s.screen(true);const slots=s.verify('12345678');assert.equal(slots.length,3);assert.ok(!slots.some(x=>x.slotId==='TEST_SLOT_1'));return s.hold(slots[0].slotId);}
test('isolated real five-page original and signed PDF with original booking availability and PDF core',async()=>{
 const {s}=harness();assert.throws(()=>s.screen(false));s.screen(true);assert.throws(()=>s.verify('00000000'));const list=s.verify('12345678');assert.equal(list.length,3);assert.throws(()=>s.hold('TEST_SLOT_1'));s.hold(list[0].slotId);assert.equal(s.status().bookingStatus,'HELD');assert.throws(()=>s.hold(list[1].slotId));
 const doc=await s.document();assert.equal((await PDFLib.PDFDocument.load(doc.bytes)).getPageCount(),5);assert.equal(doc.sha,crypto.createHash('sha256').update(doc.bytes).digest('hex'));
 await assert.rejects(s.sign(Uint8Array.from(syntheticInk()),false,true));await assert.rejects(s.sign(new Uint8Array(5),true,true));
 const result=await s.sign(Uint8Array.from(syntheticInk()),true,true);
 assert.equal(result.pageCount,5);assert.equal(result.booking.bookingStatus,'CONFIRMED');assert.equal(result.booking.persisted,false);assert.equal(result.booking.formal,false);assert.equal(result.date,'2026/11/17');assert.notEqual(result.sha,doc.sha);assert.equal(result.sha,crypto.createHash('sha256').update(result.bytes).digest('hex'));assert.equal((await PDFLib.PDFDocument.load(result.bytes)).getPageCount(),5);
 await assert.rejects(s.sign(Uint8Array.from(syntheticInk()),true,true));assert.throws(()=>s.cancel());
});
test('expired or cancelled holds cannot be signed',async()=>{const h=harness();held(h.s);await h.s.document();h.advance(600001);await assert.rejects(h.s.sign(Uint8Array.from(syntheticInk()),true,true),/expired/);assert.notEqual(h.s.status().bookingStatus,'CONFIRMED');const j=harness();held(j.s);await j.s.document();j.s.cancel();await assert.rejects(j.s.sign(Uint8Array.from(syntheticInk()),true,true));assert.equal(j.s.status().bookingStatus,'CANCELLED');});
test('single confirmed result even when signing twice concurrently',async()=>{const {s}=harness();held(s);await s.document();const ink=Uint8Array.from(syntheticInk());const r=await Promise.allSettled([s.sign(ink,true,true),s.sign(ink,true,true)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(s.status().bookingStatus,'CONFIRMED');});
test('candidate adds exact test route only, leaves originals and closed formal RPCs intact',()=>{
 const before=core.anonymousReadOnlyCandidate(),after=u.candidate();assert.equal(after.length,before.length+1);for(const f of before.filter(x=>x.name!=='Website'))assert.deepEqual(after.find(x=>x.name===f.name),f);
 const w=after.find(f=>f.name==='Website').source;const stub={HtmlService:{createHtmlOutputFromFile:n=>({name:n,setTitle(){return this},addMetaTag(){return this}})}};vm.createContext(stub);vm.runInContext(w,stub);assert.equal(stub.doGet({parameter:{view:'uat'}}).name,'Study1IsolatedUat');assert.throws(()=>stub.doGet({parameter:{view:'admin'}}),/READ_ONLY/);assert.equal(stub.getPublicConfig().open,false);assert.throws(()=>stub.requestOtp(),/尚未開放/);assert.throws(()=>stub.submitConsent(),/尚未開放/);
 const html=u.build();assert.equal(html,after.find(f=>f.name==='Study1IsolatedUat').source);assert.match(html,/隔離人工驗收/);assert.match(html,/UAT_NOT_CONSENT_signed.pdf/);assert.doesNotMatch(html,/\b(?:SpreadsheetApp|DriveApp|MailApp|PropertiesService|UrlFetchApp|localStorage|sessionStorage)\b|google\.script\.run|fetch\(/);assert.doesNotMatch(html,/<script[^>]+src=|<form\b/);for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);assert.equal(core.closedManifest(after,true).webapp.access,'ANYONE_ANONYMOUS');
});
