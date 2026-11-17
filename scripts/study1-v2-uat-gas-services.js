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
 const config={storeId:approved.storeId,sourceSha:approved.sourceSha,slots:approved.slots};
 const services={
  getLock:()=>LockService.getScriptLock(),
  getSheet:()=>{
   const book=SpreadsheetApp.openById(config.storeId);
   need(book&&book.getId()===config.storeId&&book.getName()==='Study1 E1 SYNTHETIC UAT ONLY','UAT_STORE_IDENTITY');
   const sheets=book.getSheets();
   need(sheets.length===1&&sheets[0].getName()==='SYNTHETIC_CASES','UAT_STORE_IDENTITY');
   return sheets[0];
  },
  flush:()=>SpreadsheetApp.flush(),now:()=>Date.now(),
  decode:s=>Utilities.base64Decode(s).map(x=>x&255),
  digest:b=>study1PdfDigest_(b)
 };
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
  signedAt:signed?record.signedAt:null,date:signed?record.date:null,pageCount:signed?5:null,formal:false,persisted:true};
}
/* Read-back copy must independently verify the stored full PDF before returning bytes.
 * This internal helper accepts only the authorized, persisted case snapshot.
 */
async function study1UatCaseCopy_(record,slots,at){
 const view=study1UatCaseView_(record,slots,at);
 if(view.bookingStatus!=='CONFIRMED')throw Error('UAT_COPY_NOT_CONFIRMED');
 const bytes=Utilities.base64Decode(record.pdf).map(x=>x&255);
 if(study1PdfDigest_(bytes)!==view.signedSha)throw Error('UAT_PDF_INTEGRITY');
 const pdf=await PDFLib.PDFDocument.load(Uint8Array.from(bytes),{updateMetadata:false});
 if(pdf.getPageCount()!==5)throw Error('UAT_PDF_PAGE_COUNT');
 return {...view,sha:view.signedSha,bytes:record.pdf};
}
