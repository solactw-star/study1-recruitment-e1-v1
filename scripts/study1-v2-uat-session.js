// Pure synthetic E1 document source, shared by UAT runtimes only.
// No contact details, research document, file ID, data access or network calls.
async function study1UatDocument_(profile,version='UAT-SYNTHETIC-1'){
 if(!['UAT-SYNTHETIC-1','UAT-SYNTHETIC-2'].includes(version)||version==='UAT-SYNTHETIC-2'&&profile!=='GAS_UAT')throw Error('UAT_DOCUMENT_VERSION');
 const storageCopy={
  BROWSER:['Data: only this browser tab holds synthetic state.','No files, contact details or signatures are transmitted.'],
  SHARED_LOCAL:['Data: synthetic cases are stored in the local test database.','Only fictional test marks are saved; no Google data or mail.'],
  GAS_UAT:['Data: only the isolated test environment may save this example.','Never enter a real identity or signature; no research consent.']
 };
 if(!Object.prototype.hasOwnProperty.call(storageCopy,profile))throw Error('Synthetic UAT document profile required');
   const pdf=await PDFLib.PDFDocument.create({updateMetadata:false});
   const fixedDate=new Date('2026-01-01T00:00:00.000Z');pdf.setCreationDate(fixedDate);pdf.setModificationDate(fixedDate);pdf.setProducer('Study1 synthetic UAT');pdf.setCreator('Study1 synthetic UAT');const font=await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
   const lines=[['Purpose: this is a fictional usability exercise only.','No study data, identity, rights or consent are collected.'],
    ['Example procedure: choose a fictional appointment.','Read this sample document before drawing test marks.'],
    ['Participation is voluntary. Close the test to stop.','This example is not an approved research procedure.'],
    storageCopy[profile],
    ['Example signature page - not a consent agreement.','Researcher example placeholder: TEST RESEARCHER.']];
   lines.forEach((copy,i)=>{const p=pdf.addPage([595,842]);p.drawText('SYNTHETIC UAT - NOT VALID CONSENT',{x:36,y:790,size:19,font});p.drawText('Study1 E1 / sample page '+(i+1)+' of 5',{x:36,y:752,size:13,font});copy.forEach((line,j)=>p.drawText(line,{x:36,y:704-j*26,size:12,font}));if(i===4){p.drawText('Fictional participant mark:',{x:80,y:129,size:12,font});p.drawRectangle({x:80,y:70,width:190,height:50,borderWidth:1});p.drawText('Test date:',{x:350,y:129,size:12,font});}p.drawText('TEST ONLY / never submit as research consent',{x:36,y:30,size:11,font});});
   // V1 remains byte-identical; V2 clearly marks a fictional pre-signature.
   if(version==='UAT-SYNTHETIC-2'){
    pdf.getPages().forEach(p=>p.drawText('UAT-SYNTHETIC-2 / fictional researcher pre-sign sample',{x:36,y:595,size:12,font}));
    const p=pdf.getPages()[4];p.drawText('TEST RESEARCHER / mock mark / 2026-01-01',{x:80,y:200,size:12,font});
   }
   const bytes=Array.from(await pdf.save({useObjectStreams:false,objectsPerTick:Infinity})),hash=await study1PdfDigest_(bytes);
   return {bytes,hash,layout:{experiment:'E1',documentSha:hash,version,pageCount:5,pageIndex:4,pageWidth:595,pageHeight:842,signature:{x:80,y:70,width:190,height:50},date:{x:350,y:87,fontSize:11}}};
}

// Only generated TEST sources can be selected. No arbitrary bytes or Drive IDs.
async function study1UatDocumentCatalog_(){
 const docs=[];
 for(const version of ['UAT-SYNTHETIC-1','UAT-SYNTHETIC-2']){
  const doc=await study1UatDocument_('GAS_UAT',version);
  const reopened=await PDFLib.PDFDocument.load(Uint8Array.from(doc.bytes),{ignoreEncryption:false,updateMetadata:false,parseSpeed:Infinity});
  if(reopened.isEncrypted||reopened.getPageCount()!==5||study1PdfDigest_(doc.bytes)!==doc.hash)throw Error('UAT_DOCUMENT_SOURCE');
  docs.push(doc);
 }
 if(docs[0].hash===docs[1].hash)throw Error('UAT_DOCUMENT_SOURCE');
 return docs;
}
async function study1UatDocumentForSha_(sha){
 const doc=(await study1UatDocumentCatalog_()).find(d=>d.hash===sha);
 if(!doc)throw Error('UAT_DOCUMENT_SOURCE');
 return doc;
}

/* Isolated E1 usability session, no real identity, persistence, or network.
 * This is a browser-local test adapter, NOT the formal reservation service. */
function study1UatSession(clock=()=>Date.now(),profile='BROWSER'){
 const require=(ok,msg)=>{if(!ok)throw Error(msg)};
 const now=()=>{const n=clock();require(Number.isFinite(n),'Invalid test clock');return n;};
 const iso=n=>new Date(n).toISOString();
 const time=now(),tomorrow=new Date(time);tomorrow.setUTCDate(tomorrow.getUTCDate()+1);tomorrow.setUTCHours(2,0,0,0);
 const starts=[+tomorrow,+tomorrow+7200000,+tomorrow+86400000,+tomorrow+93600000];
 const rows=starts.map((n,i)=>['TEST_SLOT_'+(i+1),iso(n),iso(n+3600000),1,'TEST_ONLY','OPEN','TEST',iso(time)]);
 const occupied=[['TEST_OCCUPIED','TEST_OTHER',rows[0][0],'CONFIRMED','',iso(time),iso(time),'',iso(time),'']];
 let stage='SCREEN',reservation=null,source=null,signed=null;
 const availability=()=>bookingComputeAvailability_(rows,occupied.concat(reservation?[reservation]:[]),iso(now()));
 const status=()=>({stage,slotId:reservation?.[2]||null,bookingStatus:reservation?.[3]||null,holdUntil:reservation?.[4]||null,signed:!!signed,formal:false,persisted:false});
 return {
  status,availability,
  screen(ok){require(stage==='SCREEN'&&ok===true,'Please confirm fictional qualifications');stage='OTP';},
  verify(code){require(stage==='OTP'&&code==='12345678','Incorrect synthetic code');stage='SLOTS';return availability();},
  hold(id){require(stage==='SLOTS'&&!reservation,'A test reservation already exists');const found=availability().find(s=>s.slotId===id);require(found,'Unavailable test slot');const at=now();reservation=['TEST_RESERVATION','TEST_APPLICANT',id,'HELD',iso(at+600000),iso(at),'','',iso(at),''];stage='HELD';return {...found,holdUntil:reservation[4]};},
  async document(){require(stage==='HELD'&&Date.parse(reservation[4])>now(),'Test hold expired');if(!source){
   source=await study1UatDocument_(profile);
  }return {bytes:Uint8Array.from(source.bytes),sha:source.hash,pageCount:5};},
  async sign(ink,read,agree){
   require(stage==='HELD'&&source&&read===true&&agree===true,'Read the full sample first');
   require(Date.parse(reservation[4])>now(),'Test hold expired');require(ink instanceof Uint8Array&&ink.length>=100&&ink.length<=90000,'Invalid test ink');
   stage='SIGNING';
   try{const result=await study1PdfComposeSigned_(source.bytes,ink,source.layout,{experiment:'E1',sha256:source.hash,version:'UAT-SYNTHETIC-1'},new Date(now()));
    require(stage==='SIGNING'&&Date.parse(reservation[4])>now(),'Test hold expired or cancelled');
    signed={bytes:Uint8Array.from(result.signedPdfBytes),sha:result.signedSha256,date:result.taipeiDate,pageCount:result.pageCount};
    reservation[3]='CONFIRMED';reservation[7]=iso(now());stage='DONE';return {...signed,bytes:Uint8Array.from(signed.bytes),booking:status()};
   }catch(e){if(stage==='SIGNING')stage='HELD';throw e;}
  },
  cancel(){require(stage!=='DONE','Test already complete');if(reservation)reservation[3]='CANCELLED';source=null;signed=null;stage='CANCELLED';return status();}
 };
}
