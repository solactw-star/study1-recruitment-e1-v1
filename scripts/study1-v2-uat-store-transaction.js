/* Internal synthetic-case storage transaction primitive for GAS-style ranges.
 * No public RPC, service lookup, credentials, spreadsheet selector from clients,
 * deployment, or formal data access. The caller supplies a separately approved
 * synthetic sheet and common script-lock factory, only after server authorization.
 * A single range write stores the booking and its complete signed file together.
 * LockService coordinates participating script writers, not external/manual editors.
 */
function study1UatStoreTransaction_(services,config,choose,maintenance){
 const need=(ok,msg)=>{if(!ok)throw Error(msg);};
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const hex=(s,n)=>typeof s==='string'&&s.length===n&&/^[a-f0-9]+$/.test(s);
 const width=9,count=12,chunk=40000;
 const keys=['alias','caseId','tokenHash','state','slotId','holdUntil','holdKey','sourceSha','signedSha','signKey','inkSha','signedAt','date','pdf'];
 const marker=['STUDY1_E1_SYNTHETIC_CASES_V1',config.storeId,...Array(7).fill('')];
 const slots=config.slots;
 const resetting=maintenance!==undefined;
 need(typeof config.storeId==='string'&&config.storeId.length>0&&hex(config.sourceSha,64)&&
  Array.isArray(slots)&&slots.length>0&&slots.length<=4&&slots.every(s=>Array.isArray(s)&&s.length===8&&/^TEST_SLOT_[1-4]$/.test(s[0])&&s[3]===1&&s[4]==='TEST_ONLY'),'UAT_STORE_CONFIG');
 need((resetting?choose===null:typeof choose==='function')&&typeof services.getLock==='function'&&typeof services.getSheet==='function'&&typeof services.flush==='function'&&typeof services.now==='function'&&typeof services.decode==='function'&&typeof services.digest==='function','UAT_STORE_INTERFACE');
 const iso=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
 // Reset is a distinct internal maintenance operation, not a normal case transition.
 // A rotated gate fingerprint in the header fences all pre-reset transactions,
 // including asynchronous PDF composition that reacquires this same lock.
 const currentMarker=(row,gateSha=config.gateSha)=>{
  if(equal(row,marker))return true;
  if(!Array.isArray(row)||row.length!==width||!hex(gateSha,64)||
     row[0]!==marker[0]||row[1]!==marker[1]||row[2]!=='gate:'+gateSha||
     typeof row[3]!=='string'||!row[3].startsWith('reset:')||!iso(row[3].slice(6))||row[8]!=='')return false;
  const n=(prefix,value)=>typeof value==='string'&&new RegExp('^'+prefix+':(?:[0-9]|1[0-2])$').test(value)?Number(value.slice(prefix.length+1)):-1;
  const cases=n('cases',row[4]),holds=n('holds',row[5]),confirmed=n('confirmed',row[6]),pdf=n('pdf',row[7]);
  return cases>=0&&holds>=0&&confirmed>=0&&pdf===confirmed&&holds+confirmed<=cases;
 };
 if(resetting){
  need(hex(config.gateSha,64)&&maintenance&&typeof maintenance==='object'&&!Array.isArray(maintenance),
   'UAT_CLEANUP_REQUEST');
  const k=Object.keys(maintenance).sort().join(',');
  need((maintenance.mode==='preview'&&k==='mode')||
   (maintenance.mode==='reconcile'&&k==='mode'&&typeof services.checkReconcileConfig==='function')||
   (maintenance.mode==='select_document'&&k==='expectedSha,mode,nextSourceSha'&&hex(maintenance.expectedSha,64)&&
    hex(maintenance.nextSourceSha,64)&&maintenance.nextSourceSha!==config.sourceSha&&maintenance.nextSourceSha!==config.gateSha&&typeof services.selectDocument==='function')||
   (['clear','recover_gate'].includes(maintenance.mode)&&k==='expectedSha,mode,nextGateSha'&&hex(maintenance.expectedSha,64)&&
    hex(maintenance.nextGateSha,64)&&maintenance.nextGateSha!==config.gateSha&&maintenance.nextGateSha!==config.sourceSha),
   'UAT_CLEANUP_REQUEST');
 }
 const validate=(c,i)=>{
  const fields=c&&Object.hasOwn(c,'emailOtp')?[...keys,'emailOtp']:keys;
  need(c&&typeof c==='object'&&!Array.isArray(c)&&equal(Object.keys(c).sort(),fields.slice().sort()),'UAT_CASE_SCHEMA');
  if(Object.hasOwn(c,'emailOtp')){
   const otp=c.emailOtp;
   need(otp&&equal(Object.keys(otp).sort(),['expiresAt','hash'])&&iso(otp.expiresAt)&&
    (c.state==='OTP'?hex(otp.hash,64):otp.hash===''),'UAT_EMAIL_OTP_SCHEMA');
  }
  need(c.alias==='TEST_'+String(i+1).padStart(2,'0')&&/^UAT_[a-f0-9]{24}$/.test(c.caseId)&&hex(c.tokenHash,64)&&
   ['OTP','SLOTS','HELD','CANCELLED','EXPIRED','CONFIRMED'].includes(c.state),'UAT_CASE_SCHEMA');
  const booked=c.slotId!=='';
  need(booked?slots.some(s=>s[0]===c.slotId)&&iso(c.holdUntil)&&hex(c.holdKey,32)&&c.sourceSha===config.sourceSha:
   c.holdUntil===''&&c.holdKey===''&&c.sourceSha===''&&!['HELD','EXPIRED','CONFIRMED'].includes(c.state),'UAT_HOLD_SCHEMA');
  need(!booked||!['OTP','SLOTS'].includes(c.state),'UAT_HOLD_SCHEMA');
  if(c.state==='CONFIRMED'){
   need(hex(c.signedSha,64)&&hex(c.signKey,32)&&hex(c.inkSha,64)&&iso(c.signedAt)&&
    /^\d{4}\/\d{2}\/\d{2}$/.test(c.date)&&typeof c.pdf==='string'&&c.pdf.length>0&&c.pdf.length<=8*chunk&&/^[A-Za-z0-9+/]+={0,2}$/.test(c.pdf),'UAT_PDF_SCHEMA');
   const bytes=services.decode(c.pdf);
   need(bytes.length>=100&&String.fromCharCode(...Array.from(bytes).slice(0,5))==='%PDF-'&&services.digest(bytes)===c.signedSha&&c.signedSha!==c.sourceSha,'UAT_PDF_INTEGRITY');
  }else need(['signedSha','signKey','inkSha','signedAt','date','pdf'].every(k=>c[k]===''),'UAT_UNCONFIRMED_PDF');
 };
 const encode=c=>{
  const meta={};for(const k of keys.filter(x=>x!=='pdf'))meta[k]=c[k];
  if(Object.hasOwn(c,'emailOtp'))meta.emailOtp=c.emailOtp;
  // Prefix chunks so a base64 value cannot be interpreted as a formula.
  return ['case:'+JSON.stringify(meta),...Array.from({length:8},(_,i)=>{const part=c.pdf.slice(i*chunk,(i+1)*chunk);return part?'pdf:'+part:'';})];
 };
 const decode=(row,i)=>{
  need(Array.isArray(row)&&row.length===width&&row.every(x=>typeof x==='string'),'UAT_STORE_CELL');
  if(row.every(x=>x===''))return null;
  need(row[0].startsWith('case:')&&row[0].length<=4000,'UAT_CASE_SCHEMA');
  const c=JSON.parse(row[0].slice(5));
  let pdf='',ended=false;
  for(const part of row.slice(1)){
   if(part===''){ended=true;continue;}
   need(!ended&&part.startsWith('pdf:')&&part.length>4&&part.length<=chunk+4,'UAT_PDF_CHUNKS');pdf+=part.slice(4);
   if(part.length<chunk+4)ended=true;
  }
  c.pdf=pdf;validate(c,i);need(equal(encode(c),row),'UAT_STORE_NONCANONICAL');return c;
 };
 const lock=services.getLock();
 need(lock&&typeof lock.tryLock==='function'&&typeof lock.hasLock==='function'&&typeof lock.releaseLock==='function','UAT_LOCK_INTERFACE');
 need(lock.tryLock(5000)===true,'UAT_LOCK_BUSY');
 const owned=()=>need(lock.hasLock()===true,'UAT_LOCK_LOST');
 try{
  owned();
  if(typeof services.checkCurrentConfig==='function')services.checkCurrentConfig();
  const sheet=services.getSheet();
  need(sheet&&sheet.getName()==='SYNTHETIC_CASES'&&sheet.getParent().getId()===config.storeId&&sheet.getLastRow()<=count+1&&sheet.getLastColumn()<=width,'UAT_STORE_IDENTITY');
  const range=sheet.getRange(1,1,count+1,width);
  const snapshot=()=>{
   owned();
   const raw=range.getValues(),formulas=range.getFormulas();
   need(Array.isArray(raw)&&raw.length===count+1&&currentMarker(raw[0])&&Array.isArray(formulas)&&formulas.length===count+1&&formulas.every(r=>Array.isArray(r)&&r.length===width&&r.every(x=>x==='')),'UAT_STORE_MARKER_OR_FORMULA');
   const records=raw.slice(1).map(decode),live=records.filter(Boolean);
   need(new Set(live.map(c=>c.caseId)).size===live.length&&new Set(live.map(c=>c.tokenHash)).size===live.length,'UAT_DUPLICATE_CASE');
   owned();return {raw,records};
  };
  // Diagnostic only: check both stores under the same lock. A mismatched
  // marker is inspectable only if canonical and all case cells are empty.
  // Never accept a mismatched marker as a normal transaction baseline.
  if(resetting&&maintenance.mode==='reconcile'){
   services.checkReconcileConfig();owned();
   const raw=range.getValues(),formulas=range.getFormulas();
   need(Array.isArray(raw)&&raw.length===count+1&&Array.isArray(formulas)&&formulas.length===count+1&&
    formulas.every(r=>Array.isArray(r)&&r.length===width&&r.every(x=>x==='')),'UAT_STORE_MARKER_OR_FORMULA');
   let state;
   if(currentMarker(raw[0])){
    const records=raw.slice(1).map(decode),live=records.filter(Boolean);
    need(new Set(live.map(c=>c.caseId)).size===live.length&&new Set(live.map(c=>c.tokenHash)).size===live.length,'UAT_DUPLICATE_CASE');
    state=live.length?'MATCHED_NONEMPTY':'MATCHED_EMPTY';
   }else{
    const gate=Array.isArray(raw[0])&&typeof raw[0][2]==='string'?raw[0][2].slice(5):'';
    need(hex(gate,64)&&gate!==config.gateSha&&currentMarker(raw[0],gate)&&
     raw.slice(1).every(row=>Array.isArray(row)&&row.length===width&&row.every(x=>x==='')),'UAT_RECONCILE_UNVERIFIED');
    state='CONFIG_MISMATCH_EMPTY';
   }
   owned();need(equal(range.getValues(),raw)&&equal(range.getFormulas(),formulas),'UAT_STORE_CHANGED');
   services.checkReconcileConfig();owned();
   return {formal:false,scope:'SYNTHETIC_CASES_ONLY',state,readOnly:true};
  }
  const initial=snapshot(),at=services.now();
  need(Number.isSafeInteger(at),'UAT_CLOCK');
  // Validate shared capacity even for read-only callers. No data return if stored records conflict.
  const availability=records=>{
   const atIso=new Date(at).toISOString();
   const rows=records.filter(c=>c&&c.slotId).map(c=>[c.caseId,c.alias,c.slotId,c.state,c.holdUntil,c.holdKey,'',c.signedAt,'','']);
   for(const slot of slots)need(rows.filter(r=>r[2]===slot[0]&&(r[3]==='CONFIRMED'||r[3]==='HELD'&&Date.parse(r[4])>at)).length<=slot[3],'UAT_CAPACITY_CONFLICT');
   return bookingComputeAvailability_(slots,rows,atIso);
  };
  const available=availability(initial.records);
  if(resetting){
   const live=initial.records.filter(Boolean),counts={
    cases:live.length,holds:live.filter(c=>c.state==='HELD'&&Date.parse(c.holdUntil)>at).length,
    confirmed:live.filter(c=>c.state==='CONFIRMED').length,pdfs:live.filter(c=>c.pdf!=='').length};
   const snapshotSha=services.digest(Array.from(JSON.stringify([config.gateSha,config.sourceSha,slots,counts,initial.raw]),c=>c.charCodeAt(0)));
   need(hex(snapshotSha,64),'UAT_CLEANUP_DIGEST');
   if(maintenance.mode==='preview'){
    // Owner maintenance projection: only validated synthetic aliases and
    // booking status, never hashes, keys, PDF bytes or stored raw rows.
    const effective=c=>c.state==='HELD'&&Date.parse(c.holdUntil)<=at?'EXPIRED':c.state;
    // Derive verification status only; presence of emailOtp never proves delivery.
    const otpStatus=c=> (c.emailOtp?'EMAIL_':'SIMULATED_')+(c.state==='CANCELLED'?'CANCELLED':
     c.state!=='OTP'?'VERIFIED':c.emailOtp&&Date.parse(c.emailOtp.expiresAt)<=at?'EXPIRED':'PENDING');
    const cases=live.map(c=>({alias:c.alias,state:effective(c),slotId:c.slotId||null,
     pdfSaved:c.state==='CONFIRMED',otpStatus:otpStatus(c)}));
    const slotSummary=slots.map(s=>{
     const occupied=cases.filter(c=>c.slotId===s[0]&&['HELD','CONFIRMED'].includes(c.state)).length;
     const free=available.find(v=>v.slotId===s[0]);
     return {slotId:s[0],startAtUtc:s[1],endAtUtc:s[2],capacity:s[3],occupied,
      remaining:s[3]-occupied,bookable:!!free};
    });
    return {formal:false,snapshotSha,counts,scope:'SYNTHETIC_CASES_ONLY',cases,slots:slotSummary};
   }
   need(maintenance.expectedSha===snapshotSha,'UAT_CLEANUP_STALE_PREVIEW');
   if(maintenance.mode==='select_document'){
    need(counts.cases===0,'UAT_DOCUMENT_REQUIRES_EMPTY');
    need(equal(snapshot().raw,initial.raw),'UAT_STORE_CHANGED');owned();
    try{need(services.selectDocument(maintenance.nextSourceSha)===true,'UAT_DOCUMENT_CONFIG_READBACK');owned();
     need(equal(snapshot().raw,initial.raw),'UAT_STORE_CHANGED');
    }catch(_){throw Error('UAT_DOCUMENT_SELECTION_UNKNOWN');}
    return {formal:false,scope:'SYNTHETIC_CASES_ONLY',activeSha:maintenance.nextSourceSha,remainingCases:0};
   }
   const recovering=maintenance.mode==='recover_gate';
   // Lost gate recovery is not another cleanup. It is allowed only when
   // the current configuration and header already match and every case is empty.
   if(recovering)need(counts.cases===0,'UAT_GATE_RECOVERY_REQUIRES_EMPTY');
   need(equal(snapshot().raw,initial.raw),'UAT_STORE_CHANGED');
   // Optional paired callbacks are trusted server services, never browser input.
   // Compare the exact test configuration before clearing, and rotate only
   // after the bounded sheet write is directly verified under this same lock.
   const activate=typeof services.afterCleanup==='function';
   need(activate===(typeof services.beforeCleanup==='function')&&(!recovering||activate),'UAT_CLEANUP_LIFECYCLE');
   if(activate)services.beforeCleanup();
   owned();
   const next=[marker[0],marker[1],'gate:'+maintenance.nextGateSha,'reset:'+new Date(at).toISOString(),
    'cases:'+counts.cases,'holds:'+counts.holds,'confirmed:'+counts.confirmed,'pdf:'+counts.pdfs,''];
   const expected=[next,...Array.from({length:count},()=>Array(width).fill(''))];
   // One bounded range replaces the validated test rows and rotates the gate.
   // No formal data or settings; no whole-book or whole-sheet clear.
   try{
    if(recovering)sheet.getRange(1,1,1,width).setValues([next]);
    else range.setValues(expected);
    services.flush();owned();
    const raw=range.getValues(),formulas=range.getFormulas();
    need(equal(raw,expected)&&Array.isArray(formulas)&&formulas.length===count+1&&
     formulas.every(r=>Array.isArray(r)&&r.length===width&&r.every(x=>x==='')),'UAT_CLEANUP_READBACK');
    owned();
    if(activate){need(services.afterCleanup()===true,'UAT_CLEANUP_CONFIG_READBACK');owned();}
   }catch(_){throw Error('UAT_CLEANUP_UNKNOWN_READBACK');}
   if(recovering)return {formal:false,scope:'SYNTHETIC_CASES_ONLY',gateRecovered:true,remainingCases:0,gateRotationRequired:false};
   return {formal:false,scope:'SYNTHETIC_CASES_ONLY',cleared:counts,at:new Date(at).toISOString(),
    remainingCases:0,remainingPdfCopies:0,gateRotationRequired:!activate,
    availability:availability(Array(count).fill(null))};
  }
  const change=choose(JSON.parse(JSON.stringify(initial.records)),available,at);
  if(change===null)return initial.records;
  need(change&&Object.keys(change).sort().join(',')==='index,record'&&Number.isInteger(change.index)&&change.index>=0&&change.index<count,'UAT_CHANGE_SCHEMA');
  const i=change.index,next=change.record,old=initial.records[i];
  validate(next,i);
  if(old&&equal(encode(old),encode(next)))return old;
  if(!old)need(next.state==='OTP','UAT_TRANSITION');
  else{
   need(['alias','caseId','tokenHash'].every(k=>next[k]===old[k]),'UAT_CASE_BINDING');
   const allowed={OTP:['SLOTS','CANCELLED'],SLOTS:['HELD','CANCELLED'],HELD:['CONFIRMED','CANCELLED','EXPIRED'],CANCELLED:[],EXPIRED:[],CONFIRMED:[]};
   need(allowed[old.state].includes(next.state),'UAT_TRANSITION');
   if(old.state==='HELD'){
    need(['slotId','holdUntil','holdKey','sourceSha'].every(k=>next[k]===old[k]),'UAT_HOLD_BINDING');
    if(next.state==='CONFIRMED')need(Date.parse(old.holdUntil)>at&&Date.parse(next.signedAt)<=at&&Date.parse(next.signedAt)<Date.parse(old.holdUntil),'UAT_HOLD_EXPIRED');
    if(next.state==='EXPIRED')need(Date.parse(old.holdUntil)<=at,'UAT_TRANSITION');
   }
   if(next.state==='HELD')need(available.some(s=>s.slotId===next.slotId)&&Date.parse(next.holdUntil)>at&&Date.parse(next.holdUntil)<=at+600000,'UAT_SLOT_UNAVAILABLE');
  }
  const proposed=initial.records.slice();proposed[i]=next;availability(proposed);
  need(new Set(proposed.filter(Boolean).map(c=>c.caseId)).size===proposed.filter(Boolean).length&&new Set(proposed.filter(Boolean).map(c=>c.tokenHash)).size===proposed.filter(Boolean).length,'UAT_DUPLICATE_CASE');
  // Detect externally changed cells; external writers still must be excluded via ACL.
  need(equal(snapshot().raw,initial.raw),'UAT_STORE_CHANGED');
  owned();const expect=initial.raw.map(r=>r.slice());expect[i+1]=encode(next);
  try{
   sheet.getRange(i+2,1,1,width).setValues([expect[i+1]]);
   services.flush();owned();
   need(equal(snapshot().raw,expect),'UAT_READBACK_MISMATCH');
  }catch(_){throw Error('UAT_WRITE_UNKNOWN_READ_CASE');}
  return next;
 }finally{lock.releaseLock();}
}
