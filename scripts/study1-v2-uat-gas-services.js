/* Internal GAS service binding, for synthetic E1 UAT only.
 * Not a web endpoint; no deployment changes and no formal data access.
 * approved is supplied by trusted server configuration, NEVER browser parameters.
 * No actual store ID or access secret is included in source.
 */
function study1UatGasCaseTransaction_(approved,access,decide){
 const need=(ok,msg)=>{if(!ok)throw Error(msg);};
 const hex=(s,n)=>typeof s==='string'&&s.length===n&&/^[a-f0-9]+$/.test(s);
 const exact=(o,k)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===k.slice().sort().join(',');
 need(exact(approved,['storeId','sourceSha','slots','gateSha'])&&typeof approved.storeId==='string'&&/^[A-Za-z0-9_-]{20,100}$/.test(approved.storeId)&&hex(approved.gateSha,64)&&hex(approved.sourceSha,64),'UAT_SERVER_CONFIG_REQUIRED');
 need(exact(access,['gate','caseKey'])&&hex(access.gate,64)&&hex(access.caseKey,64)&&typeof decide==='function','UAT_ACCESS_DENIED');
 const hashToken=s=>study1PdfDigest_(Array.from(s,c=>c.charCodeAt(0)));
 const equalHash=(a,b)=>{let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
 const gateHash=hashToken(access.gate);
 need(equalHash(gateHash,approved.gateSha)&&access.gate!==access.caseKey,'UAT_ACCESS_DENIED');
 const tokenHash=hashToken(access.caseKey);
 // Only this exact server-selected private test document can be opened.
 // The transaction core checks the marker and the ID again while locked.
 const config={storeId:approved.storeId,sourceSha:approved.sourceSha,slots:approved.slots,gateSha:approved.gateSha};
 const services=study1UatStoreServices_(config.storeId);

 let value=null;
 study1UatStoreTransaction_(services,config,(rows,available,at)=>{
  const index=rows.findIndex(c=>c&&equalHash(c.tokenHash,tokenHash));
  const mine=index<0?null:rows[index];
  // The internal caller sees ONLY its authorized case and aggregate availability.
  // Empty case positions convey no other case's data or credentials.
  const decision=decide(mine,available,at);
  need(exact(decision,['record','value']),'UAT_CASE_DECISION');
  value=decision.value;
  if(decision.record===null)return null; // raw full snapshot is never returned
  const record=decision.record;
  need(record&&record.tokenHash===tokenHash,'UAT_CASE_BINDING');
  const target=index<0?Number(String(record.alias).slice(-2))-1:index;
  if(index<0)need(/^TEST_(0[1-9]|1[0-2])$/.test(record.alias)&&!rows[target]&&record.caseId==='UAT_'+tokenHash.slice(0,24),'UAT_CASE_UNAVAILABLE');
  else need(record.caseId===mine.caseId&&record.alias===mine.alias,'UAT_CASE_BINDING');
  return {index:target,record};
 });
 // Only the trusted caller's projected result, after successful readback.
 return value;
}

/* Shared service adapter: only the server-selected synthetic spreadsheet. */
function study1UatStoreServices_(storeId){
 return {
  getLock:()=>LockService.getScriptLock(),
  getSheet:()=>{
   const book=SpreadsheetApp.openById(storeId);
   if(!book||book.getId()!==storeId||book.getName()!=='Study1 E1 SYNTHETIC UAT ONLY')throw Error('UAT_STORE_IDENTITY');
   const sheets=book.getSheets();
   if(sheets.length!==1||sheets[0].getName()!=='SYNTHETIC_CASES')throw Error('UAT_STORE_IDENTITY');
   return sheets[0];
  },
  flush:()=>SpreadsheetApp.flush(),now:()=>Date.now(),
  decode:s=>Utilities.base64Decode(s).map(x=>x&255),
  digest:b=>study1PdfDigest_(b)
 };
}
/* Internal OWNER-only maintenance. The next gate fingerprint must be chosen
 * by a trusted server caller; never accept it from an untrusted browser.
 * There is deliberately no public RPC or property mutation here. A separate
 * authorized configuration activation is required after successful reset.
 */
function study1UatCleanup_(maintenance){
 study1AdminOwnerRequired_();
 const approved=study1UatTrustedConfig_();
 return study1UatStoreTransaction_(study1UatStoreServices_(approved.storeId),approved,null,maintenance);
}

/* Allowlisted view of a case already read and validated by the private transaction.
 * Never pass the stored record or its credential hashes to the browser.
 * An elapsed hold is displayed as expired without turning a GET into a write.
 */
function study1UatCaseView_(record,slots,at){
 if(!record||!Number.isSafeInteger(at)||!Array.isArray(slots))throw Error('UAT_CASE_NOT_FOUND');
 if(!/^UAT_[a-f0-9]{24}$/.test(record.caseId)||!/^TEST_(0[1-9]|1[0-2])$/.test(record.alias)||
  !['OTP','SLOTS','HELD','CANCELLED','EXPIRED','CONFIRMED'].includes(record.state))throw Error('UAT_CASE_VIEW');
 const matched=slots.filter(s=>Array.isArray(s)&&s[0]===record.slotId);
 if(record.slotId&&(matched.length!==1||matched[0][4]!=='TEST_ONLY'))throw Error('UAT_CASE_SLOT');
 const slot=record.slotId?matched[0]:null;
 if(slot&&(!Number.isFinite(Date.parse(slot[1]))||!Number.isFinite(Date.parse(slot[2]))||
  Date.parse(slot[1])>=Date.parse(slot[2])||!Number.isFinite(Date.parse(record.holdUntil))))throw Error('UAT_CASE_SLOT');
 const status=record.state==='HELD'&&Date.parse(record.holdUntil)<=at?'EXPIRED':record.state;
 if(['HELD','CONFIRMED','EXPIRED'].includes(status)&&!slot)throw Error('UAT_CASE_SLOT');
 const signed=status==='CONFIRMED';
 if(signed&&(!/^[a-f0-9]{64}$/.test(record.sourceSha)||!/^[a-f0-9]{64}$/.test(record.signedSha)||
  record.sourceSha===record.signedSha||!record.pdf||!Number.isFinite(Date.parse(record.signedAt))||
  !/^\d{4}\/\d{2}\/\d{2}$/.test(record.date)))throw Error('UAT_CASE_COPY');
 return {caseId:record.caseId,alias:record.alias,stage:signed?'DONE':status,bookingStatus:status,
  slotId:slot?slot[0]:null,startAtUtc:slot?slot[1]:null,endAtUtc:slot?slot[2]:null,
  holdUntil:slot?record.holdUntil:null,sourceSha:record.sourceSha||null,signedSha:signed?record.signedSha:null,
  signedAt:signed?record.signedAt:null,date:signed?record.date:null,pageCount:null,formal:false,persisted:true};
}
/* Read-back copy must independently verify the stored full PDF before returning bytes.
 * This internal helper accepts only the authorized, persisted case snapshot.
 */
async function study1UatCaseCopy_(record,slots,at){
 const view=study1UatCaseView_(record,slots,at);
 if(view.bookingStatus!=='CONFIRMED')throw Error('UAT_COPY_NOT_CONFIRMED');
 const bytes=Utilities.base64Decode(record.pdf).map(x=>x&255);
 if(study1PdfDigest_(bytes)!==view.signedSha)throw Error('UAT_PDF_INTEGRITY');
 const pdf=await PDFLib.PDFDocument.load(Uint8Array.from(bytes),{ignoreEncryption:false,updateMetadata:false,parseSpeed:Infinity});
 if(pdf.isEncrypted||pdf.getPageCount()!==5)throw Error('UAT_PDF_PAGE_COUNT');
 return {...view,pageCount:5,sha:view.signedSha,bytes:record.pdf};
}

/* Private operation layer for the existing seven-step isolated UAT contract.
 * Not an RPC or a web route. Configuration must be supplied by a trusted caller.
 * No live study records or email, no fallback to a different store.
 */
async function study1UatGasOperation_(approved,access,operation,payload){
 const need=(ok,msg)=>{if(!ok)throw Error(msg);};
 const hex=(s,n)=>typeof s==='string'&&s.length===n&&/^[a-f0-9]+$/.test(s);
 const keys={start:['alias','eligible'],verify:['code'],slots:[],hold:['slotId','requestId'],read:[],document:[],sign:['requestId','sourceSha','ink','read','agree'],copy:[],cancel:[]};
 need(Object.prototype.hasOwnProperty.call(keys,operation)&&payload&&typeof payload==='object'&&!Array.isArray(payload)&&
  Object.keys(payload).sort().join(',')===keys[operation].slice().sort().join(','),'UAT_REQUEST');
 const tx=fn=>study1UatGasCaseTransaction_(approved,access,fn);
 const unchanged=value=>({record:null,value});
 const result=(record,at)=>({record,value:study1UatCaseView_(record,approved.slots,at)});
 const lookup=(mine)=>{need(mine,'UAT_CASE_NOT_FOUND');return mine;};
 // Composition/reopening may yield across a cleanup. Check the same gate
 // and persisted signed case once more before releasing the PDF bytes.
 const copyCurrent=async record=>{
  const copy=await study1UatCaseCopy_(record,approved.slots,Date.now());
  return tx(mine=>{
   need(mine&&mine.state==='CONFIRMED'&&mine.caseId===record.caseId&&mine.signedSha===record.signedSha&&mine.pdf===record.pdf,'UAT_COPY_CHANGED');
   return unchanged(copy);
  });
 };
 const held=(mine,at)=>{need(mine.state==='HELD'&&Date.parse(mine.holdUntil)>at&&mine.sourceSha===approved.sourceSha,'UAT_HOLD_REQUIRED');return mine;};
 const availableView=available=>available.map(s=>({slotId:s.slotId,startAtUtc:s.startAtUtc,endAtUtc:s.endAtUtc,remaining:s.remaining}));
 if(operation==='start')return tx((mine,available,at)=>{
  need(payload.eligible===true&&/^TEST_(0[1-9]|1[0-2])$/.test(payload.alias),'UAT_SYNTHETIC_IDENTITY_REQUIRED');
  if(mine){need(mine.alias===payload.alias,'UAT_CASE_BINDING');return unchanged(study1UatCaseView_(mine,approved.slots,at));}
  const tokenHash=study1PdfDigest_(Array.from(access.caseKey,c=>c.charCodeAt(0)));
  return result({alias:payload.alias,caseId:'UAT_'+tokenHash.slice(0,24),tokenHash,state:'OTP',slotId:'',holdUntil:'',holdKey:'',sourceSha:'',signedSha:'',signKey:'',inkSha:'',signedAt:'',date:'',pdf:''},at);
 });
 if(operation==='verify'||operation==='slots')return tx((record,available)=>{
  const mine=lookup(record);
  if(operation==='verify'){
   need(payload.code==='12345678'&&['OTP','SLOTS'].includes(mine.state),'UAT_SYNTHETIC_OTP_INVALID');
   if(mine.state==='OTP')return {record:{...mine,state:'SLOTS'},value:availableView(available)};
  }else need(mine.state==='SLOTS','UAT_CASE_STATE');
  return unchanged(availableView(available));
 });
 if(operation==='read')return tx((mine,available,at)=>unchanged(study1UatCaseView_(lookup(mine),approved.slots,at)));
 if(operation==='hold')return tx((record,available,at)=>{
  const mine=lookup(record);
  need(hex(payload.requestId,32)&&typeof payload.slotId==='string','UAT_REQUEST');
  if(mine.holdKey===payload.requestId){held(mine,at);need(mine.slotId===payload.slotId,'UAT_HOLD_REPLAY_CONFLICT');return unchanged(study1UatCaseView_(mine,approved.slots,at));}
  need(mine.state==='SLOTS'&&available.some(s=>s.slotId===payload.slotId),'UAT_SLOT_UNAVAILABLE');
  return result({...mine,state:'HELD',slotId:payload.slotId,holdUntil:new Date(at+600000).toISOString(),holdKey:payload.requestId,sourceSha:approved.sourceSha},at);
 });
 if(operation==='cancel')return tx((record,available,at)=>{
  const mine=lookup(record);
  need(mine.state!=='CONFIRMED','UAT_CONFIRMED_IMMUTABLE');
  if(['CANCELLED','EXPIRED'].includes(mine.state))return unchanged(study1UatCaseView_(mine,approved.slots,at));
  const expired=mine.state==='HELD'&&Date.parse(mine.holdUntil)<=at;
  return result({...mine,state:expired?'EXPIRED':'CANCELLED'},at);
 });
 if(operation==='copy'){
  const snapshot=tx(mine=>{need(lookup(mine).state==='CONFIRMED','UAT_COPY_NOT_CONFIRMED');return unchanged(mine);});
  return copyCurrent(snapshot);
 }
 // Construct the same fixed synthetic original only after an authorized active hold.
 const snapshot=tx((record,available,at)=>{
  const mine=lookup(record);
  if(operation==='sign'&&mine.state==='CONFIRMED')return unchanged({mine,at});
  return unchanged({mine:held(mine,at),at});
 });
 const sameHold=mine=>['caseId','slotId','holdKey','holdUntil','sourceSha'].every(k=>mine[k]===snapshot.mine[k]);
 const encode=bytes=>Utilities.base64Encode(Array.from(bytes,x=>x>127?x-256:x));
 if(operation==='document'){
  const doc=await study1UatDocument_('GAS_UAT');
  need(doc.hash===approved.sourceSha&&study1PdfDigest_(doc.bytes)===doc.hash&&doc.layout.pageCount===5,'UAT_DOCUMENT_SOURCE');
  return tx((record,available,at)=>{const mine=held(lookup(record),at);need(sameHold(mine),'UAT_HOLD_CHANGED');return unchanged({caseId:mine.caseId,sha:doc.hash,pageCount:5,bytes:encode(doc.bytes)});});
 }
 need(hex(payload.requestId,32)&&payload.read===true&&payload.agree===true&&payload.sourceSha===approved.sourceSha,'UAT_DOCUMENT_BINDING');
 need(typeof payload.ink==='string'&&payload.ink.length<=120000&&/^[A-Za-z0-9+/]+={0,2}$/.test(payload.ink),'UAT_INK');
 const ink=Utilities.base64Decode(payload.ink).map(x=>x&255);
 const u32=i=>ink[i]*16777216+ink[i+1]*65536+ink[i+2]*256+ink[i+3];
 need(ink.length>=100&&ink.length<=90000&&encode(ink)===payload.ink&&
  ink.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'&&ink.slice(12,16).join(',')==='73,72,68,82'&&
  u32(16)>0&&u32(16)<=700&&u32(20)>0&&u32(20)<=160,'UAT_INK');
 const inkSha=study1PdfDigest_(ink);
 const replay=mine=>{need(sameHold(mine)&&mine.state==='CONFIRMED'&&mine.signKey===payload.requestId&&mine.inkSha===inkSha,'UAT_SIGN_REPLAY_CONFLICT');return mine;};
 if(snapshot.mine.state==='CONFIRMED')return copyCurrent(replay(snapshot.mine));
 const doc=await study1UatDocument_('GAS_UAT');
 need(doc.hash===approved.sourceSha&&study1PdfDigest_(doc.bytes)===doc.hash,'UAT_DOCUMENT_SOURCE');
 const composed=await study1PdfComposeSigned_(doc.bytes,ink,doc.layout,{experiment:'E1',version:'UAT-SYNTHETIC-1',sha256:doc.hash},new Date(snapshot.at));
 const pdf=encode(composed.signedPdfBytes);
 need(composed.pageCount===5&&composed.sourceSha256===approved.sourceSha&&study1PdfDigest_(composed.signedPdfBytes)===composed.signedSha256&&pdf.length<=320000,'UAT_SIGNED_PDF');
 const saved=tx((record,available,at)=>{
  const mine=lookup(record);
  if(mine.state==='CONFIRMED')return unchanged(replay(mine));
  held(mine,at);need(sameHold(mine),'UAT_HOLD_CHANGED');
  const next={...mine,state:'CONFIRMED',signedSha:composed.signedSha256,signKey:payload.requestId,inkSha,signedAt:composed.serverSignedAt,date:composed.taipeiDate,pdf};
  return {record:next,value:next};
 });
 // Only after the transaction core has verified persistence, re-open the complete copy.
 return copyCurrent(saved);
}

/* Server-only configuration for the existing dedicated E1 test store.
 * There is no setter, URL parameter, browser-selected table, or FORMAL fallback.
 * The deployment must explicitly provide this internal profile; public v4 has no
 * call site. Keep the pinned store fingerprint separate from mutable Properties.
 */
function study1UatConfigValidate_(raw,at,storeFingerprint){
 const deny=()=>{throw Error('UAT_SERVER_CONFIG_REQUIRED');};
 const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
 const iso=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
 if(typeof raw!=='string'||raw.length>6000||!Number.isSafeInteger(at)||!hex(storeFingerprint))deny();
 let c;try{c=JSON.parse(raw);}catch(_){deny();}
 if(!c||Array.isArray(c)||Object.keys(c).sort().join(',')!=='expiresAt,gateSha,profile,slots,sourceSha,storeId'||
  c.profile!=='E1_SYNTHETIC_UAT_V1'||typeof c.storeId!=='string'||!/^[A-Za-z0-9_-]{20,100}$/.test(c.storeId)||
  study1PdfDigest_(Array.from(c.storeId,x=>x.charCodeAt(0)))!==storeFingerprint||
  !hex(c.gateSha)||!hex(c.sourceSha)||c.gateSha===c.sourceSha||
  !iso(c.expiresAt)||Date.parse(c.expiresAt)<=at||Date.parse(c.expiresAt)>at+7*86400000||
  !Array.isArray(c.slots)||c.slots.length<1||c.slots.length>4)deny();
 const ids=new Set();
 for(const row of c.slots){
  if(!Array.isArray(row)||row.length!==8||!/^TEST_SLOT_[1-4]$/.test(row[0])||ids.has(row[0])||
   !iso(row[1])||!iso(row[2])||Date.parse(row[2])-Date.parse(row[1])!==3600000||
   row[3]!==1||row[4]!=='TEST_ONLY'||row[5]!=='OPEN'||row[6]!=='TEST'||!iso(row[7])||
   Date.parse(row[7])>at||Date.parse(row[1])>Date.parse(c.expiresAt)+7*86400000)deny();
  ids.add(row[0]);
 }
 return {storeId:c.storeId,sourceSha:c.sourceSha,gateSha:c.gateSha,slots:c.slots.map(s=>s.slice())};
}
function study1UatTrustedConfigSnapshot_(){
 // Exact V2 Script and sole provisioned test sheet (SHA-256 of its ID, not ID).
 if(ScriptApp.getScriptId()!=='1qg3PuI8sGFOAP-pJ889d9RrN0p_e0zsfqM274HgG4sEg9Qjv-xzqeL2f')throw Error('UAT_SERVER_CONFIG_REQUIRED');
 const props=PropertiesService.getScriptProperties(),raw=props.getProperty('STUDY1_E1_SYNTHETIC_UAT_V1');
 const approved=study1UatConfigValidate_(raw,Date.now(),
  'da054874a5b2a59ad318e74a392e5e0b3db993fcb2f114dc8c7537bb95549cdb');
 return {props,raw,approved};
}
function study1UatTrustedConfig_(){return study1UatTrustedConfigSnapshot_().approved;}

/* Narrow internal browser-request contract, ready for an explicitly reviewed
 * isolated deployment call site; NOT itself a callable GAS web RPC.
 * Never reflect a raw GAS exception, credential, configuration, or table row.
 */
async function study1UatControlledRequest_(request){
 const deny=()=>({ok:false,error:'UAT_REQUEST_REJECTED'});
 const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys;
 const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
 if(!exact(request,'caseKey,gate,operation,payload')||!hex(request.gate)||!hex(request.caseKey)||
  request.gate===request.caseKey||!['start','verify','slots','hold','document','sign','read','copy','cancel'].includes(request.operation)||
  !request.payload||typeof request.payload!=='object'||Array.isArray(request.payload))return deny();
 try{
  const approved=study1UatTrustedConfig_();
  const value=await study1UatGasOperation_(approved,{gate:request.gate,caseKey:request.caseKey},request.operation,request.payload);
  return {ok:true,value};
 }catch(e){
  // A thrown error may occur after a mutation or its flush. No automatic retry.
  // Distinguish only the explicitly verified unknown-write marker; do not leak
  // arbitrary service exceptions (they may contain resource identifiers).
  return {ok:false,error:e&&e.message==='UAT_WRITE_UNKNOWN_READ_CASE'?'UAT_WRITE_UNKNOWN_READ_CASE':'UAT_REQUEST_REJECTED'};
 }
}

/* Same-site cleanup: explicit OWNER confirmation and a current snapshot.
 * Fresh 256-bit browser entropy from the authorized manager is input to
 * server derivation, not a client-selected gate hash, store or deletion scope.
 * Only the dedicated test property is rotated, after verified row cleanup.
 * A partial cross-store result fails closed; no automatic repeat or rollback.
 */
function study1SiteTestCleanupRequest_(request){
 const deny=()=>({ok:false,error:'UAT_REQUEST_REJECTED'});
 try{
  study1AdminOwnerRequired_();
  if(!request||typeof request!=='object'||Array.isArray(request))return deny();
  const keys=Object.keys(request).sort().join(',');
  if(request.mode==='preview'&&keys==='mode')return {ok:true,value:study1UatCleanup_({mode:'preview'})};
  if(request.mode==='reconcile'&&keys==='mode'){
   const {props,raw,approved}=study1UatTrustedConfigSnapshot_();
   const services=study1UatStoreServices_(approved.storeId);
   services.checkReconcileConfig=()=>{
    if(props.getProperty('STUDY1_E1_SYNTHETIC_UAT_V1')!==raw||Date.parse(JSON.parse(raw).expiresAt)<=Date.now())throw Error('UAT_CLEANUP_CONFIG_CHANGED');
   };
   return {ok:true,value:study1UatStoreTransaction_(services,approved,null,{mode:'reconcile'})};
  }
  const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
  const recovering=request.mode==='recover_gate';
  if(!['clear','recover_gate'].includes(request.mode)||keys!=='confirmation,entropy,expectedSha,mode'||
   request.confirmation!==(recovering?'RECOVER_EMPTY_TEST_GATE':'CLEAR_TEST_ONLY')||
   !hex(request.expectedSha)||!hex(request.entropy))return deny();
  const {props,raw,approved}=study1UatTrustedConfigSnapshot_(),key='STUDY1_E1_SYNTHETIC_UAT_V1';
  const sha=value=>study1PdfDigest_(Array.from(value,c=>c.charCodeAt(0)));
  const replacementGate=sha((recovering?'STUDY1_TEST_GATE_RECOVERY_V1:':'STUDY1_TEST_RESET_V1:')+request.entropy+':'+request.expectedSha+':'+approved.gateSha);
  const nextGateSha=sha(replacementGate);
  const cfg=JSON.parse(raw),nextRaw=JSON.stringify({...cfg,gateSha:nextGateSha});
  const validateCurrent=()=>{
   // Before writing either store, require the captured config to be current
   // and unexpired. The next config differs only in the gate fingerprint.
   if(props.getProperty(key)!==raw||Date.parse(cfg.expiresAt)<=Date.now())throw Error('UAT_CLEANUP_CONFIG_CHANGED');
  };
  const services=study1UatStoreServices_(approved.storeId);
  services.beforeCleanup=validateCurrent;
  services.afterCleanup=()=>{
   validateCurrent();
   props.setProperty(key,nextRaw);
   return props.getProperty(key)===nextRaw;
  };
  const cleared=study1UatStoreTransaction_(services,approved,null,{mode:request.mode,expectedSha:request.expectedSha,nextGateSha});
  if(!cleared||cleared.gateRotationRequired!==false)throw Error('UAT_CLEANUP_UNKNOWN_READBACK');
  return {ok:true,value:{...cleared,replacementGate}};
 }catch(e){return {ok:false,error:e&&e.message==='UAT_CLEANUP_UNKNOWN_READBACK'?'UAT_CLEANUP_UNKNOWN_READBACK':'UAT_REQUEST_REJECTED'};}
}
