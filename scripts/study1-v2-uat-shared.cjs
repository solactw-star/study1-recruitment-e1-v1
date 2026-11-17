'use strict';
// OFFLINE UAT only. No Google credentials, production IDs, external calls or GAS deployment.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite'),http=require('node:http');
const base=require('./study1-v2-uat-page.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const iso=t=>new Date(t).toISOString();
const assert=(ok,code)=>{if(!ok){const e=new Error(code);e.uat=true;throw e;}};
const aliases=Array.from({length:12},(_,i)=>'TEST_'+String(i+1).padStart(2,'0'));
const tokenOk=t=>typeof t==='string'&&/^[a-f0-9]{64}$/.test(t);
const idOk=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const clockDefault=()=>Date.now();
function pdfRuntime(){
 const box=vm.createContext({crypto:crypto.webcrypto,Uint8Array,Date,Intl,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../gas/Study1PdfLib.js'),'utf8'),box);
 const code=base.kernel();
 vm.runInContext(code,box);return box;
}
function dedicatedDir(dir){
 // No arbitrary database filename accepted. Only new empty directories or our marked UAT directory.
 if(!dir)dir=fs.mkdtempSync(path.join(os.tmpdir(),'study1-uat-'));
 const p=path.resolve(dir);
 if(!fs.existsSync(p))fs.mkdirSync(p,{mode:0o700});
 assert(fs.lstatSync(p).isDirectory()&&!fs.lstatSync(p).isSymbolicLink(),'TEST_DIRECTORY_REQUIRED');
 const mark=path.join(p,'.study1-synthetic-only'),allowed=new Set(['.study1-synthetic-only','study1-test.sqlite','study1-test.sqlite-wal','study1-test.sqlite-shm','study1-test.sqlite-journal']);
 const list=fs.readdirSync(p);
 if(!list.length)fs.writeFileSync(mark,'Study1 isolated synthetic UAT v1\n',{flag:'wx',mode:0o600});
 assert(fs.existsSync(mark)&&fs.readFileSync(mark,'utf8')==='Study1 isolated synthetic UAT v1\n','TEST_DIRECTORY_REQUIRED');
 assert(fs.readdirSync(p).every(n=>allowed.has(n)&&fs.lstatSync(path.join(p,n)).isFile()&&!fs.lstatSync(path.join(p,n)).isSymbolicLink()),'TEST_DIRECTORY_REQUIRED');
 return p;
}
async function openStore({dir,clock=clockDefault}={}){
 const folder=dedicatedDir(dir),file=path.join(folder,'study1-test.sqlite');
 if(!fs.existsSync(file))fs.closeSync(fs.openSync(file,'wx',0o600));
 const db=new DatabaseSync(file);const box=pdfRuntime();
 const now=()=>{const t=clock();assert(Number.isSafeInteger(t),'INVALID_CLOCK');return t;};
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
 const get=(sql,...args)=>db.prepare(sql).get(...args);
 const all=(sql,...args)=>db.prepare(sql).all(...args);
 const run=(sql,...args)=>db.prepare(sql).run(...args);
 try{
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
  const version=get('PRAGMA user_version').user_version;
  assert(version===0||version===1,'TEST_SCHEMA_REQUIRED');
  if(version===0){
   assert(all("SELECT name FROM sqlite_master WHERE type='table'").length===0,'TEST_SCHEMA_REQUIRED');
   const t=now(),s=box.study1UatSession(()=>t,'SHARED_LOCAL');s.screen(true);const slots=s.verify('12345678');s.hold(slots[0].slotId);const doc=await s.document();
   tx(()=>{
    assert(get('PRAGMA user_version').user_version===0,'TEST_INITIALIZATION_RACE_REOPEN');
    db.exec("CREATE TABLE source (id INTEGER PRIMARY KEY CHECK(id=1), bytes BLOB NOT NULL, sha TEXT NOT NULL); CREATE TABLE slots (id TEXT PRIMARY KEY,start TEXT NOT NULL,end TEXT NOT NULL,capacity INTEGER NOT NULL CHECK(capacity=1)); CREATE TABLE cases (id TEXT PRIMARY KEY,alias TEXT NOT NULL UNIQUE,token_hash TEXT NOT NULL UNIQUE,state TEXT NOT NULL CHECK(state IN ('OTP','SLOTS','HELD','EXPIRED','CANCELLED','CONFIRMED')),slot TEXT REFERENCES slots(id),hold_until INTEGER,hold_key TEXT,source_sha TEXT,sign_key TEXT,ink_sha TEXT,pdf BLOB,pdf_sha TEXT,signed_at TEXT,day TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,CHECK((state='CONFIRMED' AND pdf IS NOT NULL AND pdf_sha IS NOT NULL AND sign_key IS NOT NULL) OR (state<>'CONFIRMED' AND pdf IS NULL AND pdf_sha IS NULL))); PRAGMA user_version=1;");
    run('INSERT INTO source VALUES (1,?,?)',Buffer.from(doc.bytes),doc.sha);
    for(const x of slots)run('INSERT INTO slots VALUES (?,?,?,1)',x.slotId,x.startAtUtc,x.endAtUtc);
   });
  }
  const source=get('SELECT bytes,sha FROM source WHERE id=1');
  assert(source&&sha(source.bytes)===source.sha,'TEST_SOURCE_CORRUPT');
  const original=Buffer.from(source.bytes),sourceSha=source.sha;
  const layout=()=>({experiment:'E1',documentSha:sourceSha,version:'UAT-SYNTHETIC-1',pageCount:5,pageIndex:4,pageWidth:595,pageHeight:842,signature:{x:80,y:70,width:190,height:50},date:{x:350,y:87,fontSize:11}});
  const expire=t=>run("UPDATE cases SET state='EXPIRED',updated_at=? WHERE state='HELD' AND hold_until<=?",iso(t),t);
  const lookup=token=>{assert(tokenOk(token),'CASE_NOT_FOUND');const c=get('SELECT * FROM cases WHERE token_hash=?',sha(token));assert(c,'CASE_NOT_FOUND');return c;};
  const details=c=>{const s=c.slot?get('SELECT * FROM slots WHERE id=?',c.slot):null;return {caseId:c.id,alias:c.alias,stage:c.state==='CONFIRMED'?'DONE':c.state,bookingStatus:c.state,slotId:c.slot,startAtUtc:s?.start??null,endAtUtc:s?.end??null,holdUntil:c.hold_until?iso(c.hold_until):null,sourceSha:c.source_sha,signedSha:c.pdf_sha,signedAt:c.signed_at,date:c.day,pageCount:c.pdf?5:null,formal:false,persisted:true};};
  const capacity=t=>{
   const slots=all('SELECT * FROM slots ORDER BY id').map(s=>[s.id,s.start,s.end,s.capacity,'TEST_ONLY','OPEN','TEST',iso(t)]);
   const reservations=all("SELECT * FROM cases WHERE slot IS NOT NULL").map(c=>[c.id,c.alias,c.slot,c.state,c.hold_until?iso(c.hold_until):'',c.hold_key||'',c.created_at,c.state==='CONFIRMED'?c.signed_at:'','',c.updated_at]);
   return box.bookingComputeAvailability_(slots,reservations,iso(t));
  };
  const by=(token,fn)=>tx(()=>{const t=now();expire(t);return fn(lookup(token),t);});
  const copy=c=>{assert(c.state==='CONFIRMED'&&c.pdf&&sha(c.pdf)===c.pdf_sha,'COPY_NOT_AVAILABLE_OR_CORRUPT');return {...details(c),bytes:Buffer.from(c.pdf).toString('base64'),sha:c.pdf_sha};};
  const exact=(obj,keys)=>assert(obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).sort().join(',')===keys.slice().sort().join(','),'INVALID_TEST_REQUEST');
  async function dispatch(op,token,p){
   const keys={start:['alias','eligible'],verify:['code'],slots:[],hold:['slotId','requestId'],document:[],sign:['requestId','sourceSha','ink','read','agree'],read:[],copy:[],cancel:[]};
   assert(Object.hasOwn(keys,op),'INVALID_TEST_REQUEST');exact(p,keys[op]);assert(tokenOk(token),'CASE_NOT_FOUND');
   if(op==='start')return tx(()=>{
    assert(p.eligible===true&&aliases.includes(p.alias),'SYNTHETIC_IDENTITY_REQUIRED');
    const old=get('SELECT * FROM cases WHERE token_hash=?',sha(token));
    if(old){assert(old.alias===p.alias,'CASE_CONFLICT');return details(old);}
    assert(!get('SELECT id FROM cases WHERE alias=?',p.alias),'TEST_ALIAS_ALREADY_USED');
    const id='UAT_'+crypto.randomBytes(12).toString('hex'),t=iso(now());
    run("INSERT INTO cases(id,alias,token_hash,state,created_at,updated_at) VALUES (?,?,?,'OTP',?,?)",id,p.alias,sha(token),t,t);
    return details(lookup(token));
   });
   if(op==='verify')return by(token,(c,t)=>{
    assert(p.code==='12345678'&&['OTP','SLOTS'].includes(c.state),'SYNTHETIC_OTP_INVALID');
    if(c.state==='OTP')run("UPDATE cases SET state='SLOTS',updated_at=? WHERE id=?",iso(t),c.id);
    return capacity(t);
   });
   if(op==='slots')return by(token,(c,t)=>{assert(c.state==='SLOTS','CASE_STATE_CONFLICT');return capacity(t);});
   if(op==='read')return by(token,c=>details(c));
   if(op==='copy')return by(token,copy);
   if(op==='hold')return by(token,(c,t)=>{
    assert(idOk(p.requestId)&&typeof p.slotId==='string','INVALID_TEST_REQUEST');
    if(c.hold_key===p.requestId){assert(c.slot===p.slotId&&c.state==='HELD','HOLD_REPLAY_CONFLICT');return details(c);}
    assert(c.state==='SLOTS','CASE_ALREADY_HAS_RESERVATION');
    const slot=capacity(t).find(x=>x.slotId===p.slotId);assert(slot,'SLOT_UNAVAILABLE');
    run("UPDATE cases SET state='HELD',slot=?,hold_until=?,hold_key=?,source_sha=?,updated_at=? WHERE id=?",slot.slotId,t+600000,p.requestId,sourceSha,iso(t),c.id);
    return details(lookup(token));
   });
   if(op==='cancel')return by(token,(c,t)=>{
    assert(c.state!=='CONFIRMED','CONFIRMED_CASE_IMMUTABLE');
    if(c.state!=='CANCELLED')run("UPDATE cases SET state='CANCELLED',updated_at=? WHERE id=?",iso(t),c.id);
    return details(lookup(token));
   });
   if(op==='document')return by(token,c=>{
    assert(c.state==='HELD'&&c.source_sha===sourceSha&&sha(original)===sourceSha,'HOLD_REQUIRED');
    return {caseId:c.id,sha:sourceSha,pageCount:5,bytes:original.toString('base64')};
   });
   // Decode a bounded PNG, never accept a caller-supplied PDF, name, email, date or document path.
   assert(idOk(p.requestId)&&p.read===true&&p.agree===true&&p.sourceSha===sourceSha,'DOCUMENT_BINDING_REQUIRED');
   assert(typeof p.ink==='string'&&p.ink.length<=120000&&/^[A-Za-z0-9+/]+={0,2}$/.test(p.ink),'INVALID_TEST_INK');
   const ink=Buffer.from(p.ink,'base64');assert(ink.length>=100&&ink.length<=90000&&ink.toString('base64')===p.ink&&ink.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&ink.subarray(12,16).toString()==='IHDR'&&ink.readUInt32BE(16)<=700&&ink.readUInt32BE(20)<=160&&ink.readUInt32BE(16)>0&&ink.readUInt32BE(20)>0,'INVALID_TEST_INK');
   const inkSha=sha(ink);
   const replay=c=>{assert(c.sign_key===p.requestId&&c.ink_sha===inkSha&&c.source_sha===sourceSha,'SIGN_REPLAY_CONFLICT');return copy(c);};
   const initial=by(token,(c,t)=>{
    if(c.state==='CONFIRMED')return {replayed:replay(c)};
    assert(c.state==='HELD'&&c.source_sha===sourceSha&&c.hold_until>t,'HOLD_REQUIRED');
    return {id:c.id,slot:c.slot,holdKey:c.hold_key,at:t};
   });
   if(initial.replayed)return initial.replayed;
   const result=await box.study1PdfComposeSigned_(original,ink,layout(),{experiment:'E1',sha256:sourceSha,version:'UAT-SYNTHETIC-1'},new Date(initial.at));
   const bytes=Buffer.from(result.signedPdfBytes);
   assert(result.pageCount===5&&sha(bytes)===result.signedSha256&&bytes.length<=1000000,'SIGNED_PDF_CORRUPT');
   // Single transaction: PDF bytes, SHA, case state and reservation confirmation persist together.
   return by(token,(c,t)=>{
    if(c.state==='CONFIRMED')return replay(c);
    assert(c.id===initial.id&&c.state==='HELD'&&c.slot===initial.slot&&c.hold_key===initial.holdKey&&c.source_sha===sourceSha&&c.hold_until>t,'HOLD_CHANGED_OR_EXPIRED');
    run("UPDATE cases SET state='CONFIRMED',sign_key=?,ink_sha=?,pdf=?,pdf_sha=?,signed_at=?,day=?,updated_at=? WHERE id=?",p.requestId,inkSha,bytes,result.signedSha256,result.serverSignedAt,result.taipeiDate,iso(t),c.id);
    return copy(lookup(token));
   });
  }
  return {folder,dispatch,close:()=>db.close()};
 }catch(e){db.close();throw e;}
}
function sharedPage(){
 let h=base.build();const rep=(a,b)=>{assert(h.split(a).length===2,'UAT_UI_ANCHOR_CHANGED');h=h.replace(a,b);};
 rep('不寄信、不傳送、不保存至正式系統','不寄信、只傳至本機隔離測試服務、不保存至正式系統');
 rep('測試身分：TEST 參與者；信箱：participant@example.invalid。不輸入真實資料。','請選擇固定虛構身分，不輸入真實資料。');
 rep('<label class="check"><input id="fictionalEligible"','<label for="testAlias">虛構身分</label><select id="testAlias">'+aliases.map(a=>'<option>'+a+'</option>').join('')+'</select><label class="check"><input id="fictionalEligible"');
 rep('合成日期依本機日期建立。使用原 BookingCore 排除已滿場次；只有本頁容量，不與其他訪客共享。','共用測試時段及容量，伺服器會重新核實剩餘名額。');
 rep('<select id="slot"></select>','<select id="slot"></select><button id="refreshSlots" class="ghost">重新載入剩餘名額</button>');
 rep('時間為本機測試臺灣時間，不是正式伺服器證據。','使用本機驗收伺服器的臺灣日期，非正式研究證據。');
 rep('僅本頁測試，正式報名、共用容量、Sheets、Drive 與寄信尚未驗收。','測試預約及 PDF 已在隔離 SQLite 同案保存。正式 Sheets、Drive 及真人寄信尚未接入。');
 rep('重新整理即清除本頁紀錄','可用案件密鑰重新讀回隔離測試紀錄');
 rep('<p id="status"','<div class="box"><label for="caseKey">本案測試密鑰（請自行保存，不要分享）</label><input id="caseKey" type="password" autocomplete="off" maxlength="64"><button id="readCase" class="ghost">重新讀回本案</button><p id="caseSummary" class="help"></p></div><p id="status"');
 const old=fs.readFileSync(path.join(__dirname,'study1-v2-uat-ui.js'),'utf8');
 rep('<script>'+old+'\n</script>','<script>'+fs.readFileSync(path.join(__dirname,'study1-v2-uat-shared-ui.js'),'utf8')+'\n</script>');
 return h;
}
async function serve({dir,port=8765,clock}={}){
 const store=await openStore({dir,clock}),html=sharedPage();let active=0;
 const server=http.createServer(async(req,res)=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  const respond=(code,body,type='application/json')=>{res.writeHead(code,{...headers,'Content-Type':type});res.end(body);};
  if(req.headers.host!=='127.0.0.1:'+server.address().port)return respond(403,'{"error":"LOCAL_ONLY"}');
  if(req.method==='GET'&&req.url==='/')return respond(200,html,'text/html; charset=utf-8');
  if(req.method!=='POST'||req.url!=='/api'||(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)||req.headers['content-type']!=='application/json')return respond(403,'{"error":"LOCAL_ONLY"}');
  if(active>=8)return respond(429,'{"error":"TEST_BUSY"}');active++;
  try{
   const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>150000){respond(413,'{"error":"TEST_REQUEST_TOO_LARGE"}');return;}chunks.push(b);}
   const q=JSON.parse(Buffer.concat(chunks));assert(q&&Object.keys(q).sort().join(',')==='op,payload','INVALID_TEST_REQUEST');
   const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
   const data=await store.dispatch(q.op,token,q.payload);respond(200,JSON.stringify(data));
  }catch(e){respond(e.uat?409:400,JSON.stringify({error:e.uat?e.message:'TEST_REQUEST_FAILED'}));}finally{active--;}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);}).catch(e=>{store.close();throw e;});
 return {folder:store.folder,url:'http://127.0.0.1:'+server.address().port,close:async()=>{await new Promise((res,rej)=>server.close(e=>e?rej(e):res()));store.close();}};
}
module.exports={openStore,serve,sharedPage,aliases};
if(require.main===module){
 const args=process.argv.slice(2);if(args.length>1)throw Error('Usage: node scripts/study1-v2-uat-shared.cjs [dedicated-test-directory]');
 serve({dir:args[0]}).then(s=>{console.log('LOCAL TEST ONLY: '+s.url+'\nSynthetic DB directory: '+s.folder+'\nStop with Ctrl+C; reuse directory argument to read back.');}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
