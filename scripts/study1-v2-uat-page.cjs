'use strict';
// Deterministic derived UAT HTML; keep formal GAS files and their guards intact.
const fs=require('node:fs'),path=require('node:path');
const core=require('./study1-v2-gas-head-only.cjs');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function replace(s,from,to){if(s.split(from).length!==2)throw Error('UAT source anchor changed: '+from.slice(0,80));return s.replace(from,to);}
function browserBooking(){const s=read('gas/BookingCore.js'),i=s.indexOf('/** Read column headings ONLY');if(i<1)throw Error('booking portability anchor');return s.slice(0,i);}
function browserPdf(){let s=read('gas/Study1PdfStampCore.js');
 const start=s.indexOf('function study1PdfDigest_('),end=s.indexOf('function study1PdfLayoutValidate_(');
 if(start<0||end<=start)throw Error('digest anchor changed');
 s=s.slice(0,start)+"async function study1PdfDigest_(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes))),b=>b.toString(16).padStart(2,'0')).join('');}\n"+s.slice(end);
 s=replace(s,"Utilities.formatDate(now,'Asia/Taipei','yyyy/MM/dd')","(()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));return p.year+'/'+p.month+'/'+p.day;})()");
 const a=s.indexOf('function study1PdfLayoutRead_('),b=s.indexOf('/** Never trust the browser',a);
 if(a<0||b<=a)throw Error('formal property adapter anchor changed');s=s.slice(0,a)+s.slice(b);
 s=replace(s,'const originalHash=study1PdfDigest_(original);','const originalHash=await study1PdfDigest_(original);');
 return replace(s,'const signedSha=study1PdfDigest_(bytes);','const signedSha=await study1PdfDigest_(bytes);');
}
function kernel(){return [browserBooking(),browserPdf(),read('scripts/study1-v2-uat-session.js')].join('\n');}
function build(){
 const source=read('gas/Study1Visitor.html'),style=source.match(/<style>[\s\S]*?<\/style>/)?.[0];
 if(!style)throw Error('original UI style anchor missing');
 const html='<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Study1 E1 隔離人工驗收</title>'+style+'</head><body data-site-mode="ISOLATED_UAT">'+
 '<div class="noticebar">隔離人工驗收｜不是研究招募、不得填寫或簽署真實個資｜不寄信、不傳送、不保存至正式系統</div>'+
 '<header><nav><div class="brand">Study 1 <small>記憶與身體感覺研究 · 測試</small></div></nav><div class="hero"><h1>實驗時間預約<br><span>與知情同意書簽署</span></h1><p>沿用原參與者介面樣式、預約容量核心及 PDF 合成引擎。本頁只使用虛構資料。</p></div></header><main class="shell"><div class="maincard"><div id="progressText"></div><div id="progress" class="progress">'+ '<span></span>'.repeat(7)+'</div>'+
 '<section class="step" id="step-choose"><span class="tag">STEP 01</span><h2>選擇研究</h2><button id="chooseE1" class="study-card"><strong>實驗一 E1</strong><small>合成測試｜非正式招募</small></button></section>'+
 '<section class="step" id="step-screen" hidden><span class="tag">STEP 02</span><h2>資格與聯絡資料（虛構）</h2><p>測試身分：TEST 參與者；信箱：participant@example.invalid。不輸入真實資料。</p><label class="check"><input id="fictionalEligible" type="checkbox">使用符合資格的虛構人物進行驗收（不是本人資格聲明）</label><button id="screenNext">繼續</button></section>'+
 '<section class="step" id="step-otp" hidden><span class="tag">STEP 03</span><h2>模擬信箱驗證</h2><p>本頁不寄信；測試驗證碼 12345678。</p><label for="otpInput">八位測試碼</label><input id="otpInput" inputmode="numeric" maxlength="8" autocomplete="off"><button id="otpVerify">驗證並選擇時段</button></section>'+
 '<section class="step" id="step-slots" hidden><span class="tag">STEP 04</span><h2>選擇方便參與的時段</h2><div class="box"><p>合成日期依本機日期建立。使用原 BookingCore 排除已滿場次；只有本頁容量，不與其他訪客共享。</p><label class="field" for="slot">可預約時段（臺灣時間）</label><select id="slot"></select></div><button id="hold" disabled>暫留此時段並繼續</button></section>'+
 '<section class="step" id="step-confirm" hidden><span class="tag">STEP 05</span><h2>簽署前請核對研究與預約資料</h2><dl class="box"><dt>開始</dt><dd id="v06Date"></dd><dt>結束</dt><dd id="v06Time"></dd><dt>暫留有效至</dt><dd id="holdUntil"></dd></dl><button id="confirm">資料正確，閱讀完整 PDF</button></section>'+
 '<section class="step" id="step-consent" hidden><span class="tag">STEP 06</span><h2>閱讀完整測試 PDF 並手寫測試筆跡</h2><div class="box warn">五頁合成文件不是 REC 核准知情同意書，也沒有正式研究者簽名。請勿寫真名。時間為本機測試臺灣時間，不是正式伺服器證據。</div><a id="officialPdfDownload" class="pdf" download="UAT_NOT_CONSENT_original.pdf">下載完整測試原文</a><object id="officialPdfViewer" type="application/pdf" width="100%" height="520"><p>若無法內嵌，請下載完整原文。</p></object><p class="help" style="overflow-wrap:anywhere">原文 SHA-256：<span id="officialPdfSha"></span></p><label class="check"><input id="readPdf" type="checkbox">已閱讀完整測試文件</label><div class="box"><canvas id="visitorSignaturePreview" width="700" height="160" aria-label="虛構手寫測試"></canvas><button id="visitorSignatureClear" class="ghost">清除筆跡</button></div><label class="check"><input id="agree" type="checkbox">同意進行合成簽署操作（非研究同意）</label><button id="finish">合成完整測試 PDF 並確認測試預約</button></section>'+
 '<section class="step" id="step-done" hidden><div class="receipt"><h2>隔離測試完成</h2><dl><dt>本頁預約</dt><dd id="formalDoneBooking"></dd><dt>完整頁數</dt><dd id="formalDonePages"></dd><dt>測試日期</dt><dd id="formalDonePdfDate"></dd><dt>簽署 SHA</dt><dd id="formalDonePdfSha" style="overflow-wrap:anywhere"></dd></dl><a id="formalDonePdfDownload" class="pdf" download="UAT_NOT_CONSENT_signed.pdf">下載完整已簽測試 PDF</a><p>僅本頁測試，正式報名、共用容量、Sheets、Drive 與寄信尚未驗收。</p></div></section>'+
 '<p id="status" role="status" aria-live="polite"></p><button id="cancelTest" class="ghost">取消未完成測試</button></div></main><footer>Study1 · 隔離測試版本｜重新整理即清除本頁紀錄</footer>';
 const scripts=[read('gas/Study1PdfLib.js'),kernel(),read('scripts/study1-v2-uat-ui.js')];if(scripts.some(s=>/<\/script|<\?/i.test(s)))throw Error('unsafe embedded script delimiter');
 return html+scripts.map(s=>'<script>'+s+'\n</script>').join('')+'</body></html>\n';
}
function candidate(){const base=core.anonymousReadOnlyCandidate();const files=base.map(f=>f.name==='Website'?{...f,source:replace(f.source,'function doGet(e){',"function doGet(e){\n if(e&&e.parameter&&e.parameter.view==='uat')return HtmlService.createHtmlOutputFromFile('Study1IsolatedUat').setTitle('Study1 隔離人工驗收').addMetaTag('viewport','width=device-width, initial-scale=1');")}:f);
 files.push({name:'Study1IsolatedUat',type:'HTML',source:build()});core.closedManifest(files,true);core.closedWebsite(files);core.publicRpcSurface(files);return files;
}
module.exports={kernel,build,candidate};
if(require.main===module){const output=process.argv[2];if(!output)throw Error('output path required');fs.writeFileSync(output,build(),{flag:'wx'});}
