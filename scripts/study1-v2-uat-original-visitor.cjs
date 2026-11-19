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
 const mutating=new Set(['start','emailStart','verify','hold','sign','cancel']);
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
      const known=['UAT_EMAIL_OTP_ALREADY_ISSUED','UAT_EMAIL_OTP_DELIVERY_UNKNOWN','UAT_EMAIL_OTP_USED','UAT_EMAIL_OTP_EXPIRED','UAT_EMAIL_OTP_INVALID','UAT_TURNSTILE_REQUIRED','UAT_TURNSTILE_REUSED','BOT_PROTECTION_REJECTED','BOT_PROTECTION_PROVIDER_NOT_READY','timeout-or-duplicate'];
      if(known.includes(r?.error)){settle(operation);reject(Error(r.error));return;}
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
  const humanToken=el('siteTurnstileToken').value;
  need(typeof humanToken==='string'&&humanToken.length>=25,'請先完成 Turnstile 驗證');
  const k=random(32);el('caseKey').value=k;await bind(k);
  const email=el('testEmailOtp').checked,op=email?'emailStart':'start';
  el('siteTurnstileToken').value='';
  const c=await call(op,{alias:el('testAlias').value,eligible:true,humanToken});display(c);need(c.stage==='OTP','案件狀態不一致');settle(op);show('otp');
  el('uatOtpMode').textContent=email?'從研究室測試信箱取得八位驗證碼，五分鐘內有效。':'模擬驗證，不寄信。測試碼 12345678。';
  say(email?'寄信服務已接受，請到研究室測試信箱確認收件。':'模擬驗證碼為 12345678，不會寄信。');
 });
 button('otpVerify',async()=>{need(/^\d{8}$/.test(el('otpInput').value),'測試驗證碼格式不符');slots(await call('verify',{code:el('otpInput').value}),'verify');el('uatOtpReplay').hidden=!el('testEmailOtp').checked;});
 button('uatOtpReplay',async()=>{
  await call('verify',{code:el('otpInput').value});
  throw Error('UAT_EMAIL_OTP_REPLAY_UNEXPECTEDLY_ACCEPTED');
 });
 button('formalSlotsRetry',async()=>slots(await call('slots')));
 button('hold',async()=>{el('hold').disabled=true;held(await call('hold',{slotId:el('slot').value,requestId:random(16)}));settle('hold');});
 button('confirm',async()=>{
  need(current&&current.bookingStatus==='HELD','請先核對暫留');
  clearUrls();clearInk();const d=await call('document');
  need(d&&d.caseId===expected&&d.sha===current.sourceSha&&d.pageCount===5&&['UAT-SYNTHETIC-1','UAT-SYNTHETIC-2'].includes(d.version),'完整測試原文不一致');
  originalUrl=await pdf(d.bytes,d.sha);source=d.sha;display(current);
  el('officialPdfDownload').href=originalUrl;el('officialPdfDownload').hidden=false;
  el('officialPdfViewer').data=originalUrl;el('officialPdfViewer').hidden=false;
  txt('officialPdfSha',d.version+'｜'+source);el('finish').disabled=unresolved.has(caseKey);show('consent');say('完整閱讀五頁合成文件，只畫虛構筆跡。');
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
  if((['start','emailStart'].includes(pending)&&c.stage==='OTP')||(pending==='verify'&&c.stage==='SLOTS')||
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
 s=s.replace(notice,'<div class="noticebar" role="status">私人 E1 線上隔離驗收｜禁止真實個資與簽名；選用 Email OTP 時只寄研究室測試信箱</div>');
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
  '<p class="lead">使用固定虛構人物，不填真實姓名、信箱、電話或健康資訊。</p><div class="box"><label for="testAlias" class="field">虛構身分</label><select id="testAlias">'+Array.from({length:12},(_,i)=>'<option>TEST_'+String(i+1).padStart(2,'0')+'</option>').join('')+'</select><label class="check"><input id="fictionalEligible" type="checkbox">僅以虛構身分執行測試</label><label class="check"><input id="testEmailOtp" type="checkbox">寄送隔離 Email OTP 到研究室測試信箱</label></div><button id="screenNext" type="button">確認虛構資格並繼續</button>');
 edit('otp',b=>b.slice(0,b.indexOf('<p class="lead">'))+
  '<p class="lead" id="uatOtpMode">模擬驗證，不寄信。測試碼 12345678。</p><label class="field" for="otpInput">八位測試碼</label><input id="otpInput" inputmode="numeric" maxlength="8" autocomplete="off"><button id="otpVerify" type="button">驗證並選擇時段</button>');
 edit('slots',b=>b.slice(0,b.indexOf('<p class="lead">'))+
  '<p class="lead">合成場次與共用剩餘名額；送出時伺服器重新核對。</p><label class="field" for="slot">合成時段（臺灣時間）</label><select id="slot"></select><div class="actionrow"><button id="hold" type="button" disabled>暫留此時段並繼續</button><button id="formalSlotsRetry" type="button" class="ghost">重新載入測試時段</button><button id="uatOtpReplay" type="button" class="ghost" hidden>驗證同一測試碼無法重用</button></div>');
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
 s=s.replace('<button id="screenNext"','<button id="siteTurnstileLoad" type="button">載入報名前 Turnstile 挑戰</button><div id="siteTurnstileWidget"></div><input id="siteTurnstileToken" type="hidden"><button id="siteTurnstileVerify" type="button" hidden disabled>驗證</button><p id="siteTurnstileStatus" role="status"></p><button id="screenNext"');
 const controllerStart=s.indexOf('<script>\n'),controllerEnd=s.lastIndexOf('</script>');
 s=s.slice(0,controllerStart)+'<script>\n('+gasController.toString()+')();\n('+sameSiteTurnstileController.toString()+')();\n</script>'+s.slice(controllerEnd+9);
 if(/id="(?:formalContact|formalName|formalEmail|formalPhone|screenQuestions|chooseE2)"|study1FormalHoldSlot|study1ParticipantBegin/.test(s))throw Error('UAT_ORIGINAL_FORMAL_INPUT_REMAINS');
 return s;
}
// Source candidate only: a separate MYSELF owner-controlled profile of the
// existing V2 project, same original apply view. Never accepted by the
// existing public release/HEAD-only guards or called by a deploy workflow.
function onlineCandidate(input){
 const core=require('./study1-v2-release-source.cjs');
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
 let current=null,busy=false,unknown=false,cleared=false,visibleSnapshot=null;
 const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
 const valid=c=>c&&['cases','holds','confirmed','pdfs'].every(k=>Number.isInteger(c[k])&&c[k]>=0&&c[k]<=12)&&c.holds+c.confirmed<=c.cases&&c.pdfs===c.confirmed;
 const say=s=>{summary.textContent=s;};
 const labels={OTP:'待驗證',SLOTS:'待選時段',HELD:'暫留',CONFIRMED:'已確認',CANCELLED:'已取消',EXPIRED:'已逾期'};
 const otpLabels={SIMULATED_PENDING:'模擬 OTP 待驗證',SIMULATED_VERIFIED:'模擬 OTP 已驗證',SIMULATED_CANCELLED:'模擬 OTP 案件已取消',EMAIL_PENDING:'Email OTP 待驗證（寄達未確認）',EMAIL_EXPIRED:'Email OTP 已過期（寄達未確認）',EMAIL_VERIFIED:'Email OTP 已驗證',EMAIL_CANCELLED:'Email OTP 案件已取消'};
 const otpMatches=c=>Object.prototype.hasOwnProperty.call(otpLabels,c.otpStatus)&&
  (c.state==='OTP'?['SIMULATED_PENDING','EMAIL_PENDING','EMAIL_EXPIRED'].includes(c.otpStatus):
   c.state==='CANCELLED'?['SIMULATED_CANCELLED','EMAIL_CANCELLED'].includes(c.otpStatus):
    ['SIMULATED_VERIFIED','EMAIL_VERIFIED'].includes(c.otpStatus));
 const exact=(obj,keys)=>obj&&Object.keys(obj).sort().join(',')===keys.slice().sort().join(',');
 const iso=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
 const validLists=p=>{
  if(!Array.isArray(p.cases)||p.cases.length!==p.counts.cases||!Array.isArray(p.slots)||p.slots.length<1||p.slots.length>4)return false;
  if(!p.slots.every(s=>exact(s,['slotId','startAtUtc','endAtUtc','capacity','occupied','remaining','bookable'])&&
   /^TEST_SLOT_[1-4]$/.test(s.slotId)&&iso(s.startAtUtc)&&iso(s.endAtUtc)&&s.startAtUtc<s.endAtUtc&&
   s.capacity===1&&[0,1].includes(s.occupied)&&s.remaining===1-s.occupied&&
   typeof s.bookable==='boolean'&&(!s.bookable||s.remaining===1)))return false;
  if(new Set(p.slots.map(s=>s.slotId)).size!==p.slots.length)return false;
  if(!p.cases.every(c=>exact(c,['alias','state','slotId','pdfSaved','otpStatus'])&&otpMatches(c)&&/^TEST_(0[1-9]|1[0-2])$/.test(c.alias)&&
   Object.prototype.hasOwnProperty.call(labels,c.state)&&(c.slotId===null||p.slots.some(s=>s.slotId===c.slotId))&&
   (!['HELD','CONFIRMED','EXPIRED'].includes(c.state)||c.slotId!==null)&&
   (!['OTP','SLOTS'].includes(c.state)||c.slotId===null)&&c.pdfSaved===(c.state==='CONFIRMED')))return false;
  return new Set(p.cases.map(c=>c.alias)).size===p.cases.length&&
   p.cases.filter(c=>c.state==='HELD').length===p.counts.holds&&
   p.cases.filter(c=>c.state==='CONFIRMED').length===p.counts.confirmed&&
   p.slots.every(s=>s.occupied===p.cases.filter(c=>c.slotId===s.slotId&&['HELD','CONFIRMED'].includes(c.state)).length);
 };
 const query=el('e1WsQuery'),statusFilter=el('e1WsStatus'),slotFilter=el('e1WsSlotFilter'),dateFilter=el('e1WsDate'),caseRows=el('e1WsRows'),slotRows=el('e1WsSlots');
 const workspace=Boolean(query&&statusFilter&&slotFilter&&dateFilter&&caseRows&&slotRows);
 const local=s=>new Date(s).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
 const localDate=s=>new Date(s).toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'});
 const rows=(target,data,openCase)=>{
  target.textContent='';
  for(const values of data){
   const tr=document.createElement('tr');
   for(const value of values){const td=document.createElement('td');td.textContent=String(value);tr.appendChild(td);}
   if(openCase){const td=document.createElement('td'),btn=document.createElement('button');btn.type='button';btn.textContent='查看個案';btn.addEventListener('click',()=>openCase(values[0]));td.appendChild(btn);tr.appendChild(td);}
   target.appendChild(tr);
  }
 };
 const profileBox=el('e1Profile'),profileStatus=el('e1ProfileStatus'),profileSummary=el('e1ProfileSummary'),profileTab=el('e1ProfileTab'),profileContent=el('e1ProfileContent'),profileOrder=el('e1ProfileOrder'),profileTimeline=el('e1ProfileTimeline'),profileBack=el('e1ProfileBack');
 const hasProfile=[profileBox,profileStatus,profileSummary,profileTab,profileContent,profileOrder,profileTimeline,profileBack].every(Boolean);
 let profile=null,profileEpoch=0;
 const closeProfile=()=>{
  profileEpoch++;profile=null;
  if(!hasProfile)return;
  profileBox.hidden=true;profileStatus.textContent='';profileSummary.textContent='';profileContent.textContent='';profileTimeline.textContent='';
  profileTab.disabled=true;profileOrder.disabled=true;
 };
 const noticeLabels={NOT_QUEUED:'尚無通知紀錄',PROVIDER_ACCEPTED_NOT_DELIVERED:'服務商接受（非送達證明）',UNKNOWN_REQUIRES_STAFF_REVIEW:'結果未知，禁止重送'};
 const field=(parent,k,v)=>{const p=document.createElement('p');p.textContent=k+'：'+(v??'—');parent.appendChild(p);};
 const review=p=>p.noticeStatus==='UNKNOWN_REQUIRES_STAFF_REVIEW'?'核對 TEST 信箱及 outbox，禁止重送':p.otpStatus==='EMAIL_EXPIRED'?'Email OTP 已逾期，不推定寄達':p.bookingStatus==='EXPIRED'?'暫留逾期，未成立預約':p.bookingStatus==='CONFIRMED'&&p.noticeStatus==='NOT_QUEUED'?'預約已確認，尚無通知；由 B08 獨立操作': '無另行推定的異常；僅供查核';
 const time=v=>v?local(v):'—';
 const drawProfile=()=>{
  if(!profile||!hasProfile)return;
  const p=profile;profileContent.textContent='';
  const f=(k,v)=>field(profileContent,k,v);
  switch(profileTab.value){
   case 'eligibility':f('資格','僅合成 TEST 自陳符合，不代表 REC 正式資格核實');break;
   case 'booking':f('預約狀態',labels[p.bookingStatus]);f('場次',p.slot?.id);f('開始',time(p.slot?.startAtUtc));f('結束',time(p.slot?.endAtUtc));f('暫留期限',time(p.slot?.holdUntilUtc));f('出席','未核實');break;
   case 'consent':f('完整 PDF',p.pdfStatus==='STORED_SHA_VERIFIED'?'已保存，儲存位元組 SHA 一致（非本次逐頁重解析）':'無已簽副本');f('來源 SHA',p.sourceSha);f('簽署副本 SHA',p.signedSha);f('簽署時間',time(p.signedAtUtc));break;
   case 'notices':f('通知',noticeLabels[p.noticeStatus]);f('建立時間',time(p.queuedAtUtc));f('接受時間',time(p.acceptedAtUtc));f('人工查核',review(p));break;
   default:f('虛構代碼',p.alias);f('OTP',otpLabels[p.otpStatus]);f('Email OTP 期限',time(p.otpExpiresAtUtc));f('限制','不呈現姓名、聯絡資料、驗證碼或憑證；不代表本人身分證明');break;
  }
 };
 const drawTimeline=()=>{
  if(!profile||!hasProfile)return;profileTimeline.textContent='';
  const p=profile,events=[[p.signedAtUtc,'TEST PDF 簽署','consent'],[p.queuedAtUtc,'TEST 通知建立','notices'],[p.acceptedAtUtc,'寄件服務接受（非送達）','notices']].filter(e=>e[0]);
  events.sort((a,b)=>profileOrder.value==='old'?a[0].localeCompare(b[0]):b[0].localeCompare(a[0]));
  for(const [at,label,tab] of events){const li=document.createElement('li'),btn=document.createElement('button');btn.type='button';btn.textContent=time(at)+'｜'+label;btn.addEventListener('click',()=>{if(profile!==p)return;profileTab.value=tab;drawProfile();});li.appendChild(btn);profileTimeline.appendChild(li);}
 };
 const openProfile=async alias=>{
  if(!hasProfile||busy||!visibleSnapshot)return;
  const baseline=visibleSnapshot,row=baseline.cases.find(c=>c.alias===alias);
  if(!row)return;
  closeProfile();const epoch=profileEpoch;profileBox.hidden=false;profileStatus.textContent='核對同一 TEST 案件…';
  const validTime=x=>x===null||iso(x);
  try{
   const p=await new Promise((resolve,reject)=>google.script.run.withFailureHandler(reject).withSuccessHandler(r=>r?.ok===true?resolve(r.value):reject(Error('UAT_PROFILE'))).study1E1SyntheticUat({operation:'caseProfile',alias,expectedSha:baseline.snapshotSha}));
   if(epoch!==profileEpoch||visibleSnapshot!==baseline)return;
   if(!exact(p,['formal','scope','readOnly','snapshotSha','alias','eligibility','otpStatus','otpExpiresAtUtc','bookingStatus','slot','pdfStatus','sourceSha','signedSha','signedAtUtc','noticeStatus','queuedAtUtc','acceptedAtUtc'])||p.formal!==false||p.scope!=='SYNTHETIC_CASES_ONLY'||p.readOnly!==true||p.snapshotSha!==baseline.snapshotSha||p.alias!==row.alias||p.eligibility!=='TEST_ELIGIBLE_ASSERTED'||p.otpStatus!==row.otpStatus||p.bookingStatus!==row.state||
    !validTime(p.otpExpiresAtUtc)||(p.otpStatus.startsWith('EMAIL_')!==(p.otpExpiresAtUtc!==null))||
    (row.slotId===null?p.slot!==null:!exact(p.slot,['id','startAtUtc','endAtUtc','holdUntilUtc'])||p.slot.id!==row.slotId||!iso(p.slot.holdUntilUtc)||!baseline.slots.some(s=>s.slotId===p.slot.id&&s.startAtUtc===p.slot.startAtUtc&&s.endAtUtc===p.slot.endAtUtc))||
    (p.slot===null?p.sourceSha!==null:!hex(p.sourceSha))||
    (row.pdfSaved?p.pdfStatus!=='STORED_SHA_VERIFIED'||!hex(p.signedSha)||p.signedSha===p.sourceSha||!iso(p.signedAtUtc):p.pdfStatus!=='NO_SIGNED_COPY'||p.signedSha!==null||p.signedAtUtc!==null)||
    !Object.hasOwn(noticeLabels,p.noticeStatus)||(p.noticeStatus==='NOT_QUEUED'?p.queuedAtUtc!==null||p.acceptedAtUtc!==null:!row.pdfSaved||!iso(p.queuedAtUtc)||p.queuedAtUtc<p.signedAtUtc||(p.noticeStatus==='PROVIDER_ACCEPTED_NOT_DELIVERED'?!iso(p.acceptedAtUtc)||p.acceptedAtUtc<p.queuedAtUtc:p.acceptedAtUtc!==null)))throw Error('UAT_PROFILE');
   profile=p;for(const [k,v] of [['個案',p.alias],['資格','合成 TEST 自陳'],['OTP',otpLabels[p.otpStatus]],['預約',labels[p.bookingStatus]],['PDF',row.pdfSaved?'儲存 SHA 已核對':'無已簽副本'],['通知',noticeLabels[p.noticeStatus]],['異常查核',review(p)]])field(profileSummary,k,v);
   profileStatus.textContent='同一 TEST 快照已核對；唯讀，不代表即時狀態或完整歷史。';profileTab.value='basic';profileTab.disabled=false;profileOrder.value='new';profileOrder.disabled=false;drawProfile();drawTimeline();
  }catch(_){if(epoch===profileEpoch){closeProfile();profileBox.hidden=false;profileStatus.textContent='個案來源、權限或名單已變更；請重新載入名單核對。';}}
 };
 if(hasProfile){profileBack.addEventListener('click',closeProfile);profileTab.addEventListener('change',drawProfile);profileOrder.addEventListener('change',drawTimeline);
  for(const id of ['siteNoticeSend','e1PdfSelect']){const n=el(id);if(n)n.addEventListener('click',closeProfile);}
  window.addEventListener('pagehide',closeProfile);
 }
 const renderWorkspace=()=>{
  closeProfile();if(!workspace)return;
  if(!visibleSnapshot){rows(caseRows,[]);rows(slotRows,[]);return;}
  const p=visibleSnapshot,search=String(query.value||'').trim().toUpperCase();
  const filtered=p.cases.filter(c=>(!search||c.alias.includes(search))&&
   (statusFilter.value==='ALL'||c.state===statusFilter.value)&&(!slotFilter.value||c.slotId===slotFilter.value));
  rows(caseRows,filtered.map(c=>[c.alias,otpLabels[c.otpStatus],c.slotId||'未選時段',labels[c.state],c.pdfSaved?'已保存':'無']),hasProfile?openProfile:null);
  const shown=p.slots.filter(s=>!dateFilter.value||localDate(s.startAtUtc)===dateFilter.value);
  rows(slotRows,shown.map(s=>[local(s.startAtUtc)+' – '+local(s.endAtUtc),s.slotId,s.bookable?'可預約':'不可預約',
   s.capacity,p.cases.filter(c=>c.slotId===s.slotId&&c.state==='HELD').length,
   p.cases.filter(c=>c.slotId===s.slotId&&c.state==='CONFIRMED').length,s.remaining]));
  casesOut.textContent='顯示 '+filtered.length+' / '+p.cases.length+' 筆 TEST 案件；清除預覽仍為全部案件。';
  slotsOut.textContent='顯示 '+shown.length+' / '+p.slots.length+' 個 TEST 場次；容量依完整名單計算。';
 };
 if(workspace){
  query.addEventListener('input',renderWorkspace);
  for(const element of [statusFilter,slotFilter,dateFilter])element.addEventListener('change',renderWorkspace);
 }
 const showLists=p=>{
  visibleSnapshot=p;
  if(workspace){
   const old=slotFilter.value;slotFilter.textContent='';
   for(const id of ['',...p.slots.map(s=>s.slotId)]){const opt=document.createElement('option');opt.value=id;opt.textContent=id||'全部';slotFilter.appendChild(opt);}
   slotFilter.value=p.slots.some(s=>s.slotId===old)?old:'';
   renderWorkspace();return;
  }
  casesOut.textContent=p.cases.length?p.cases.map(c=>c.alias+'｜'+labels[c.state]+'｜'+(c.slotId||'未選時段')+'｜'+(c.pdfSaved?'已保存測試 PDF':'無簽署 PDF')+'｜'+otpLabels[c.otpStatus]).join('\n'):'目前無測試案件';
  slotsOut.textContent=p.slots.map(s=>s.slotId+'｜'+local(s.startAtUtc)+' – '+local(s.endAtUtc)+'｜已占 '+s.occupied+'/'+s.capacity+'｜剩餘 '+s.remaining+'｜'+(s.bookable?'可預約':'不可預約')).join('\n');
 };
 const emptyLists=()=>{visibleSnapshot=null;renderWorkspace();casesOut.textContent='尚未核實測試案件';slotsOut.textContent='尚未核實測試場次';};
 const describe=c=>'測試案件 '+c.cases+' 筆；有效暫留 '+c.holds+' 筆；已確認預約 '+c.confirmed+' 筆；測試 PDF '+c.pdfs+' 份。清除不寄信、不寫正式研究資料。';
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
function sameSiteTurnstileController(){
 const load=document.getElementById('siteTurnstileLoad');
 const verify=document.getElementById('siteTurnstileVerify');
 const status=document.getElementById('siteTurnstileStatus');
 if(!load||!verify||!status)return;
 const say=value=>{status.textContent=value;};
 const rpc=request=>new Promise((resolve,reject)=>google.script.run
  .withFailureHandler(()=>reject(Error('UAT_TURNSTILE_RPC_FAILED')))
  .withSuccessHandler(result=>result?.ok===true?resolve(result.value):reject(Error(result?.error||'UAT_TURNSTILE_RPC_FAILED')))
  .study1E1SyntheticUat(request));
 let token='',widget=null;
 const intakeToken=document.getElementById('siteTurnstileToken');
 load.addEventListener('click',async()=>{
  load.disabled=true;verify.disabled=true;token='';if(intakeToken)intakeToken.value='';
  try{
   const config=await rpc({operation:'turnstileConfig'});
   if(!window.turnstile)await new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('UAT_TURNSTILE_WIDGET_LOAD_FAILED'));};
    document.head.appendChild(script);
   });
   if(widget!==null)window.turnstile.remove(widget);
   widget=window.turnstile.render('#siteTurnstileWidget',{
    sitekey:config.siteKey,action:config.action,'refresh-expired':'manual',
    callback:value=>{token=value;verify.disabled=false;if(intakeToken)intakeToken.value=value;
     say(intakeToken?'Turnstile token 已取得；送出報名時由伺服器驗證。':'Token 已取得。可立即驗證，或等待五分鐘後測試過期。');},
    'expired-callback':()=>{if(intakeToken)intakeToken.value='';say('Token 已過期；請重新載入挑戰。');},
    'error-callback':code=>say('Turnstile widget: '+code)
   });
  }catch(error){say(error.message);}
  finally{load.disabled=false;}
 });
 verify.addEventListener('click',async()=>{
  if(!token)return;
  verify.disabled=true;load.disabled=true;
  try{
   const result=await rpc({operation:'turnstileVerify',token});
   say(result?.verified===true?'Siteverify 已通過。可用同一 token 測試重用。':'UAT_TURNSTILE_RESPONSE_INVALID');
  }catch(error){say(error.message);}
  finally{verify.disabled=false;load.disabled=false;}
 });
}
// Adapt the existing B10 read/choose/attest controls to the TEST registry.
// No formal upload, Drive or production publication RPC.
function sameSiteDocumentController(){
 const el=id=>document.getElementById(id),read=el('e1PdfRead'),choice=el('e1PdfChoose'),preview=el('e1PdfReview'),ack=el('e1PdfChooseAttest'),select=el('e1PdfSelect'),msg=el('e1PdfStatus'),link=el('siteTestPdfLink');
 if([read,choice,preview,ack,select,msg,link].some(x=>!x))return;
 let catalog=null,verified=null,busy=false,objectUrl=null;
 const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
 const version=x=>['UAT-SYNTHETIC-1','UAT-SYNTHETIC-2'].includes(x);
 const entry=d=>d&&version(d.version)&&sha(d.sha)&&d.pageCount===5;
 const say=x=>{msg.textContent=x;};
 const selected=()=>catalog?.documents.find(d=>d.version===choice.value);
 const clearPreview=()=>{verified=null;ack.checked=false;link.hidden=true;link.removeAttribute('href');if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;};
 const controls=()=>{read.disabled=busy;choice.disabled=busy||!catalog;preview.disabled=busy||!selected();
  select.disabled=busy||!catalog||catalog.cases!==0||!verified||!ack.checked||verified.sha===catalog.activeSha||verified.version!==choice.value;};
 const rpc=request=>new Promise((resolve,reject)=>google.script.run.withFailureHandler(()=>reject(Error('UAT_DOCUMENT_SELECTION_UNKNOWN')))
  .withSuccessHandler(r=>r?.ok===true?resolve(r.value):reject(Error(r?.error||'UAT_REQUEST_REJECTED'))).study1E1SyntheticUat(request));
 const load=async()=>{
  const r=await rpc({operation:'documentCatalog'});
  if(!r||r.formal!==false||!sha(r.activeSha)||!sha(r.snapshotSha)||!Number.isInteger(r.cases)||r.cases<0||r.cases>12||
   !Array.isArray(r.documents)||r.documents.length!==2||!r.documents.every(entry)||new Set(r.documents.map(d=>d.version)).size!==2||
   new Set(r.documents.map(d=>d.sha)).size!==2||!r.documents.some(d=>d.sha===r.activeSha))throw Error('UAT_DOCUMENT_CATALOG');
  catalog=r;choice.textContent='';
  for(const d of r.documents){const o=document.createElement('option');o.value=d.version;o.textContent=d.version+'｜SHA '+d.sha+'｜5 頁';choice.appendChild(o);}
  choice.value=r.documents.find(d=>d.sha===r.activeSha).version;
  say('目前 TEST 簽署來源：'+choice.value+'；案件 '+r.cases+' 筆。'+(r.cases?'尚有案件，禁止切換。':'可預覽並核對後選用。'));
 };
 read.addEventListener('click',async()=>{if(busy)return;busy=true;catalog=null;clearPreview();controls();
  try{await load();}catch(_){catalog=null;say('無法核實 TEST 文件目錄。');}finally{busy=false;controls();}});
 choice.addEventListener('change',()=>{clearPreview();controls();});
 ack.addEventListener('change',controls);
 preview.addEventListener('click',async()=>{
  if(busy||!selected())return;const d=selected();busy=true;clearPreview();controls();
  try{
   const r=await rpc({operation:'documentPreview',version:d.version});
   if(!r||r.formal!==false||!entry(r)||r.version!==d.version||r.sha!==d.sha||typeof r.bytes!=='string'||r.bytes.length>320000)throw Error('UAT_DOCUMENT_SOURCE');
   const bytes=Uint8Array.from(atob(r.bytes),x=>x.charCodeAt(0));
   const digest=Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
   if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-'||digest!==d.sha)throw Error('UAT_DOCUMENT_SOURCE');
   objectUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));link.href=objectUrl;link.hidden=false;verified=d;
   say('完整五頁 TEST PDF SHA 已核實；請開啟 PDF 逐頁核對，非正式研究同意。');
  }catch(_){clearPreview();say('文件預覽未核實，不可選用。');}finally{busy=false;controls();}
 });
 select.addEventListener('click',async()=>{
  if(select.disabled||busy||!catalog||!verified)return;
  const d=verified,old=catalog;busy=true;catalog=null;clearPreview();controls();
  try{
   const r=await rpc({operation:'documentSelect',version:d.version,targetSha:d.sha,activeSha:old.activeSha,expectedSha:old.snapshotSha,confirmation:'SELECT_TEST_DOCUMENT_ONLY'});
   if(!r||r.formal!==false||r.scope!=='SYNTHETIC_CASES_ONLY'||r.activeSha!==d.sha||r.version!==d.version||r.remainingCases!==0)throw Error('UAT_DOCUMENT_SELECTION_UNKNOWN');
   await load();
   if(catalog.activeSha!==d.sha)throw Error('UAT_DOCUMENT_SELECTION_UNKNOWN');
   say('TEST 簽署來源已回讀：'+d.version+'｜'+d.sha+'。未修改正式文件或開放真人收件。');
  }catch(_){catalog=null;say('選用未獲完整確認；先重新載入目錄核對，不重送。');}finally{busy=false;controls();}
 });
 window.addEventListener('pagehide',clearPreview);controls();
}
function sameSiteNoticeController(){
 const el=id=>document.getElementById(id),read=el('e1OpsRead'),status=el('e1OpsStatus'),out=el('e1OpsResults'),pick=el('siteNoticeAlias'),ack=el('siteNoticeAck'),send=el('siteNoticeSend');
 if([read,status,out,pick,ack,send].some(x=>!x))return;
 let snapshot=null,busy=false;
 const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
 const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
 const labels={NOT_QUEUED:'無通知紀錄（不得推定已通知）',PROVIDER_ACCEPTED_NOT_DELIVERED:'郵件服務已接受（非實際送達證明）',UNKNOWN_REQUIRES_STAFF_REVIEW:'結果未知，禁止重送'};
 const eligible=c=>c.bookingStatus==='CONFIRMED'&&c.noticeStatus==='NOT_QUEUED';
 const control=()=>{read.disabled=busy;pick.disabled=busy||!snapshot;ack.disabled=busy||!snapshot;
  send.disabled=busy||!snapshot||!ack.checked||!snapshot.cases.some(c=>c.alias===pick.value&&eligible(c));};
 const clear=()=>{snapshot=null;out.textContent='';pick.textContent='';ack.checked=false;control();};
 const rpc=request=>new Promise((resolve,reject)=>google.script.run.withFailureHandler(()=>reject(Error('UNKNOWN'))).withSuccessHandler(r=>r?.ok===true?resolve(r.value):reject(Error(r?.error||'UNKNOWN'))).study1E1SyntheticUat(request));
 const load=async()=>{
  const p=await rpc({operation:'noticeAudit'});
  if(!p||p.formal!==false||p.scope!=='SYNTHETIC_CASES_ONLY'||p.readOnly!==true||!sha(p.snapshotSha)||!Array.isArray(p.cases)||p.cases.length>12||
   new Set(p.cases.map(c=>c.alias)).size!==p.cases.length||!p.cases.every(c=>c&&Object.keys(c).sort().join(',')==='acceptedAtUtc,alias,bookingStatus,noticeStatus,queuedAtUtc'&&/^TEST_(0[1-9]|1[0-2])$/.test(c.alias)&&['OTP','SLOTS','HELD','EXPIRED','CONFIRMED','CANCELLED'].includes(c.bookingStatus)&&Object.hasOwn(labels,c.noticeStatus)&&
    (c.noticeStatus==='NOT_QUEUED'?c.queuedAtUtc===null&&c.acceptedAtUtc===null:c.bookingStatus==='CONFIRMED'&&iso(c.queuedAtUtc)&&(c.noticeStatus==='PROVIDER_ACCEPTED_NOT_DELIVERED'?iso(c.acceptedAtUtc)&&Date.parse(c.acceptedAtUtc)>=Date.parse(c.queuedAtUtc):c.acceptedAtUtc===null))))throw Error('UAT_NOTICE_SOURCE');
  const table=document.createElement('table'),body=document.createElement('tbody'),head=document.createElement('tr');
  for(const name of ['TEST 代碼','預約','通知 outbox','建立時間 UTC','服務接受時間 UTC','人工查核']){const th=document.createElement('th');th.textContent=name;head.appendChild(th);}table.appendChild(head);
  for(const c of p.cases){const tr=document.createElement('tr');
   for(const v of [c.alias,c.bookingStatus,labels[c.noticeStatus],c.queuedAtUtc||'—',c.acceptedAtUtc||'—',c.noticeStatus==='UNKNOWN_REQUIRES_STAFF_REVIEW'?'核對測試信箱及原 TEST 紀錄；不補寄':eligible(c)?'可獨立發出一次 TEST 確認通知':'無可執行寄送']){const td=document.createElement('td');td.textContent=v;tr.appendChild(td);}body.appendChild(tr);
   if(eligible(c)){const o=document.createElement('option');o.value=c.alias;o.textContent=c.alias;pick.appendChild(o);}
  }
  table.appendChild(body);out.appendChild(table);snapshot=p;status.textContent='已核對 '+p.cases.length+' 筆隔離案件；郵件服務接受不代表送達。';
 };
 read.addEventListener('click',async()=>{if(busy)return;busy=true;clear();try{await load();}catch(_){clear();status.textContent='通知來源未核實。';}finally{busy=false;control();}});
 pick.addEventListener('change',()=>{ack.checked=false;control();});ack.addEventListener('change',control);
 send.addEventListener('click',async()=>{if(send.disabled||busy)return;const alias=pick.value,expectedSha=snapshot.snapshotSha;busy=true;clear();
  try{const r=await rpc({operation:'noticeSend',alias,expectedSha,confirmation:'SEND_TEST_NOTICE_ONLY'});
   if(!r||r.formal!==false||r.scope!=='SYNTHETIC_CASES_ONLY'||r.alias!==alias||!['PROVIDER_ACCEPTED_NOT_DELIVERED','UNKNOWN_REQUIRES_STAFF_REVIEW'].includes(r.noticeStatus))throw Error('UNKNOWN');
   await load();if(snapshot.cases.find(c=>c.alias===alias)?.noticeStatus!==r.noticeStatus)throw Error('UNKNOWN');
   status.textContent=labels[r.noticeStatus]+'；不重送。';
  }catch(_){clear();status.textContent='通知未獲完整確認，先重新唯讀查核，不重送。';}finally{busy=false;control();}});
 control();
}
// Scope only the two existing read/preview RPCs in this candidate. Preserve
// their original booking/workspace implementation and all other deny guards.
function sameSiteFormalBooking(source,restore=false){
 const deny="if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();";
 const gate='study1SiteFormalWorkspaceReadGate_();';
 for(const name of ['study1OwnerE1Workspace','study1OwnerE1SlotChangePreview','study1OwnerE1Profile','study1OwnerE1ProfilePdf']){
  const head='function '+name+'(input){';
  source=once(source,head+(restore?gate:deny),head+(restore?deny:gate));
 }
 const auditHead='function study1OwnerE1OperationsAudit(){';
 const auditGate=gate+"if(arguments.length!==0)throw Error('E1_OPERATIONS_INPUT_INVALID');";
 source=once(source,auditHead+(restore?auditGate:deny),auditHead+(restore?deny:auditGate));
 const auditReturn="  return {readOnly:true,source:'ORIGINAL_E1_OPERATIONS',";
 source=once(source,restore?'  '+gate+'\n  if(lock.hasLock()!==true)throw Error(\'OWNER_E1_OPERATIONS_LOCK_LOST\');\n'+auditReturn:auditReturn,
  restore?auditReturn:'  '+gate+'\n  if(lock.hasLock()!==true)throw Error(\'OWNER_E1_OPERATIONS_LOCK_LOST\');\n'+auditReturn);
 const workspaceReturn="  return {mode:'OWNER_E1_WORKSPACE',experiment:'E1',revision:x.revision,asOfUtc:x.now,";
 const previewReturn="  return {...project,canCommit:commitBlocker===null,commitBlocker,\n   approvalRef:approval?approval.approvalRef:null,approvalReason:approval?approval.reason:null};";
 const readOnlyReturn="  return {...project,canCommit:false,commitBlocker:'FORMAL_WORKSPACE_READ_ONLY',approvalRef:null,approvalReason:null};";
 for(const [before,after] of [[workspaceReturn,'  '+gate+'\n'+workspaceReturn],[previewReturn,'  '+gate+'\n'+readOnlyReturn]])source=once(source,restore?after:before,restore?before:after);
 for(const before of ['  return study1OwnerE1ProfileSource_(x,input.applicantId,lock).view;', '  return {...result.pdf,applicantId:input.applicantId,revision:x.revision};']){
  const after=before.includes('.view;')?'  const profile=study1OwnerE1ProfileSource_(x,input.applicantId,lock).view;\n  '+gate+'\n  return profile;':'  '+gate+'\n'+before;
  source=once(source,restore?after:before,restore?before:after);
 }
 return source;
}
// Preserve the original private catalog and byte verifier; return only E1
// metadata, never Drive locator, and require a pinned revision for preview.
function sameSiteFormalDocuments(source,restore=false){
 const original="function study1ConsentVersionList(){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();\n study1AdminOwnerRequired_();study1SandboxBookingFlags_();\n return study1ConsentVersionRead_();\n}";
 const adapted=`function study1ConsentVersionList(input){
 study1SiteFormalWorkspaceReadGate_();study1SandboxBookingFlags_();
 const preview=input!==undefined;
 if(preview&&(!input||Array.isArray(input)||Object.keys(input).sort().join(',')!=='revision,sha256,version'||!Number.isSafeInteger(input.revision)||input.revision<1||typeof input.version!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,32}$/.test(input.version)||typeof input.sha256!=='string'||!/^[a-f0-9]{64}$/.test(input.sha256)))throw Error('E1_DOCUMENT_PREVIEW_INPUT');
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(10000)!==true)throw Error('E1_DOCUMENT_READ_BUSY');
 try{
  const index=study1ConsentVersionRead_(),raw=JSON.stringify(index);
  const project=d=>({version:d.version,title:d.title,sha256:d.sha256,bytes:d.bytes,researcherPresigned:d.researcherPresigned===true,selected:index.current.E1===d.id,protectedSource:index.published.E1===d.id});
  let result={mode:'OWNER_E1_PDF_CATALOG',experiment:'E1',readOnly:true,revision:index.revision,documents:index.documents.filter(d=>d.experiment==='E1').map(project)};
  if(preview){
   const entry=index.documents.find(d=>d.experiment==='E1'&&d.version===input.version&&d.sha256===input.sha256&&d.researcherPresigned===true);
   if(!entry||index.revision!==input.revision)throw Error('E1_DOCUMENT_PREVIEW_STALE_OR_INVALID');
   const bytes=study1ConsentDocumentBytes_(entry);
   result={mode:'OWNER_E1_PDF_PREVIEW',experiment:'E1',readOnly:true,revision:index.revision,document:project(entry),mime:'application/pdf',base64:Utilities.base64Encode(bytes)};
  }
  if(lock.hasLock()!==true||JSON.stringify(study1ConsentVersionRead_())!==raw)throw Error('E1_DOCUMENT_SOURCE_CHANGED');
  study1SiteFormalWorkspaceReadGate_();study1SandboxBookingFlags_();
  if(lock.hasLock()!==true)throw Error('E1_DOCUMENT_READ_BUSY');
  return result;
 }finally{lock.releaseLock();}
}`;
 return once(source,restore?adapted:original,restore?original:adapted);
}
function sameSiteFormalWorkspaceController(){
 const el=id=>document.getElementById('e1FormalWs'+id),load=el('Load');
 if(!load)return;
 const status=el('StatusText'),cases=el('Rows'),slots=el('Slots'),preview=el('Preview');
 let data=null,offset=0,epoch=0,busy=false,selected=null,creating=false;
 const exact=(o,k)=>o&&Object.keys(o).sort().join(',')===k.slice().sort().join(',');
 const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
 const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
 const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,64}$/.test(x);
 const text=(node,value)=>{node.textContent=String(value??'—');};
 const local=x=>new Date(x).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
 const localDate=x=>new Date(x).toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'});
 const localInput=x=>new Date(Date.parse(x)+8*3600000).toISOString().slice(0,16);
 const value=k=>el(k).value;
 const draftMsg=x=>text(el('DraftResult'),x);
 /* FORMAL_PROFILE_CONTROLLER */
 const clearDraft=()=>{selected=null;creating=false;for(const k of ['DraftId','DraftStart','DraftEnd','DraftLocation','DraftCap']){el(k).value='';el(k).disabled=true;}draftMsg('');};
 const controls=()=>{load.disabled=busy;el('Prev').disabled=busy||!data||offset===0;el('Next').disabled=busy||!data||offset+50>=data.total;el('New').disabled=busy||!data;preview.disabled=busy||!data||(!selected&&!creating);el('Close').disabled=busy||!selected||selected.status!=='OPEN';el('Open').disabled=busy||!selected||selected.status!=='CLOSED';};
 const clear=()=>{closeProfile();data=null;cases.textContent='';slots.textContent='';clearDraft();controls();};
 const cells=(body,values)=>{const tr=document.createElement('tr');for(const v of values){const td=document.createElement('td');text(td,v);tr.appendChild(td);}body.appendChild(tr);return tr;};
 const fillDraft=s=>{selected=s;creating=!s;for(const k of ['DraftId','DraftStart','DraftEnd','DraftLocation','DraftCap'])el(k).disabled=false;
  el('DraftId').disabled=!!s;el('DraftId').value=s?.slotId||'';el('DraftStart').value=s?localInput(s.startAtUtc):'';el('DraftEnd').value=s?localInput(s.endAtUtc):'';el('DraftLocation').value=s?.locationCode||'';el('DraftCap').value=s?String(s.capacity):'';draftMsg('草稿不會儲存正式資料。');controls();};
 const renderSlots=()=>{slots.textContent='';if(!data)return;
  for(const s of data.slots.filter(x=>!value('Date')||localDate(x.startAtUtc)===value('Date'))){
   const tr=cells(slots,[local(s.startAtUtc)+' – '+local(s.endAtUtc),s.slotId+' / '+s.locationCode,s.status,s.capacity,s.held,s.confirmed,s.waitlisted,s.remaining]);
   const td=document.createElement('td'),btn=document.createElement('button');btn.type='button';text(btn,'預檢草稿');btn.addEventListener('click',()=>{if(!busy&&data&&data.slots.includes(s))fillDraft(s);});td.appendChild(btn);tr.appendChild(td);
  }
 };
 const nonneg=x=>Number.isSafeInteger(x)&&x>=0;
 const validSlot=s=>exact(s,['slotId','startAtUtc','endAtUtc','capacity','locationCode','status','held','confirmed','waitlisted','remaining','historicalCount'])&&id(s.slotId)&&iso(s.startAtUtc)&&iso(s.endAtUtc)&&s.startAtUtc<s.endAtUtc&&typeof s.locationCode==='string'&&['OPEN','CLOSED'].includes(s.status)&&Number.isSafeInteger(s.capacity)&&s.capacity>0&&[s.held,s.confirmed,s.waitlisted,s.remaining,s.historicalCount].every(nonneg)&&s.remaining===s.capacity-s.held-s.confirmed&&s.historicalCount>=s.held+s.confirmed+s.waitlisted;
 const validPerson=(p,r)=>exact(p,['applicantId','name','applicationStatus','eligibility','screenedAtUtc','bookingStatus','slotId','consentState','consentBookingStatus','noticeStatus'])&&id(p.applicantId)&&typeof p.name==='string'&&['PENDING_EMAIL','EMAIL_VERIFIED'].includes(p.applicationStatus)&&['ELIGIBLE','INELIGIBLE'].includes(p.eligibility)&&iso(p.screenedAtUtc)&&typeof p.bookingStatus==='string'&&[p.consentState,p.consentBookingStatus,p.noticeStatus].every(s=>typeof s==='string')&&(p.slotId===null||r.slots.some(s=>s.slotId===p.slotId));
 const render=r=>{
  if(!exact(r,['mode','experiment','revision','asOfUtc','total','excluded','offset','pageSize','participants','slots','actionAuthority'])||r.mode!=='OWNER_E1_WORKSPACE'||r.experiment!=='E1'||r.actionAuthority!=='READ_AND_PREVIEW_ONLY'||!hex(r.revision)||!iso(r.asOfUtc)||!nonneg(r.total)||!nonneg(r.excluded)||r.offset!==offset||r.pageSize!==50||!Array.isArray(r.slots)||!r.slots.every(validSlot)||new Set(r.slots.map(s=>s.slotId)).size!==r.slots.length||!Array.isArray(r.participants)||r.participants.length!==Math.min(50,Math.max(0,r.total-offset))||!r.participants.every(p=>validPerson(p,r))||new Set(r.participants.map(p=>p.applicantId)).size!==r.participants.length)throw Error('FORMAL_WORKSPACE_SOURCE');
  const old=value('SlotFilter');el('SlotFilter').textContent='';
  for(const s of ['',...r.slots.map(x=>x.slotId)]){const o=document.createElement('option');o.value=s;text(o,s||'全部');el('SlotFilter').appendChild(o);}
  el('SlotFilter').value=r.slots.some(s=>s.slotId===old)?old:'';
  for(const p of r.participants){
   const tr=cells(cases,[p.applicantId,p.name,p.applicationStatus,p.eligibility,p.slotId,p.bookingStatus,p.consentState,p.consentBookingStatus,p.noticeStatus]);
   const td=document.createElement('td'),btn=document.createElement('button');btn.type='button';text(btn,'查看個案');btn.addEventListener('click',()=>openProfile(p));td.appendChild(btn);tr.appendChild(td);
  }
  data=r;renderSlots();text(status,'正式來源唯讀快照：'+local(r.asOfUtc)+'；符合 '+r.total+' 筆，未辨識 '+r.excluded+' 筆。未啟用真人收件。');
 };
 const refresh=async()=>{
  if(busy)return;busy=true;const e=++epoch;clear();text(status,'核對原正式來源…');
  try{const q={query:value('Query'),status:value('Status'),eligibility:value('Eligibility'),slotId:value('SlotFilter'),offset};
   const r=await new Promise((resolve,reject)=>google.script.run.withFailureHandler(reject).withSuccessHandler(resolve).study1OwnerE1Workspace(q));
   if(e===epoch)render(r);
  }catch(_){if(e===epoch){clear();text(status,'正式來源或權限未核實，請重新查詢。未改寫資料。');}}
  finally{busy=false;controls();}
 };
 const check=async action=>{
  if(busy||!data||(!selected&&!creating))return;
  const utc=(v,old)=>old&&v===localInput(old)?old:new Date(v+':00+08:00').toISOString();
  let q;try{q={action,revision:data.revision,slotId:value('DraftId').trim(),startAtUtc:utc(value('DraftStart'),selected?.startAtUtc),endAtUtc:utc(value('DraftEnd'),selected?.endAtUtc),capacity:Number(value('DraftCap')),locationCode:value('DraftLocation').trim()};}catch(_){draftMsg('日期不合法');return;}
  closeProfile();busy=true;const e=++epoch;controls();draftMsg('核對草稿…');
  try{const r=await new Promise((resolve,reject)=>google.script.run.withFailureHandler(reject).withSuccessHandler(resolve).study1OwnerE1SlotChangePreview(q));
   if(e!==epoch)return;
   if(!r||r.mode!=='E1_SLOT_CHANGE_PREVIEW'||r.revision!==q.revision||r.action!==q.action||r.written!==false||r.actionAuthority!=='NONE'||r.preservesReservations!==true||r.requiresPiApproval!==true||r.canCommit!==false||r.commitBlocker!=='FORMAL_WORKSPACE_READ_ONLY'||!hex(r.proposal)||!r.after||r.after.slotId!==q.slotId||r.after.capacity!==q.capacity||r.after.startAtUtc!==q.startAtUtc||r.after.endAtUtc!==q.endAtUtc||r.after.locationCode!==q.locationCode)throw Error('FORMAL_PREVIEW_SOURCE');
   draftMsg('預檢通過（未儲存）：'+r.after.slotId+'｜名額 '+r.after.capacity+'｜'+r.after.status+'；保留原預約，正式儲存未開放。');
  }catch(_){if(e===epoch){clear();text(status,'草稿或來源已變更／不允許，請重新查詢。');}}
  finally{busy=false;controls();}
 };
 load.addEventListener('click',()=>{offset=0;return refresh();});
 el('Prev').addEventListener('click',()=>{if(!busy&&data&&offset>=50){offset-=50;return refresh();}});
 el('Next').addEventListener('click',()=>{if(!busy&&data&&offset+50<data.total){offset+=50;return refresh();}});
 for(const k of ['Query','Status','Eligibility','SlotFilter'])el(k).addEventListener('change',()=>{epoch++;offset=0;clear();text(status,'篩選已變更，請重新查詢。');});
 el('Date').addEventListener('change',renderSlots);el('New').addEventListener('click',()=>{if(!busy&&data)fillDraft(null);});
 preview.addEventListener('click',()=>check(creating?'CREATE':'UPDATE'));el('Close').addEventListener('click',()=>check('CLOSE'));el('Open').addEventListener('click',()=>check('OPEN'));window.addEventListener('pagehide',()=>{epoch++;clear();});
 clear();
}
function sameSiteFormalDocumentsController(){
 const el=k=>document.getElementById('e1FormalPdf'+k),read=el('Read');
 if(!read)return;
 const status=el('Status'),choice=el('Choose'),preview=el('Preview'),link=el('Review'),detail=el('Detail');
 let index=null,busy=false,epoch=0,url=null;
 const say=s=>{status.textContent=s;};
 const exact=(o,ks)=>o&&Object.keys(o).sort().join(',')===ks.slice().sort().join(',');
 const entry=d=>exact(d,['version','title','sha256','bytes','researcherPresigned','selected','protectedSource'])&&typeof d.version==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,32}$/.test(d.version)&&typeof d.title==='string'&&d.title.length<=100&&/^[a-f0-9]{64}$/.test(d.sha256)&&Number.isSafeInteger(d.bytes)&&d.bytes>=100&&d.bytes<=3000000&&['researcherPresigned','selected','protectedSource'].every(k=>typeof d[k]==='boolean');
 const selected=()=>index?.documents.find(d=>d.version===choice.value);
 const clearPreview=()=>{epoch++;link.hidden=true;link.href='';if(url)URL.revokeObjectURL(url);url=null;};
 const controls=()=>{read.disabled=busy;choice.disabled=busy||!index;preview.disabled=busy||!selected()?.researcherPresigned;};
 const reset=()=>{clearPreview();index=null;choice.textContent='';detail.textContent='';controls();};
 const show=()=>{const d=selected();detail.textContent=d?d.title+'｜'+d.version+'｜SHA '+d.sha256+'｜'+d.bytes+' bytes｜'+(d.researcherPresigned?'已登錄研究者預簽（非簽名真偽核實）':'未登錄預簽')+'｜'+(d.selected?'目前選用':'未選用')+'｜'+(d.protectedSource?'受保護來源':'非受保護來源'):'';};
 const rpc=(input)=>new Promise((resolve,reject)=>{const runner=google.script.run.withFailureHandler(reject).withSuccessHandler(resolve);if(input===undefined)runner.study1ConsentVersionList();else runner.study1ConsentVersionList(input);});
 read.addEventListener('click',async()=>{if(busy)return;busy=true;reset();const e=epoch;
  try{const r=await rpc();if(e!==epoch)return;
   if(!exact(r,['mode','experiment','readOnly','revision','documents'])||r.mode!=='OWNER_E1_PDF_CATALOG'||r.experiment!=='E1'||r.readOnly!==true||!Number.isSafeInteger(r.revision)||r.revision<0||!Array.isArray(r.documents)||r.documents.length>24||!r.documents.every(entry)||new Set(r.documents.map(d=>d.version)).size!==r.documents.length||r.documents.filter(d=>d.selected).length>1||r.documents.filter(d=>d.protectedSource).length>1)throw Error('E1_DOCUMENT_CATALOG');
   index=r;for(const d of r.documents){const o=document.createElement('option');o.value=d.version;o.textContent=d.version+'｜'+d.title;choice.appendChild(o);}
   choice.value=r.documents.find(d=>d.selected)?.version||r.documents[0]?.version||'';show();say('正式 E1 私人索引 revision '+r.revision+'；尚未逐份驗證 PDF 內容。唯讀，不代表 REC 核准。');
  }catch(_){if(e===epoch){reset();say('私人目錄未核實，請重新載入。');}}finally{busy=false;controls();}
 });
 choice.addEventListener('change',()=>{clearPreview();show();controls();});
 preview.addEventListener('click',async()=>{const d=selected();if(busy||!index||!d?.researcherPresigned)return;busy=true;clearPreview();const e=epoch,revision=index.revision;controls();
  try{const r=await rpc({revision,version:d.version,sha256:d.sha256});if(e!==epoch)return;
   if(!exact(r,['mode','experiment','readOnly','revision','document','mime','base64'])||r.mode!=='OWNER_E1_PDF_PREVIEW'||r.experiment!=='E1'||r.readOnly!==true||r.revision!==revision||!entry(r.document)||JSON.stringify(r.document)!==JSON.stringify(d)||r.mime!=='application/pdf'||typeof r.base64!=='string'||r.base64.length>4000000)throw Error('E1_DOCUMENT_PREVIEW');
   const bytes=Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0)),digest=Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
   if(e!==epoch||selected()!==d)return;
   if(bytes.length!==d.bytes||String.fromCharCode(...bytes.slice(0,5))!=='%PDF-'||digest!==d.sha256)throw Error('E1_DOCUMENT_SHA');
   url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));link.href=url;link.hidden=false;say('原私人 PDF 位元組與 SHA 已核實；請逐頁人工複核。');
  }catch(_){if(e===epoch){reset();say('文件來源、授權或 SHA 未核實；請重新查詢，不提供預覽。');}}finally{busy=false;controls();}
 });
 window.addEventListener('pagehide',reset);reset();
}
function sameSiteAdmin(source=read('gas/AdminConsole.html')){
 // Preserve the original admin shell, style and controls in the repository.
 // The same-site test management view does not initialize formal/sandbox RPCs.
 const start=source.indexOf('<main>'),end=source.lastIndexOf('</main>');
 if(start<0||end<=start)throw Error('SAME_SITE_ADMIN_ANCHOR');
 let section='<main><section id="siteTestCleanup"><h2>測試資料管理</h2><p>只清除本網站專用測試案件、預約與內嵌簽署 PDF。不影響正式資料。</p><p><a href="<?= siteAppUrl + \'?view=apply&test=1\' ?>" target="_top">返回本網站測試報名</a></p><button id="siteTestPreview" type="button" class="secondary">重新載入名單、場次與清除預覽</button><h3>測試報名與預約名單</h3><div id="siteTestCases" class="booking-feedback" role="status">尚未核實測試案件</div><h3>測試場次與剩餘名額（臺灣時間）</h3><div id="siteTestSlots" class="booking-feedback" role="status">尚未核實測試場次</div><button id="siteTestClear" type="button" disabled>清空測試資料</button><button id="siteTestRecoverGate" type="button" disabled>遺失通行碼：重新產生（僅空表）</button><p id="siteTestCleanupSummary" role="status" aria-live="polite">先預覽，再確認清除。</p><input id="siteTestNewGate" type="text" readonly hidden autocomplete="off" spellcheck="false" aria-label="新測試通行碼；只供管理者複製，不存於網址"></section></main>';
 // Reuse the original B11 markup and controller rather than redesign it.
 const slice=(from,to)=>{
  const a=source.indexOf(from),b=source.indexOf(to,a+from.length);
  if(a<0||b<=a)throw Error('SAME_SITE_OWNER_WORKSPACE_ANCHOR');
  return source.slice(a,b);
 };
 const copy=slice('<section id="e1RecruitmentDraft">','<section id="e1Workspace">');
 const copyController=once(slice('function e1RecruitmentDraftSetup_(){','/* P0-B workspace:'),
  '}).study1OwnerE1RecruitmentDraft();',
  '}).study1E1SyntheticUat({operation:"recruitmentDraft"});');
 // Adapt ONLY the original controller's response envelope; the same existing
 // GitHub draft workflow verifies the exact Index digest before saving.
 const copyScript=once(copyController,'withSuccessHandler(r=>{','withSuccessHandler(response=>{const r=response?.ok===true?response.value:null;');
 const caseTable=slice('<div class="booking-table-wrap"><table class="booking-table"><thead><tr><th>代碼</th><th>姓名</th><th>信箱驗證</th>','<div id="e1Profile"');
 const slotTable=slice('<div class="booking-table-wrap"><table class="booking-table"><thead><tr><th>日期時間</th><th>場次／地點</th>','<h3>場次變更預檢及核定後儲存</h3>');
 const profile=slice('<div id="e1Profile"','<h3>場次與名額（臺灣時間）</h3>')
  .replace('參與者完整資料','TEST 個案詳細資料（OWNER 唯讀）')
  .replace('<option value="basic">基本與聯絡</option>','<option value="basic">虛構代碼與 OTP</option>')
  .replace('<option value="execution">研究執行</option>','').replace('<option value="administration">行政紀錄</option>','').replace('<option value="history">操作歷程</option>','')
  .replace('<option value="booking">預約出席</option>','<option value="booking">預約</option>')
  .replace('<button id="e1ProfilePdf" type="button" hidden disabled>核對並取得完整私人 PDF</button><a id="e1ProfileDownload" hidden download rel="noopener noreferrer">下載已驗證完整 PDF</a>','')
  .replace('原始紀錄時間軸（臺灣時間）','可核實 TEST 事件（臺灣時間）')
  .replace('僅呈現原欄位及精確目標稽核，非完整不可變歷史；沒有來源的事件不推定。','僅呈現現存簽署、通知建立與服務商接受時間；不推定其他事件或完整歷史。');
 const statusOptions=['ALL','OTP','SLOTS','HELD','CONFIRMED','CANCELLED','EXPIRED'].map((v,i)=>'<option value="'+v+'">'+['全部','待驗證','待選時段','暫留','已確認','已取消','已逾期'][i]+'</option>').join('');
 const filters='<div class="booking-filter-grid">'+
  slice('<div><label for="e1WsQuery">','<div><label for="e1WsStatus">').replace('姓名或參與者代碼','虛構測試代碼')+
  '<div><label for="e1WsStatus">預約狀態</label><select id="e1WsStatus">'+statusOptions+'</select></div>'+
  '<div><label for="e1WsSlotFilter">場次</label><select id="e1WsSlotFilter"><option value="">全部</option></select></div></div>';
 section=once(section,'<main>','<main>'+copy);
 section=once(section,'<h3>測試報名與預約名單</h3>','<h3>TEST 參與者名單（非正式研究資料）</h3>'+filters+
  caseTable.replace(/<thead>[\s\S]*?<\/thead>/,'<thead><tr><th>代碼</th><th>信箱驗證</th><th>場次</th><th>預約</th><th>同意 PDF</th><th>個案</th></tr></thead>')+profile);
 section=once(section,'<h3>測試場次與剩餘名額（臺灣時間）</h3>','<h3>測試場次與剩餘名額（臺灣時間）</h3>'+
  slice('<label for="e1WsDate">','<div class="booking-table-wrap"><table class="booking-table"><thead><tr><th>日期時間</th><th>場次／地點</th>')+
  slotTable.replace(/<thead>[\s\S]*?<\/thead>/,'<thead><tr><th>日期時間</th><th>場次</th><th>狀態</th><th>容量</th><th>暫留</th><th>確認</th><th>剩餘</th></tr></thead>')+
  '<p>目前僅查詢 TEST 場次與容量；正式場次新增、修改及收件仍未開放。</p>');
 const pdfSection='<section id="e1OwnerPresign" aria-labelledby="e1OwnerPresignTitle"><h2 id="e1OwnerPresignTitle">E1 TEST 文件管理｜虛構預簽 PDF（OWNER）</h2><p>僅使用程式生成的完整五頁測試文件；選用須清楚核對 SHA，且 TEST 案件為空。不得上傳正式同意書。</p>'+
  slice('<button type="button" class="secondary" id="e1PdfRead">','<label for="e1PdfFile">').replace('唯讀載入原私人 PDF 版本目錄','載入 TEST PDF 版本目錄').replace('尚未核對 OWNER 正式文件來源。','尚未核對 TEST 文件來源。')+
  slice('<label for="e1PdfChoose">','<a id="e1PdfReview"').replace('選擇既有預簽文件版號與 SHA','選擇 TEST 文件版號與 SHA').replace('尚未載入私人目錄','尚未載入 TEST 目錄')+
  '<button type="button" id="e1PdfReview" disabled>核對完整 PDF SHA</button><a id="siteTestPdfLink" hidden target="_blank" rel="noopener noreferrer">開啟完整五頁 TEST PDF</a>'+
  slice('<label><input type="checkbox" id="e1PdfChooseAttest">','<button id="e1PdfSource"').replace('所選原 PDF 的研究者簽名、完整內容、版號與 SHA','所選 TEST PDF 的完整內容、虛構預簽示意、版號與 SHA').replace('選用正式 E1 PDF','選用 TEST E1 PDF')+'</section>';
 section=once(section,'<main>','<main>'+pdfSection);
 const notices=slice('<section id="e1OwnerOperations"','<h3>跨工作階段原案件核對（唯讀）</h3>')
  .replace('E1 正式營運狀態｜本人簽署、原預約與通知唯讀核對','B08｜E1 TEST 通知管理（OWNER）')
  .replace('此處逐筆核對原同意索引、原 Reservations 與 Notifications outbox，不寫回、不重送郵件、不以已簽 PDF 推定預約成立，亦不將寄件服務接受當成已送達。','僅核對隔離合成案件通知。確認預約後可明確操作一次測試通知，固定研究室測試收件人，不寄真人信。')
  .replace('唯讀核對 E1 預約及通知狀態','唯讀核對 TEST 預約及通知狀態')
  .replace('尚未核對；請先唯讀核實原預約與通知。','尚未核對 TEST 通知。')
  .replace('E1 正式預約與通知核對結果','E1 TEST 預約與通知核對結果')+
  '<label for="siteNoticeAlias">已確認、未通知 TEST 案件</label><select id="siteNoticeAlias"></select><label><input type="checkbox" id="siteNoticeAck">僅發送單次隔離測試通知到研究室測試信箱</label><button id="siteNoticeSend" type="button" disabled>發送 TEST 確認通知</button></section>';
 section=once(section,'<main>','<main>'+notices);
 // One site and original B02/B03 markup. Server renders only the authorized
 // source mode; no shared client-mode parameter can grant formal access.
 const formalPanel=(slice('<section id="e1Workspace">','<label><input id="e1WsConfirm"')+'</section>')
  .replace(/e1Ws/g,'e1FormalWs').replace(/e1Profile/g,'e1FormalProfile').replace('id="e1Workspace"','id="e1FormalWorkspace"')
  .replace('場次變更預檢及核定後儲存','場次變更唯讀預檢（不儲存）')
  .replace('原正式名單及核定場次。以現行 E1 資格規則及場次登錄為範圍；未辨識原案不猜測。場次變更須先預檢，且只有獨立核定的完全相同草稿、正式資料寫入授權及安全條件均通過時才可儲存；未核定不寫入。開放單一場次不代表啟用招募。','正式來源唯讀 B02/B03/B04。僅適用獨立授權的研究室 OWNER；不儲存正式場次、不啟用真人收件。');
 const formalDocuments='<section id="e1FormalPdf"><h2>B10｜E1 正式私人預簽 PDF（OWNER 唯讀）</h2><p>只查詢 E1 版本索引及核對原私人 PDF；已簽參與者副本請由原 B04 同一案件取得。不替換、不上傳、不選用、不公開。</p>'+
  slice('<button type="button" class="secondary" id="e1PdfRead">','<label for="e1PdfFile">').replace(/e1Pdf/g,'e1FormalPdf')+
  slice('<label for="e1PdfChoose">','<a id="e1PdfReview"').replace(/e1Pdf/g,'e1FormalPdf').replace('選擇既有預簽文件版號與 SHA','查閱既有文件版號與 SHA')+
  '<p id="e1FormalPdfDetail"></p><button id="e1FormalPdfPreview" type="button" disabled>核對原私人 PDF SHA</button><a id="e1FormalPdfReview" hidden target="_blank" rel="noopener noreferrer">開啟已核實私人 PDF</a></section>';
 // Reuse the exact original B04 controller with only scoped DOM IDs and
 // existing formal workspace state; no original write controllers loaded.
 const profileScript=slice(' const profileStatus=m=>',' const clearApproval=()=>')
  .replace(/el\('e1Profile/g,"pel('e1FormalProfile").replace(/\bclear\(/g,'clearNode(')
  .replace("local(v).replace('T',' ')","localInput(v).replace('T',' ')")
  .replace("closeProfile();status('個案來源或權限已改變，請重整原名單。');","clear();text(status,'個案來源或權限已改變，請重整原名單。');")
  .replace("resetProfilePdf();profileStatus('私人 PDF 未核實；請重新查詢個案，不提供下載。');","clear();text(status,'私人 PDF 未核實；請重新查詢個案，不提供下載。');");
 const formalController=once(sameSiteFormalWorkspaceController.toString(),'/* FORMAL_PROFILE_CONTROLLER */',
  "const pel=id=>document.getElementById(id);const clearNode=n=>{n.textContent='';};let profile=null,profileEpoch=0,profileUrl=null;\n"+profileScript);
 // Reuse original B08 observation markup and joined controller only.
 // Exclude repair/recovery controls; no additional source selector or writes.
 const formalOps=slice('<section id="e1OwnerOperations"','<h3>跨工作階段原案件核對（唯讀）</h3>')
  .replace(/e1Ops/g,'e1FormalOps').replace(/e1OwnerOperations/g,'e1FormalOperations')+
  '<p><small>僅核對原 E1 同意索引所關聯的通知；未綁定的 outbox 紀錄不在本清單。此頁不提供補寄或修復操作。</small></p></section>';
 let formalOpsScript=slice('function e1OwnerOperationsSetup_(){','\n/** A joined audit is an observation')
  .replace(/e1Ops/g,'e1FormalOps')
  .replace("function clear(){while(out.firstChild)out.removeChild(out.firstChild);}","function clear(){out.textContent='';}")
  .replace("'正式營運狀態未能完整核對，禁止推定完成：'+\n   String(message&&message.message||message);","'正式營運狀態未能完整核對，禁止推定完成；請重新查詢原來源與權限。';")
  .replace(" button.addEventListener('click',()=>{\n  const current=++request;"," window.addEventListener('pagehide',()=>{request++;clear();statusNode.textContent='';button.disabled=true;});\n button.addEventListener('click',()=>{\n  const current=++request;");
 // Keep the original renderer's source, exact joined ID/revision, status and
 // non-delivery semantics. Scope its DOM IDs to the formal template.
 formalOpsScript="(function(){const $=id=>document.getElementById(id);\n"+formalOpsScript+"\n})();";
 const formalMarkup='<main><p><a href="<?= siteAppUrl + \'?view=admin\' ?>" target="_top">返回隔離 TEST 工作區</a></p>'+formalPanel+formalDocuments+formalOps+'</main>';
 section=once(section,'<main>','<main><p><a href="<?= siteAppUrl + \'?view=admin&workspace=formal\' ?>" target="_top">正式 B02/B03/B04/B08/B10 唯讀工作區（須獨立資料授權）</a></p>');
 const turnstile='<section><h2>隔離 Turnstile 驗證</h2><p>此處只驗證 Cloudflare token，不建立報名案件。</p><button id="siteTurnstileLoad" type="button">載入 Turnstile 挑戰</button><div id="siteTurnstileWidget"></div><button id="siteTurnstileVerify" type="button" disabled>送出目前的 token 驗證</button><p id="siteTurnstileStatus" role="status" aria-live="polite"></p></section>';
 return source.slice(0,start)+"<? if (siteFormalWorkspace) { ?>"+formalMarkup+"<? } else { ?>"+section.replace('</main>',turnstile+'</main>')+"<? } ?>"+
  '<script>\n('+formalController+')();\n('+sameSiteFormalDocumentsController.toString()+')();\n'+formalOpsScript+'\n'+copyScript+'\n('+sameSiteNoticeController.toString()+')();\n('+sameSiteDocumentController.toString()+')();\n('+sameSiteCleanupController.toString()+')();\n('+sameSiteTurnstileController.toString()+')();\n</script></body></html>';
}
// Enforce the existing same-site CI source delta in the actual assembler,
// not just its test/report. This is a local source contract only: the
// public release guard and releaseFiles allowlist still reject this profile.
function requireSameSiteSourceDelta(anonymous,result){
 const core=require('./study1-v2-release-source.cjs');
 const sha=core.digest(result);
 core.digest(anonymous);
 const need=(ok,reason)=>{if(!ok)throw Error('SAME_SITE_SOURCE_DELTA: '+reason);};
 const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const modified=['AdminConsole','AdminSandbox','Study1FormalBooking','Study1Visitor','Website'];
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
 need(candidate.get('Study1FormalBooking').source===sameSiteFormalBooking(base.get('Study1FormalBooking').source),'unexpected formal workspace delta');
 need(candidate.get('AdminSandbox').source===sameSiteFormalDocuments(base.get('AdminSandbox').source),'unexpected formal document delta');
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
const siteTestRpc = `async function study1E1SyntheticUat(request){
 try{study1AdminOwnerRequired_();}catch(_){return {ok:false,error:"UAT_REQUEST_REJECTED"};}
 return study1UatControlledRequest_(request);
}
function study1SiteTestCleanup(request){
 return study1SiteTestCleanupRequest_(request);
}
`;

function sameSiteCandidate(){
 const core=require('./study1-v2-release-source.cjs'),base=core.localSources();
 const prior=onlineCandidate(base),anonymous=core.anonymousReadOnlyCandidate(base);
 const get=(files,name)=>files.find(f=>f.name===name);
 const result=prior.map(f=>{
  if(f.name==='appsscript')return {...get(anonymous,f.name)};
  if(f.name==='Study1Visitor')return {...f,source:sameSiteVisitor(get(base,f.name).source)};
  if(f.name==='AdminConsole')return {...f,source:sameSiteAdmin(get(base,f.name).source)};
  if(f.name==='Study1FormalBooking')return {...f,source:sameSiteFormalBooking(get(base,f.name).source)};
  if(f.name==='AdminSandbox')return {...f,source:sameSiteFormalDocuments(get(base,f.name).source)};
  if(f.name!=='Website')return f;
  let source=get(base,'Website').source;
  source=once(source,'function doGet(e){',`function doGet(e){
 if(e&&e.parameter&&e.parameter.view==='admin'){
  study1AdminOwnerRequired_();
  const formal=e.parameter.workspace==='formal';
  if(formal)study1SiteFormalWorkspaceReadGate_();else study1UatTrustedConfig_();
  const t=HtmlService.createTemplateFromFile('AdminConsole');
  t.siteFormalWorkspace=formal;
  t.siteAppUrl=study1V2SelfWebUrl_();
  return t.evaluate().setTitle(formal?'Study 1｜正式唯讀管理':'Study 1｜測試資料管理').addMetaTag('viewport','width=device-width, initial-scale=1');
 }`);
  source=once(source,"  t.flowMode='FORMAL';",`  t.flowMode='FORMAL';
  t.siteOwner=false;
  try{study1AdminOwnerRequired_();t.siteOwner=true;}catch(_){}
  if(e.parameter.test==='1'){
   study1AdminOwnerRequired_();
   study1UatTrustedConfig_();
   t.flowMode='GAS_UAT';
  }`);
  source+='\n'+siteTestRpc;
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

// Apply the existing public RPC guard to the entire inherited RPC surface.
// Recognize only the exact same-site wrappers, after binding all bytes to
// this checkout, including the OWNER gate and the isolated store services.
function requireSameSiteReleaseSource(files){
 const core=require('./study1-v2-release-source.cjs');
 const sourceSha=core.digest(files);
 if(sourceSha!==core.digest(sameSiteCandidate()))throw Error('SAME_SITE_RELEASE_SOURCE_MISMATCH');
 const inherited=files.map(f=>{
  // The exact candidate digest and source-delta check above bind the scoped
  // OWNER read gate; check all other inherited RPCs with the original guard.
  if(f.name==='Study1FormalBooking')return {...f,source:sameSiteFormalBooking(f.source,true)};
  if(f.name==='AdminSandbox')return {...f,source:sameSiteFormalDocuments(f.source,true)};
  if(f.name!=='Website')return f;
  if(!f.source.endsWith(siteTestRpc))throw Error('SAME_SITE_RELEASE_RPC_BOUNDARY');
  return {...f,source:f.source.slice(0,-siteTestRpc.length)};
 });
 core.publicRpcSurface(inherited);
 core.closedWebsite(files);
 return sourceSha;
}

/* Evidence-only check for the later, independently authorized update of
 * ONE existing official deployment. Unlike the old create-deployment path,
 * the ID and URL must not change. Consumes already obtained GET snapshots;
 * no network, credentials, workflow trigger, permission or mutation. It
 * deliberately does NOT change sourceProof, publicRpcSurface, releaseFiles
 * or the original deployment guard. It cannot authorize a publication. */
function verifySameSiteReadback({before,after,priorDirect,currentDirect,newContent,reviewedTargetSha256}){
 const core=require('./study1-v2-release-source.cjs'),d=require('./study1-v2-release-evidence.cjs');
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

module.exports={originalVisitor,gasController,onlineCandidate,sameSiteVisitor,sameSiteAdmin,sameSiteCleanupController,sameSiteCandidate,requireSameSiteSourceDelta,requireSameSiteReleaseSource,verifySameSiteReadback};
