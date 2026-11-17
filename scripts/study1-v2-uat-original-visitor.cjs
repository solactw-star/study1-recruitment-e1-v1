'use strict';
// Original participant template adapter, offline source assembly only.
// This file is NOT part of any existing deployment workflow. Do not deploy
// without independent review, exact source/ACL readback and runtime tests.
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function once(s,a,b){
 if(s.split(a).length!==2)throw Error('UAT_ORIGINAL_VISITOR_ANCHOR');
 return s.replace(a,()=>b);
}
function gasController(){
 'use strict';
 if(typeof document==='undefined'||!document.body||document.body.dataset.siteMode!=='GAS_UAT')return;
 const el=id=>document.getElementById(id),txt=(id,s)=>{el(id).textContent=s;},say=s=>txt('status',s);
 const steps=['choose','screen','otp','slots','confirm','consent','done'];
 const hex=(s,n)=>typeof s==='string'&&s.length===n&&/^[a-f0-9]+$/.test(s);
 const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');
 const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
 const bytes=b=>Uint8Array.from(atob(b),x=>x.charCodeAt(0));
 const taipei=s=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'full',timeStyle:'short'}).format(new Date(s));
 const mutating=new Set(['start','verify','hold','sign','cancel']);
 const unresolved=new Map();
 let gate='',caseKey='',expected='',current=null,busy=false,ink=false,previous=null,originalUrl=null,signedUrl=null,source=null;
 const need=(ok,msg)=>{if(!ok)throw Error(msg);};
 const show=step=>{for(const name of steps)el('step-'+name).hidden=name!==step;
  el('step-ineligible').hidden=true;txt('progressText','隔離線上驗收 · '+(steps.indexOf(step)+1)+' / 7');
  [...el('progress').children].forEach((n,i)=>n.classList.toggle('current',i<=steps.indexOf(step)));};
 const hideSteps=()=>{for(const name of steps)el('step-'+name).hidden=true;};
 const clearUrls=()=>{for(const u of [originalUrl,signedUrl])if(u)URL.revokeObjectURL(u);
  originalUrl=null;signedUrl=null;source=null;
  for(const id of ['officialPdfDownload','formalDonePdfDownload']){el(id).hidden=true;el(id).removeAttribute('href');}
  el('officialPdfViewer').hidden=true;el('officialPdfViewer').removeAttribute('data');el('formalDoneResult').hidden=true;
  el('readPdf').checked=false;el('agree').checked=false;
  el('finish').disabled=true;
  for(const id of ['officialPdfSha','formalDonePdfSha','formalDonePdfDate','formalDoneBooking','formalDoneReservation','formalDonePages','caseSummary'])txt(id,'');
 };
 const bind=async k=>{const access=el('uatGate').value.trim();
  need(hex(access,64)&&hex(k,64)&&access!==k,'請輸入私人測試通行碼與案件密鑰');
  gate=access;caseKey=k;expected='UAT_'+(await digest(new TextEncoder().encode(k))).slice(0,24);
 };
 const call=(operation,payload={})=>{
  need(hex(gate,64)&&hex(caseKey,64),'請先核對測試通行碼');
  need(window.google&&google.script&&google.script.run,'GAS 連線尚未可用');
  const k=caseKey;
  if(mutating.has(operation)){need(!unresolved.has(k),'上次操作未確認，請先唯讀核對原案件');unresolved.set(k,operation);}
  return new Promise((resolve,reject)=>{
   google.script.run.withFailureHandler(()=>reject(Error('線上回應不明，請唯讀核對本案，勿重送')))
    .withSuccessHandler(r=>{
     if(!r||r.ok!==true||!Object.prototype.hasOwnProperty.call(r,'value')){
      reject(Error('測試操作未確認，請唯讀核對本案，勿重送'));return;
     }
     // Clear mutations only after the caller validates the value, not the envelope.
     resolve(r.value);
    }).study1E1SyntheticUat({operation,payload,gate,caseKey:k});
  });
 };
 const settle=op=>{if(unresolved.get(caseKey)===op)unresolved.delete(caseKey);};
 const button=(id,fn)=>el(id).addEventListener('click',async()=>{
  if(busy)return;busy=true;
  try{await fn();}catch(e){say('測試未完成：'+e.message);}
  finally{busy=false;}
 });
 const display=c=>{
  need(c&&c.caseId===expected&&/^TEST_(0[1-9]|1[0-2])$/.test(c.alias)&&c.formal===false&&c.persisted===true&&
   ['OTP','SLOTS','HELD','CANCELLED','EXPIRED','CONFIRMED'].includes(c.bookingStatus)&&
   c.stage===(c.bookingStatus==='CONFIRMED'?'DONE':c.bookingStatus),'測試案件或狀態不一致');
  current=c;txt('caseSummary',c.caseId+' · '+c.alias+' · '+c.bookingStatus);
 };
 const slots=(list,operation)=>{
  need(Array.isArray(list)&&list.length<=4&&list.every(s=>s&&/^TEST_SLOT_[1-4]$/.test(s.slotId)&&s.remaining===1&&
   Number.isFinite(Date.parse(s.startAtUtc))&&Date.parse(s.endAtUtc)>Date.parse(s.startAtUtc)),'測試場次格式不一致');
  if(operation==='verify')settle('verify');
  el('slot').replaceChildren();
  for(const s of list){const o=document.createElement('option');o.value=s.slotId;o.textContent=taipei(s.startAtUtc)+' · 剩餘 '+s.remaining;el('slot').appendChild(o);}
  el('hold').disabled=!list.length||unresolved.has(caseKey);
  show('slots');say(list.length?'請選擇合成測試場次。':'合成場次額滿或已過期。');
 };
 const held=c=>{display(c);need(c.bookingStatus==='HELD'&&hex(c.sourceSha,64)&&Number.isFinite(Date.parse(c.holdUntil)),'暫留尚未核實');
  txt('v06Study','實驗一 E1（虛構）');txt('v06Date',taipei(c.startAtUtc));txt('v06Time',taipei(c.startAtUtc)+' – '+taipei(c.endAtUtc));
  txt('v06Place','合成測試場次');txt('v06Email','模擬 OTP 完成');txt('v06Consent','尚未完成測試簽署');txt('holdUntil',taipei(c.holdUntil));
  txt('v06Status','測試暫留已回讀，尚未成立預約。');el('confirm').disabled=false;show('confirm');say('核對後閱讀完整五頁測試 PDF。');};
 const pdf=async (encoded,expectedSha)=>{need(typeof encoded==='string'&&encoded.length<=320000&&hex(expectedSha,64),'測試 PDF 格式不一致');
  const b=bytes(encoded);need(String.fromCharCode(...b.slice(0,5))==='%PDF-'&&await digest(b)===expectedSha,'測試 PDF SHA 不一致');
  return URL.createObjectURL(new Blob([b],{type:'application/pdf'}));};
 const receipt=async c=>{
  need(current&&c&&c.caseId===expected&&c.caseId===current.caseId&&c.sourceSha===current.sourceSha&&
   (!current.signedSha||c.signedSha===current.signedSha)&&c.bookingStatus==='CONFIRMED'&&c.stage==='DONE'&&
   c.persisted===true&&c.formal===false&&c.pageCount===5&&c.sha===c.signedSha&&c.sha!==c.sourceSha&&
   /^\d{4}\/\d{2}\/\d{2}$/.test(c.date),'預約或完整 PDF 未核實');
  const u=await pdf(c.bytes,c.sha);if(signedUrl)URL.revokeObjectURL(signedUrl);signedUrl=u;display(c);
  el('formalDonePdfDownload').href=u;el('formalDonePdfDownload').hidden=false;
  txt('formalDoneBooking','CONFIRMED（測試）');txt('formalDoneReservation',c.caseId);txt('formalDonePdfSha',c.sha);
  txt('formalDonePdfDate',c.date);txt('formalDonePages','5');el('formalDoneResult').hidden=false;show('done');
  say('同案測試預約、完整 PDF 與 SHA 已核實；非正式研究同意。');
 };
 const canvas=el('visitorSignaturePreview'),ctx=canvas.getContext('2d');
 const clearInk=()=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#173341';ctx.lineWidth=3;ctx.lineCap='round';ink=false;previous=null;};
 const pos=e=>{const r=canvas.getBoundingClientRect();return[(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height];};
 canvas.addEventListener('pointerdown',e=>{if(busy||unresolved.has(caseKey))return;e.preventDefault();canvas.setPointerCapture(e.pointerId);previous=pos(e);});
 canvas.addEventListener('pointermove',e=>{if(!previous||busy||unresolved.has(caseKey))return;e.preventDefault();const n=pos(e);
  if(Math.hypot(n[0]-previous[0],n[1]-previous[1])>1){ctx.beginPath();ctx.moveTo(...previous);ctx.lineTo(...n);ctx.stroke();ink=true;previous=n;}});
 for(const e of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(e,()=>previous=null);
 button('visitorSignatureClear',()=>{if(!unresolved.has(caseKey))clearInk();});
 button('chooseE1',()=>show('screen'));
 button('screenNext',async()=>{
  need(el('fictionalEligible').checked,'請確認只使用虛構身分');
  need(!caseKey,'已有本案，請使用唯讀核對，不另建案件');
  const k=random(32);el('caseKey').value=k;await bind(k);
  const c=await call('start',{alias:el('testAlias').value,eligible:true});display(c);need(c.stage==='OTP','案件狀態不一致');settle('start');show('otp');say('請保存測試案件密鑰。模擬驗證碼為 12345678，不會寄信。');
 });
 button('otpVerify',async()=>{need(el('otpInput').value==='12345678','測試驗證碼不符');slots(await call('verify',{code:el('otpInput').value}),'verify');});
 button('formalSlotsRetry',async()=>slots(await call('slots')));
 button('hold',async()=>{el('hold').disabled=true;held(await call('hold',{slotId:el('slot').value,requestId:random(16)}));settle('hold');});
 button('confirm',async()=>{
  need(current&&current.bookingStatus==='HELD','請先核對暫留');
  clearUrls();clearInk();const d=await call('document');
  need(d&&d.caseId===expected&&d.sha===current.sourceSha&&d.pageCount===5,'完整測試原文不一致');
  originalUrl=await pdf(d.bytes,d.sha);source=d.sha;display(current);
  el('officialPdfDownload').href=originalUrl;el('officialPdfDownload').hidden=false;
  el('officialPdfViewer').data=originalUrl;el('officialPdfViewer').hidden=false;
  txt('officialPdfSha',source);el('finish').disabled=unresolved.has(caseKey);show('consent');say('完整閱讀五頁合成文件，只畫虛構筆跡。');
 });
 button('finish',async()=>{
  need(current&&source&&ink&&el('readPdf').checked&&el('agree').checked,'請閱讀完整測試 PDF 並畫虛構筆跡');
  el('finish').disabled=true;
  await receipt(await call('sign',{requestId:random(16),sourceSha:source,ink:canvas.toDataURL('image/png').split(',')[1],read:true,agree:true}));settle('sign');
 });
 const recover=async()=>{
  clearUrls();hideSteps();clearInk();current=null;
  await bind(el('caseKey').value.trim());const c=await call('read');display(c);
  const pending=unresolved.get(caseKey);
  if((pending==='start'&&c.stage==='OTP')||(pending==='verify'&&c.stage==='SLOTS')||
    (pending==='hold'&&c.stage==='HELD')||(pending==='sign'&&c.stage==='DONE')||
    (pending==='cancel'&&['CANCELLED','EXPIRED'].includes(c.stage)))unresolved.delete(caseKey);
  if(c.stage==='DONE')await receipt(await call('copy'));
  else if(c.stage==='HELD')held(c);
  else if(c.stage==='SLOTS')slots(await call('slots'));
  else if(c.stage==='OTP')show('otp');
  else say('本測試案件已結束：'+c.stage);
  if(unresolved.has(caseKey))say('原操作未能確認；保留唯讀核對，不重送。');
 };
 button('readCase',recover);button('formalDoneRefresh',recover);
 button('cancelTest',async()=>{display(await call('cancel'));need(['CANCELLED','EXPIRED'].includes(current.stage),'取消結果未核實');settle('cancel');clearUrls();hideSteps();say('測試案件已結束，請唯讀核對原狀態。');});
 window.addEventListener('pagehide',()=>{clearUrls();gate='';caseKey='';expected='';el('uatGate').value='';});
 clearInk();show('choose');el('step-choose').hidden=false;el('uatOriginalMain').hidden=false;say('私人線上驗收：只使用虛構身分、合成時間與測試筆跡。');
}
function originalVisitor(source=read('gas/Study1Visitor.html')){
 let s=source;
 s=once(s,'<body data-site-mode="FORMAL">','<body data-site-mode="GAS_UAT">');
 s=once(s,'<main class="shell">','<main class="shell" id="uatOriginalMain" hidden>');
 const notice=/<div class="noticebar"[^>]*>[\s\S]*?<\/div>/;
 if(!notice.test(s))throw Error('UAT_ORIGINAL_NOTICE');
 s=s.replace(notice,'<div class="noticebar" role="status">私人 E1 線上隔離驗收｜非正式招募，禁止真實個資及簽名，不寄信</div>');
 const hero=/<div class="hero">[\s\S]*?<\/div><\/header>/;
 if(!hero.test(s))throw Error('UAT_ORIGINAL_HERO');
 s=s.replace(hero,'<div class="hero"><div class="eyebrow">Study1 E1 · 私人線上隔離驗收</div><h1>測試原報名流程</h1><p>只使用虛構身分、合成時段與五頁測試文件；不是正式研究同意。</p></div></header>');
 const edit=(name,fn)=>{
  const re=new RegExp('(<section class="step" id="step-'+name+'"[^>]*>)([\\s\\S]*?)(<\\/section>)');
  if(!re.test(s))throw Error('UAT_ORIGINAL_STEP_'+name);
  s=s.replace(re,(_,a,b,c)=>a+fn(b)+c);
 };
 // Retain original step containers, styling, navigation, PDF object, canvas,
 // scheduling select, final receipt and original control IDs. Remove real
 // contact/health inputs, waitlist controls, and formal-only copy in this mode.
 edit('choose',b=>{
  b=once(b,'id="chooseE1" disabled','id="chooseE1"');
  b=b.replace(/<button[^>]*id="chooseE2"[\s\S]*?<\/button>/,'');
  return b.replace(/<p class="lead">[\s\S]*?<\/p>/,'<p class="lead">僅使用實驗一虛構案件。</p>')
   .replace(/<small id="payE1">[\s\S]*?<\/small>/,'')
   .replace(/<small id="stateE1">[\s\S]*?<\/small>/,'<small id="stateE1">線上隔離測試</small>')
   .replace(/<div class="box">[\s\S]*?<\/div>/,'<div class="box">無正式招募、報酬、個資或真實簽署。</div>');
 });
 edit('screen',b=>b.slice(0,b.indexOf('<p class="lead">'))+
  '<p class="lead">使用固定虛構人物，不填真實姓名、信箱、電話或健康資訊。</p><div class="box"><label for="testAlias" class="field">虛構身分</label><select id="testAlias">'+Array.from({length:12},(_,i)=>'<option>TEST_'+String(i+1).padStart(2,'0')+'</option>').join('')+'</select><label class="check"><input id="fictionalEligible" type="checkbox">僅以虛構身分執行測試</label></div><button id="screenNext" type="button">確認虛構資格並繼續</button>');
 edit('otp',b=>b.slice(0,b.indexOf('<p class="lead">'))+
  '<p class="lead">模擬驗證，不寄信。測試碼 12345678。</p><label class="field" for="otpInput">八位測試碼</label><input id="otpInput" inputmode="numeric" maxlength="8" autocomplete="off"><button id="otpVerify" type="button">驗證並選擇時段</button>');
 edit('slots',b=>b.slice(0,b.indexOf('<p class="lead">'))+
  '<p class="lead">合成場次與共用剩餘名額；送出時伺服器重新核對。</p><label class="field" for="slot">合成時段（臺灣時間）</label><select id="slot"></select><div class="actionrow"><button id="hold" type="button" disabled>暫留此時段並繼續</button><button id="formalSlotsRetry" type="button" class="ghost">重新載入測試時段</button></div>');
 edit('confirm',b=>b.replace(/<p>[\s\S]*?<\/p>/,'<p>核對虛構案件及測試暫留；完整測試 PDF 簽署後才確認。</p>').replace('</dl>','<dt>暫留有效至</dt><dd id="holdUntil"></dd></dl>'));
 edit('consent',b=>{
  b=once(b,'id="officialPdfDownload" class="pdf" hidden download="Study1_Consent_Original.pdf"','id="officialPdfDownload" class="pdf" hidden download="UAT_NOT_CONSENT_original.pdf"');
  let a=b.indexOf('<div id="officialSignedPdfResult"'),z=b.indexOf('</div>\n</div>',a);
  if(a<0||z<a)throw Error('UAT_ORIGINAL_PDF_RESULT');
  b=b.slice(0,a)+b.slice(z+6);
  b=b.replace(/<p class="lead" id="consentStudyTitle">[\s\S]*?<\/p>/,'<p class="lead" id="consentStudyTitle">閱讀完整五頁合成測試 PDF 並畫虛構筆跡。</p>')
    .replace(/<div class="box warn">[\s\S]*?<\/div>/,'<div class="box warn">本文件不是正式知情同意書，請勿寫真名。</div>')
    .replace(/<strong>實驗一／實驗二[^<]*<\/strong>/,'<strong>完整五頁測試原文 PDF</strong>')
    .replace(/<p id="officialPdfStatus"[^>]*>[\s\S]*?<\/p>/,'<p id="officialPdfStatus" class="help">原文已由伺服器及瀏覽器 SHA 核對後才顯示。</p>')
    .replace(/<dd id="officialPdfTitle">[^<]*<\/dd>/,'<dd id="officialPdfTitle">合成測試原文</dd>')
    .replace(/<dd id="officialPdfVersion">[^<]*<\/dd>/,'<dd id="officialPdfVersion">UAT-SYNTHETIC-1</dd>')
    .replace(/<p class="help">原始PDF[^<]*<\/p>/,'<p class="help">不存正式研究資料；只保存測試文件。</p>')
    .replace(/<a id="pdf"[^>]*>[\s\S]*?<\/a>/,'')
    .replace(/<div class="actionrow"><button id="review"[\s\S]*?<\/div>/,'')
    .replace('我已閱讀並理解核准版本的完整知情同意書','已閱讀完整合成測試文件')
    .replace(/<strong>本人手寫簽名[^<]*<\/strong>/,'<strong>僅畫虛構測試筆跡</strong>')
    .replace(/<p class="help">請使用滑鼠[^<]*<\/p>/,'<p class="help">請畫測試記號，不要簽真名。</p>')
    .replace(/<p class="help" id="visitorSignatureStatus"[^>]*>[\s\S]*?<\/p>/,'')
    .replace('我已閱讀完整知情同意書且自願簽署（目前未開放）','同意執行合成簽署測試（非研究同意）')
    .replace('確認簽署（目前未開放）','合成完整測試 PDF 並確認預約')
    .replace(/<p class="help" id="consentStatus">[\s\S]*?<\/p>/,'');
  return b;
 });
 edit('done',b=>b.replace('E1 正式報名狀態｜獨立來源核對','E1 測試狀態｜同案回讀')
  .replace('預約結果尚未核實','隔離測試預約已確認')
  .replace('必須先驗證完整簽署PDF及原Reservations的本人預約結果。','已核對隔離測試預約與完整五頁 PDF。')
  .replace('<dt>郵件通知狀態</dt><dd>未由此頁驗證寄送；請以正式通知來源為準</dd>','<dt>完整 PDF 頁數</dt><dd id="formalDonePages"></dd><dt>郵件通知</dt><dd>測試不寄信</dd>')
  .replace('Study1_E1_Signed_Consent.pdf','UAT_NOT_CONSENT_signed.pdf').replace('唯讀重新查核本人原 Reservations 狀態','唯讀重新核對測試案件')
  .replace(/<button type="button" id="formalDoneBack"[^>]*>[\s\S]*?<\/button>/,''));
 s=once(s,'<div id="status" role="status" aria-live="polite">','<div class="box"><label for="uatGate" class="field">私人測試通行碼</label><input id="uatGate" type="password" maxlength="64" autocomplete="off"><label for="caseKey" class="field">本案測試密鑰（建立時自動產生，請安全保存）</label><input id="caseKey" type="password" maxlength="64" autocomplete="off"><button id="readCase" type="button" class="ghost">唯讀重新核對原測試案件</button><p id="caseSummary" class="help"></p><button id="cancelTest" type="button" class="ghost">取消尚未完成的測試</button></div><div id="status" role="status" aria-live="polite">');
 s=once(s,'<footer>Study1 · NSTC 115-2410-H-033-015｜正式報名以核准程序與公告為準</footer>','<footer>Study1 · 私人隔離驗收｜不是研究同意</footer>');
 const start=s.indexOf('<script>\n'),end=s.lastIndexOf('</script>');
 if(start<0||end<=start||s.indexOf('<script>',start+1)>=0)throw Error('UAT_ORIGINAL_CONTROLLER_ANCHOR');
 s=s.slice(0,start)+'<script>\n('+gasController.toString()+')();\n</script>'+s.slice(end+9);
 if(/id="(?:formalContact|formalName|formalEmail|formalPhone|screenQuestions|chooseE2)"|study1FormalHoldSlot|study1ParticipantBegin/.test(s))throw Error('UAT_ORIGINAL_FORMAL_INPUT_REMAINS');
 return s;
}
// Source candidate only: a separate MYSELF owner-controlled profile of the
// existing V2 project, same original apply view. Never accepted by the
// existing public release/HEAD-only guards or called by a deploy workflow.
function onlineCandidate(input){
 const core=require('./study1-v2-gas-head-only.cjs');
 // Assembly is independent of the last reviewed UI mode. All modes MUST
 // derive from this checkout's unchanged, closed public source, never
 // inherit the OWNER management RPCs or use remote HEAD as the build base.
 // This is only local assembly, NOT remote inventory proof or permission
 // to sync, create a version, or deploy. Existing release guards stay strict.
 const base=core.localSources();
 const canonicalSha=core.digest(base);
 if(input!==undefined){
  const inputSha=core.digest(input);
  if(inputSha!==canonicalSha&&
     inputSha!==core.digest(core.anonymousReadOnlyCandidate(base))&&
     inputSha!==core.digest(core.privateOwnerManagementCandidate(base)))
   throw Error('UAT_BASE_INVENTORY');
 }
 if(core.closedManifest(base).webapp.access!=='ANYONE'||JSON.stringify(base.map(f=>f.name).sort())!==JSON.stringify(core.APPROVED))throw Error('UAT_BASE_INVENTORY');
 core.closedWebsite(base);core.publicRpcSurface(base);
 const files=base.map(f=>{
  if(f.name==='appsscript'){const m=JSON.parse(f.source);m.webapp.access='MYSELF';return {...f,source:JSON.stringify(m,null,2)+'\n'};}
  if(f.name==='Study1Visitor')return {...f,source:originalVisitor(f.source)};
  if(f.name==='Website'){
   let source=once(f.source,"  const t=HtmlService.createTemplateFromFile('Study1Visitor');","  study1AdminOwnerRequired_();\n  study1UatTrustedConfig_();\n  const t=HtmlService.createTemplateFromFile('Study1Visitor');");
   source=once(source,"t.flowMode='FORMAL';","t.flowMode='GAS_UAT';");
   source+='\nasync function study1E1SyntheticUat(request){\n try{study1AdminOwnerRequired_();}catch(_){return {ok:false,error:"UAT_REQUEST_REJECTED"};}\n return study1UatControlledRequest_(request);\n}\n';
   return {...f,source};
  }
  return {...f};
 });
 for(const [name,p] of [['Study1UatSession','scripts/study1-v2-uat-session.js'],['Study1UatStoreTransaction','scripts/study1-v2-uat-store-transaction.js'],['Study1UatGasServices','scripts/study1-v2-uat-gas-services.js']]){
  if(files.some(f=>f.name===name))throw Error('UAT_SOURCE_COLLISION');
  let source=read(p);
  if(name==='Study1UatSession'){
   const split=source.indexOf('/* Isolated E1 usability session, no real identity, persistence, or network.');
   if(split<=0||source.indexOf('function study1UatSession(',split)<0)throw Error('UAT_DOCUMENT_SOURCE_ANCHOR');
   source=source.slice(0,split);
  }
  // None of the added server kernels may export a callable global RPC.
  const globals=[...source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m=>m[1]);
  if(!globals.length||globals.some(n=>!n.endsWith('_')))throw Error('UAT_PRIVATE_KERNEL_SURFACE');
  files.push({name,type:'SERVER_JS',source});
 }
 core.digest(files);core.closedWebsite(files);
 if(core.closedManifest(files).webapp.access!=='MYSELF')throw Error('UAT_PRIVATE_ACL_REQUIRED');
 let rejected=false;try{core.publicRpcSurface(files);}catch(_){rejected=true;}
 if(!rejected)throw Error('UAT_MUST_NOT_PASS_PUBLIC_RELEASE_GUARD');
 return files;
}

/* Same official site, same original template. This is local integration
 * source only; it is NOT an approved deploy profile or a workflow entry.
 * The currently deployed public read-only contract remains unchanged.
 */
function sameSiteVisitor(source=read('gas/Study1Visitor.html')){
 const start=source.indexOf('<body data-site-mode="FORMAL">'),end=source.lastIndexOf('</body>');
 if(start<0||end<=start)throw Error('SAME_SITE_VISITOR_ANCHOR');
 let test=originalVisitor(source);
 const b=test.indexOf('<body data-site-mode="GAS_UAT">'),e=test.lastIndexOf('</body>');
 if(b<0||e<=b)throw Error('SAME_SITE_VISITOR_ANCHOR');
 test=test.slice(b,e+7).replace('私人 E1 線上隔離驗收｜非正式招募','正式網站 · E1 測試模式｜非正式招募')
  .replace('私人線上驗收：只使用虛構身分','同站測試：只使用虛構身分');
 const formal=once(source.slice(start,end+7),'</nav>',
  '<? if (siteOwner) { ?><a href="<?= siteAppUrl + \'?view=apply&test=1\' ?>" target="_top">研究團隊測試</a><a href="<?= siteAppUrl + \'?view=admin\' ?>" target="_top">測試資料管理</a><? } ?></nav>');
 return source.slice(0,start)+"<? if (flowMode === 'GAS_UAT') { ?>\n"+test+"\n<? } else { ?>\n"+formal+"\n<? } ?>"+source.slice(end+7);
}
function sameSiteCleanupController(){
 'use strict';
 const el=id=>document.getElementById(id);
 const preview=el('siteTestPreview'),clear=el('siteTestClear'),summary=el('siteTestCleanupSummary'),gateOut=el('siteTestNewGate');
 if(!preview||!clear||!summary||!gateOut)return;
 gateOut.value='';gateOut.hidden=true;
 window.addEventListener('pagehide',()=>{gateOut.value='';gateOut.hidden=true;});
 const casesOut=el('siteTestCases'),slotsOut=el('siteTestSlots'),recover=el('siteTestRecoverGate');
 if(!casesOut||!slotsOut||!recover)return;
 let current=null,busy=false,unknown=false,cleared=false;
 const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
 const valid=c=>c&&['cases','holds','confirmed','pdfs'].every(k=>Number.isInteger(c[k])&&c[k]>=0&&c[k]<=12)&&c.holds+c.confirmed<=c.cases&&c.pdfs===c.confirmed;
 const say=s=>{summary.textContent=s;};
 const labels={OTP:'待驗證',SLOTS:'待選時段',HELD:'暫留',CONFIRMED:'已確認',CANCELLED:'已取消',EXPIRED:'已逾期'};
 const exact=(obj,keys)=>obj&&Object.keys(obj).sort().join(',')===keys.slice().sort().join(',');
 const iso=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
 const validLists=p=>{
  if(!Array.isArray(p.cases)||p.cases.length!==p.counts.cases||!Array.isArray(p.slots)||p.slots.length<1||p.slots.length>4)return false;
  if(!p.slots.every(s=>exact(s,['slotId','startAtUtc','endAtUtc','capacity','occupied','remaining','bookable'])&&
   /^TEST_SLOT_[1-4]$/.test(s.slotId)&&iso(s.startAtUtc)&&iso(s.endAtUtc)&&s.startAtUtc<s.endAtUtc&&
   s.capacity===1&&[0,1].includes(s.occupied)&&s.remaining===1-s.occupied&&
   typeof s.bookable==='boolean'&&(!s.bookable||s.remaining===1)))return false;
  if(new Set(p.slots.map(s=>s.slotId)).size!==p.slots.length)return false;
  if(!p.cases.every(c=>exact(c,['alias','state','slotId','pdfSaved'])&&/^TEST_(0[1-9]|1[0-2])$/.test(c.alias)&&
   Object.prototype.hasOwnProperty.call(labels,c.state)&&(c.slotId===null||p.slots.some(s=>s.slotId===c.slotId))&&
   (!['HELD','CONFIRMED','EXPIRED'].includes(c.state)||c.slotId!==null)&&
   (!['OTP','SLOTS'].includes(c.state)||c.slotId===null)&&c.pdfSaved===(c.state==='CONFIRMED')))return false;
  return new Set(p.cases.map(c=>c.alias)).size===p.cases.length&&
   p.cases.filter(c=>c.state==='HELD').length===p.counts.holds&&
   p.cases.filter(c=>c.state==='CONFIRMED').length===p.counts.confirmed&&
   p.slots.every(s=>s.occupied===p.cases.filter(c=>c.slotId===s.slotId&&['HELD','CONFIRMED'].includes(c.state)).length);
 };
 const showLists=p=>{
  casesOut.textContent=p.cases.length?p.cases.map(c=>c.alias+'｜'+labels[c.state]+'｜'+(c.slotId||'未選時段')+'｜'+(c.pdfSaved?'已保存測試 PDF':'無簽署 PDF')).join('\n'):'目前無測試案件';
  const local=s=>new Date(s).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
  slotsOut.textContent=p.slots.map(s=>s.slotId+'｜'+local(s.startAtUtc)+' – '+local(s.endAtUtc)+'｜已占 '+s.occupied+'/'+s.capacity+'｜剩餘 '+s.remaining+'｜'+(s.bookable?'可預約':'不可預約')).join('\n');
 };
 const emptyLists=()=>{casesOut.textContent='尚未核實測試案件';slotsOut.textContent='尚未核實測試場次';};
 const describe=c=>'測試案件 '+c.cases+' 筆；有效暫留 '+c.holds+' 筆；已確認預約 '+c.confirmed+' 筆；測試 PDF '+c.pdfs+' 份。此流程不寄信、不寫正式研究資料。';
 const buttons=()=>{preview.disabled=busy;clear.disabled=busy||unknown||cleared||!current||current.counts.cases===0;
  recover.disabled=busy||unknown||cleared||!current||current.counts.cases!==0;};
 const call=request=>new Promise((resolve,reject)=>{
  if(!window.google||!google.script||!google.script.run){reject(Error('GAS_UNAVAILABLE'));return;}
  google.script.run.withFailureHandler(()=>reject(Error('GAS_UNKNOWN')))
   .withSuccessHandler(x=>{if(x&&x.ok===true)resolve(x.value);else reject(Error(x&&x.error==='UAT_CLEANUP_UNKNOWN_READBACK'?'GAS_UNKNOWN':'DENIED'));})
   .study1SiteTestCleanup(request);
 });
 preview.addEventListener('click',async()=>{
  if(busy)return;busy=true;current=null;emptyLists();buttons();
  try{
   if(unknown){
    const result=await call({mode:'reconcile'});
    if(!exact(result,['formal','scope','state','readOnly'])||result.formal!==false||result.scope!=='SYNTHETIC_CASES_ONLY'||result.readOnly!==true)throw Error('BAD_RECONCILIATION');
    const messages={MATCHED_EMPTY:'目前測試資料為空，設定與資料表標記相符；仍須管理者核對新通行碼，不能推定前次清除已成功。',
     MATCHED_NONEMPTY:'目前設定與資料表標記相符，但仍有測試案件；不能推定前次清除未執行。',
     CONFIG_MISMATCH_EMPTY:'測試資料表已空，但通行碼設定與資料表標記不一致；暫停測試，交管理者核對。'};
    if(!Object.prototype.hasOwnProperty.call(messages,result.state))throw Error('BAD_RECONCILIATION');
    say(messages[result.state]+' 本查核未寫入或重送清除。');return;
   }
   const p=await call({mode:'preview'});
   if(!p||p.formal!==false||p.scope!=='SYNTHETIC_CASES_ONLY'||!hex(p.snapshotSha)||!valid(p.counts)||!validLists(p))throw Error('BAD_PREVIEW');
   showLists(p);
   if(!unknown&&!cleared)current=p;
   say(describe(p.counts)+(p.counts.cases===0?' 若遺失測試通行碼，可確認後重新產生，不清除資料。':' 請確認後清空。'));
  }catch(_){say('無法取得可信預覽：測試設定、管理權限或前次清除狀態尚待核對。未送出刪除。');}
  finally{busy=false;buttons();}
 });
 clear.addEventListener('click',async()=>{
  if(busy||unknown||cleared||!current||current.counts.cases===0)return;
  if(!window.confirm(describe(current.counts)+'\n確定只清空這些測試紀錄？清除成功後將自動更新測試通行碼，舊案件及舊通行碼立即失效。'))return;
  if(!window.crypto||typeof window.crypto.getRandomValues!=='function'){say('瀏覽器安全亂數不可用，未送出清除。');return;}
  let entropy;
  try{entropy=Array.from(window.crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
  catch(_){say('無法產生安全亂數，未送出清除。');return;}
  const p=current;current=null;busy=true;emptyLists();buttons();
  try{
   const result=await call({mode:'clear',expectedSha:p.snapshotSha,confirmation:'CLEAR_TEST_ONLY',entropy});
   if(!result||result.formal!==false||result.scope!=='SYNTHETIC_CASES_ONLY'||!valid(result.cleared)||
    ['cases','holds','confirmed','pdfs'].some(k=>result.cleared[k]!==p.counts[k])||
    result.remainingCases!==0||result.remainingPdfCopies!==0||result.gateRotationRequired!==false||!hex(result.replacementGate))throw Error('BAD_RECEIPT');
   cleared=true;gateOut.value=result.replacementGate;gateOut.hidden=false;
   casesOut.textContent='已核實清空，無測試案件';slotsOut.textContent='測試名額已釋放；請重新預覽核對目前可約場次。';
   say('已核實清除。'+describe(result.cleared)+' 測試名額已釋放，測試通行碼已更新。請安全複製下方新碼，再返回本網站開始下一次測試。');
  }catch(e){
   // A denied or malformed clear response may not establish whether a
   // mutation occurred. Freeze destructive action on this page.
   unknown=true;say('清除未獲完整確認；請先唯讀查核，不重送清除。');
  }finally{busy=false;buttons();}
 });
 recover.addEventListener('click',async()=>{
  if(busy||unknown||cleared||!current||current.counts.cases!==0)return;
  if(!window.confirm('確認目前沒有測試案件，重新產生測試通行碼？只更新測試設定及資料表標記，不刪除案件。'))return;
  let entropy;
  try{entropy=Array.from(window.crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
  catch(_){say('瀏覽器安全亂數不可用，未送出更新。');return;}
  const p=current;current=null;busy=true;buttons();
  try{
   const result=await call({mode:'recover_gate',expectedSha:p.snapshotSha,confirmation:'RECOVER_EMPTY_TEST_GATE',entropy});
   if(!exact(result,['formal','scope','gateRecovered','remainingCases','gateRotationRequired','replacementGate'])||
    result.formal!==false||result.scope!=='SYNTHETIC_CASES_ONLY'||result.gateRecovered!==true||
    result.remainingCases!==0||result.gateRotationRequired!==false||!hex(result.replacementGate))throw Error('BAD_GATE_RECEIPT');
   cleared=true;gateOut.value=result.replacementGate;gateOut.hidden=false;
   say('已核實更新測試通行碼；沒有刪除案件。請安全複製新碼。');
  }catch(_){unknown=true;emptyLists();say('通行碼更新結果未確認；請先唯讀查核，不重送。');}
  finally{busy=false;buttons();}
 });
 buttons();
}
function sameSiteAdmin(source=read('gas/AdminConsole.html')){
 // Preserve the original admin shell, style and controls in the repository.
 // The same-site test management view does not initialize formal/sandbox RPCs.
 const start=source.indexOf('<main>'),end=source.lastIndexOf('</main>');
 if(start<0||end<=start)throw Error('SAME_SITE_ADMIN_ANCHOR');
 const section='<main><section id="siteTestCleanup"><h2>測試資料管理</h2><p>只清除本網站專用測試案件、預約與內嵌簽署 PDF。不影響正式資料。</p><p><a href="<?= siteAppUrl + \'?view=apply&test=1\' ?>" target="_top">返回本網站測試報名</a></p><button id="siteTestPreview" type="button" class="secondary">重新載入名單、場次與清除預覽</button><h3>測試報名與預約名單</h3><div id="siteTestCases" class="booking-feedback" role="status">尚未核實測試案件</div><h3>測試場次與剩餘名額（臺灣時間）</h3><div id="siteTestSlots" class="booking-feedback" role="status">尚未核實測試場次</div><button id="siteTestClear" type="button" disabled>清空測試資料</button><button id="siteTestRecoverGate" type="button" disabled>遺失通行碼：重新產生（僅空表）</button><p id="siteTestCleanupSummary" role="status" aria-live="polite">先預覽，再確認清除。</p><input id="siteTestNewGate" type="text" readonly hidden autocomplete="off" spellcheck="false" aria-label="新測試通行碼；只供管理者複製，不存於網址"></section></main>';
 return source.slice(0,start)+section+'<script>\n('+sameSiteCleanupController.toString()+')();\n</script></body></html>';
}
// Enforce the existing same-site CI source delta in the actual assembler,
// not just its test/report. This is a local source contract only: the
// public release guard and releaseFiles allowlist still reject this profile.
function requireSameSiteSourceDelta(anonymous,result){
 const core=require('./study1-v2-gas-head-only.cjs');
 const sha=core.digest(result);
 core.digest(anonymous);
 const need=(ok,reason)=>{if(!ok)throw Error('SAME_SITE_SOURCE_DELTA: '+reason);};
 const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const modified=['AdminConsole','Study1Visitor','Website'];
 const added=['Study1UatGasServices','Study1UatSession','Study1UatStoreTransaction'];
 const baseNames=anonymous.map(f=>f.name).sort();
 need(eq(baseNames,core.APPROVED),'baseline inventory');
 need(eq(result.map(f=>f.name).sort(),[...baseNames,...added].sort()),'candidate inventory');
 const base=new Map(anonymous.map(f=>[f.name,f])),candidate=new Map(result.map(f=>[f.name,f]));
 const changed=[];
 for(const file of anonymous){
  const next=candidate.get(file.name);
  need(next.type===file.type,'file type changed: '+file.name);
  if(next.source!==file.source)changed.push(file.name);
 }
 need(eq(changed.sort(),modified),'unexpected source changes');
 // The existing anonymous manifest must remain byte-for-byte unchanged.
 // The inherited public RPCs remain closed; only these two OWNER-gated
 // entry points may be added for the same-site TEST product.
 const globals=source=>[...source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m=>m[1]).filter(n=>!n.endsWith('_')).sort();
 need(eq(globals(candidate.get('Website').source),[...globals(base.get('Website').source),'study1E1SyntheticUat','study1SiteTestCleanup'].sort()),'unexpected Website RPC change');
 for(const name of added){
  const f=candidate.get(name);
  need(f.type==='SERVER_JS'&&globals(f.source).length===0,'unexpected kernel surface: '+name);
 }
 return sha;
}
function sameSiteCandidate(){
 const core=require('./study1-v2-gas-head-only.cjs'),base=core.localSources();
 const prior=onlineCandidate(base),anonymous=core.anonymousReadOnlyCandidate(base);
 const get=(files,name)=>files.find(f=>f.name===name);
 const result=prior.map(f=>{
  if(f.name==='appsscript')return {...get(anonymous,f.name)};
  if(f.name==='Study1Visitor')return {...f,source:sameSiteVisitor(get(base,f.name).source)};
  if(f.name==='AdminConsole')return {...f,source:sameSiteAdmin(get(base,f.name).source)};
  if(f.name!=='Website')return f;
  let source=get(base,'Website').source;
  source=once(source,'function doGet(e){',`function doGet(e){
 if(e&&e.parameter&&e.parameter.view==='admin'){
  study1AdminOwnerRequired_();
  study1UatTrustedConfig_();
  const t=HtmlService.createTemplateFromFile('AdminConsole');
  t.siteAppUrl=study1V2SelfWebUrl_();
  return t.evaluate().setTitle('Study 1｜測試資料管理').addMetaTag('viewport','width=device-width, initial-scale=1');
 }`);
  source=once(source,"  t.flowMode='FORMAL';",`  t.flowMode='FORMAL';
  t.siteOwner=false;
  try{study1AdminOwnerRequired_();t.siteOwner=true;}catch(_){}
  if(e.parameter.test==='1'){
   study1AdminOwnerRequired_();
   study1UatTrustedConfig_();
   t.flowMode='GAS_UAT';
  }`);
  source+='\nasync function study1E1SyntheticUat(request){\n try{study1AdminOwnerRequired_();}catch(_){return {ok:false,error:"UAT_REQUEST_REJECTED"};}\n return study1UatControlledRequest_(request);\n}\n';
  source+='\nfunction study1SiteTestCleanup(request){\n return study1SiteTestCleanupRequest_(request);\n}\n';
  return {...f,source};
 });
 requireSameSiteSourceDelta(anonymous,result);core.closedWebsite(result);
 if(JSON.parse(get(result,'appsscript').source).webapp.access!=='ANYONE_ANONYMOUS')throw Error('SAME_SITE_MANIFEST');
 // Do not relax or opt out of the existing deployment guard; this new
 // product integration is intentionally not a valid release target yet.
 let rejected=false;try{core.publicRpcSurface(result);}catch(_){rejected=true;}
 if(!rejected)throw Error('SAME_SITE_REQUIRES_RELEASE_REVIEW');
 return result;
}

/* Evidence-only check for the later, independently authorized update of
 * ONE existing official deployment. Unlike the old create-deployment path,
 * the ID and URL must not change. Consumes already obtained GET snapshots;
 * no network, credentials, workflow trigger, permission or mutation. It
 * deliberately does NOT change sourceProof, publicRpcSurface, releaseFiles
 * or the original deployment guard. It cannot authorize a publication. */
function verifySameSiteReadback({before,after,priorDirect,currentDirect,newContent,reviewedTargetSha256}){
 const core=require('./study1-v2-gas-head-only.cjs'),d=require('./study1-v2-private-deploy.cjs');
 const need=(v,m)=>{if(!v)throw Error('SAME_SITE_READBACK_UNVERIFIED: '+m);};
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const reviewed=sameSiteCandidate(),target=core.digest(reviewed);
 need(reviewedTargetSha256===target,'reviewed checkout digest differs');
 const snapshots=[before,after].map(s=>{
  need(s&&Array.isArray(s.proofs),'incomplete inventory');
  const versions=d.normalizedVersions(s.versions),deployments=d.normalizedDeployments(s.deps,true);
  const head=core.verifyRemote(s.head);
  need(s.headSha===head.sha&&s.proofs.length===versions.length&&
   versions.every((v,i)=>s.proofs[i]?.version===v.version)&&
   s.fp===d.fingerprint(s.versions,s.deps,head.sha,s.proofs,true),'inventory evidence inconsistent');
  need(deployments.filter(x=>x.kind==='HEAD').length===1,'development deployment missing');
  return {versions,deployments,head,proofs:s.proofs};
 });
 const [a,b]=snapshots;
 need(before.safe===true&&d.sourceProof(before.head,true).known&&a.proofs.every(p=>p.known===true),'unverified previous source');
 const isAnon=x=>x.kind==='VERSIONED'&&x.points.length===1&&x.points[0].type==='WEB_APP'&&
  x.points[0].web?.access==='ANYONE_ANONYMOUS'&&x.points[0].web.executeAs==='USER_DEPLOYING'&&
  /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(x.points[0].web.url);
 const oldOfficial=a.deployments.filter(isAnon);
 need(oldOfficial.length===1,'original official deployment ambiguous');
 const prior=oldOfficial[0],current=b.deployments.find(x=>x.id===prior.id);
 need(a.proofs.some(p=>p.version===prior.version&&p.known&&p.access==='ANYONE_ANONYMOUS'),'original deployment source unknown');
 need(equal(d.normalizedDeployments([priorDirect],true)[0],prior),'previous direct/list mismatch');
 need(current&&isAnon(current)&&current.version!==prior.version&&current.manifest===prior.manifest&&
  equal(current.points,prior.points),'official deployment identity, URL or ACL changed');
 need(equal(d.normalizedDeployments([currentDirect],true)[0],current),'current direct/list mismatch');
 need(equal(a.deployments.filter(x=>x.id!==prior.id),b.deployments.filter(x=>x.id!==prior.id)),
  'another deployment changed or a deployment was added/removed');
 const added=b.versions.filter(x=>!a.versions.some(v=>v.version===x.version));
 need(added.length===1&&added[0].version===current.version&&
  equal(b.versions.filter(x=>x.version!==current.version),a.versions),'immutable version inventory changed unexpectedly');
 need(equal(b.proofs.filter(x=>x.version!==current.version),a.proofs),'historical version content changed');
 const newProof=b.proofs.find(p=>p.version===current.version),immutable=core.verifyRemote(newContent);
 need(b.head.sha===target&&immutable.sha===target&&newProof?.sha===target&&
  immutable.count===reviewed.length&&newProof.count===reviewed.length&&b.head.count===reviewed.length,
  'HEAD or new immutable version does not match reviewed source');
 // The historical guard is expected not to recognize this candidate yet.
 // Source equality and semantic deployment identity are evidence, not a
 // replacement for that guard or for the actual browser/runtime acceptance.
 return {readbackVerified:true,releaseAuthorized:false,runtimeVerified:false,
  sameOfficialUrl:true,otherDeploymentsUnchanged:true,historicalVersionsUnchanged:true,
  version:current.version,sourceSha256:target};
}

module.exports={originalVisitor,gasController,onlineCandidate,sameSiteVisitor,sameSiteAdmin,sameSiteCleanupController,sameSiteCandidate,requireSameSiteSourceDelta,verifySameSiteReadback};
