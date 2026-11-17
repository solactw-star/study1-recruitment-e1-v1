'use strict';
/** Shared source assembly and static safety contract. Local reads only; no publishing, OAuth or network operations. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const REPO = 'solactw-star/study1-recruitment-e1-v1';
const SID = '1qg3PuI8sGFOAP-pJ889d9RrN0p_e0zsfqM274HgG4sEg9Qjv-xzqeL2f';
const TYPES = Object.freeze({'.js':'SERVER_JS','.gs':'SERVER_JS','.html':'HTML','.json':'JSON'});
// The retired synthetic UI/fixture modules remain in the repo for historical
// offline test imports, but must never be executable in formal E1 GAS HEAD.
const TEST_ONLY_NONDEPLOYABLE=Object.freeze([
 'Study1FixtureAdapter.js','Study1Team.html','Study1Unified.html','Study1Unified.js'
]);
// Current reviewed release inventory, not a permanent file-count requirement.
// Development source loading is separate. A changed inventory requires explicit
// source review before any release; existing release profiles remain unchanged.
const APPROVED = Object.freeze([
 'AdminConsole','AdminSandbox','BookingCancelHoldPreflight','BookingCore',
 'BookingHoldTransaction','BookingReadOnlyLock','BookingReadOnlyLocked',
 'BookingReadOnlySheet','BookingReschedulePreflight','Index','OtpCore',
 'OtpThrottle','OtpTransaction','Study1EConsentBinding','Study1EConsentOtpAdapter',
 'Study1FormalBooking','Study1FormalConsent',
 'Study1ParticipantIntake','Study1ParticipantTrust','Study1PdfLib',
 'Study1PdfStampCore','Study1SelfReportAuthority',
 'Study1Visitor','Study1WizardEnrollment','Study1WizardP0Bridge','Website',
 'appsscript'
].sort());
const fail = m => {throw Error('V2_HEAD_ONLY_BLOCKED: '+m);};
const require_ = (v,m) => {if(!v)fail(m);};
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const fileData = files => files.map(({name,type,source})=>({name,type,source}));
function canonical(files) {
 require_(Array.isArray(files)&&files.length>0,'empty or invalid GAS source inventory');
 const names=new Set();
 const result=files.map(f=>{
  require_(f && typeof f.name==='string' && /^[^\/\\.][^\/\\]*$/.test(f.name) &&
   ['SERVER_JS','HTML','JSON'].includes(f.type) && typeof f.source==='string' &&
   f.source.length>0 && !names.has(f.name),'invalid, empty, or duplicate GAS file');
  names.add(f.name);
  return [f.name,f.type,f.source];
 }).sort((a,b)=>a[0].localeCompare(b[0],'en'));
 require_(files.filter(f=>f.name==='appsscript'&&f.type==='JSON').length===1,
  'exactly one appsscript JSON manifest required');
 require_(files.filter(f=>f.type==='JSON').length===1,'unexpected JSON files');
 return result.map(x=>JSON.stringify(x)).join('\n');
}
const digest = files => sha(canonical(files));
/** Reject public source releases unless every callable private RPC is deny-gated. */
function publicRpcSurface(files){
 // Explicit fail-closed check even when this inventory is supplied by a caller.
 const legacy=['Study1FixtureAdapter','Study1Team','Study1Unified','Study1Flow'];
 require_(!files.some(f=>legacy.includes(f.name)),
  'non-deployable synthetic executable in formal GAS source inventory');
 const visitor=files.find(f=>f.name==='Study1Visitor'&&f.type==='HTML')?.source||'';
 require_(visitor.includes("document.body.dataset.siteMode!=='FORMAL')return;")&&
  !visitor.includes("document.body.dataset.siteMode==='FORMAL')return;")&&
  !/study1UnifiedPreview|SIMULATED_SIGN_ONLY|function v08Preview_/.test(visitor),
  'formal visitor is not isolated from synthetic controller');
 for(const f of files.filter(f=>f.type==='SERVER_JS'&&f.name!=='Study1PdfLib'))
  require_(!/\bstudy1(?:UnifiedPreview|Fixture)[A-Za-z0-9_]*\s*\(/.test(f.source),
   'formal server depends on retired synthetic runtime: '+f.name);
 const w=files.find(f=>f.name==='Website'&&f.type==='SERVER_JS')?.source||'';
 require_(w.includes("function study1V2PublicRpcDeny_(){throw new Error('STUDY1_V2_PUBLIC_READ_ONLY');}"),
  'missing public RPC deny helper');
 require_(w.includes("['admin','team','preview','demo'].includes(e.parameter.view)"),
  'public admin routes exposed');
 const safe=new Set(['doGet','getPublicConfig','study1ParticipantReadiness','requestOtp',
  'verifyOtp','holdSlot','cancelHold','submitConsent','listSlots']);
 const regex=/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
 const gate="if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();";
 let total=0;
 for(const f of files.filter(x=>x.type==='SERVER_JS')){
  // pdf-lib is a minified UMD bundle; its inner functions are not GAS RPCs.
  // Pin the entire vendor blob, and reject any unreviewed change instead of
  // misclassifying minifier-local names as remotely callable functions.
  if(f.name==='Study1PdfLib'){
   const blob=crypto.createHash('sha1').update('blob '+Buffer.byteLength(f.source)+'\0'+f.source).digest('hex');
   require_(blob==='f0916cac6bcfa54425c819a16e6ca11360a8d7c5',
    'reviewed minified PDF bundle changed');
   continue;
  }
  for(const m of f.source.matchAll(regex)){
  // Nested helper declarations are indented and are not callable via google.script.run.
  // Top-level declarations are flush-left, or follow another top-level declaration on one line.
  const prefix=f.source.slice(f.source.lastIndexOf('\n',m.index)+1,m.index);
  if(prefix.length>0&&prefix.trim()==='')continue;
  if(m[1].endsWith('_')||safe.has(m[1]))continue;
  require_(f.source.slice(m.index+m[0].length).startsWith(gate),
   'unguarded public RPC '+f.name+'.'+m[1]);
  total++;
  }
 }
 require_(total>=35,'exposed RPC inventory unexpectedly reduced');
 const intake=files.find(f=>f.name==='Study1ParticipantIntake'&&f.type==='SERVER_JS')?.source||'';
 require_(intake.includes("if(typeof study1V2PublicRpcDeny_==='function')return {ready:false,experiment:'E1',reason:'REGISTRATION_NOT_OPEN'};"),
  'participant readiness must refuse new intake');
 require_(w.includes('function getPublicConfig(){return {open:false,consentReady:false'),
  'public website intake not closed');
 return total;
}
function closedManifest(files,allowAnonymous=false){
 const m=files.find(f=>f.name==='appsscript'&&f.type==='JSON');
 require_(m,'missing Apps Script manifest');
 let obj;
 try{obj=JSON.parse(m.source);}catch{fail('manifest cannot parse');}
 require_(obj.timeZone==='Asia/Taipei' && obj.runtimeVersion==='V8' &&
  ( ['MYSELF','ANYONE'].includes(obj.webapp?.access) || (allowAnonymous===true&&obj.webapp?.access==='ANYONE_ANONYMOUS') ) && obj.webapp?.executeAs==='USER_DEPLOYING',
  'V2 manifest must have MYSELF or login-only ANYONE / USER_DEPLOYING');
 if(obj.webapp.access!=='MYSELF')publicRpcSurface(files);
 return obj;
}
// Explicit opt-in candidate: no change to the normal public/private build sources.
function anonymousReadOnlyCandidate(base=localSources()){
 require_(closedManifest(base).webapp.access==='ANYONE','anonymous candidate requires reviewed public baseline');
 requireReviewedInventory(base);
 closedWebsite(base);publicRpcSurface(base);
 const files=base.map(f=>{if(f.name!=='appsscript')return {...f};
  const m=JSON.parse(f.source);m.webapp.access='ANYONE_ANONYMOUS';
  return {...f,source:JSON.stringify(m,null,2)+'\n'};
 });
 require_(closedManifest(files,true).webapp.access==='ANYONE_ANONYMOUS','anonymous manifest required');
 closedWebsite(files);return files;
}
function closedWebsite(files){
 const w=files.find(f=>f.name==='Website'&&f.type==='SERVER_JS')?.source;
 require_(w && w.includes('function getPublicConfig(){return {open:false,consentReady:false') &&
  w.includes('function requestOtp(){return rejectIntake_();}') &&
  w.includes('function verifyOtp(){return rejectIntake_();}') &&
  w.includes('function holdSlot(){return rejectIntake_();}') &&
  w.includes('function submitConsent(){return rejectIntake_();}') &&
  w.includes('function listSlots(){return [];}'),
  'V2 public intake remains closed in Website.js');
}
function readDevelopmentSources(root=path.join(__dirname,'..','gas')){
 const clasp=JSON.parse(fs.readFileSync(path.join(root,'.clasp.json'),'utf8'));
 require_(clasp.scriptId===SID,'local .clasp.json points to a different Script ID');
 const filenames=fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isFile() && x.name!=='.clasp.json');
 // Synthetic sources are kept only for offline tests, never sent to GAS.
 require_(!filenames.some(x=>TEST_ONLY_NONDEPLOYABLE.includes(x.name)),
  'retired synthetic source reintroduced into executable GAS directory');
 const files=filenames.map(x=>{
  const ext=path.extname(x.name);
  require_(Object.hasOwn(TYPES,ext),'unrecognized GAS source extension: '+x.name);
  const name=x.name==='Study1Unified.js'?'Study1Flow':path.basename(x.name,ext);
  return {name,type:TYPES[ext],source:fs.readFileSync(path.join(root,x.name),'utf8')};
 });
 canonical(files);
 return fileData(files);
}
function requireReviewedInventory(files){
 canonical(files);
 require_(JSON.stringify(files.map(f=>f.name).sort())===JSON.stringify(APPROVED),
  'GAS source inventory differs from the current reviewed V2 allowlist');
}
function localSources(root=path.join(__dirname,'..','gas')){
 const files=readDevelopmentSources(root);
 requireReviewedInventory(files);
 closedManifest(files);closedWebsite(files);
 return files;
}

function privateOwnerReadOnlyCandidate(files){
 // Offline only: never used by main(), localSources(), prepare(), apply(), or workflow.
 // Start exclusively from the reviewed, closed public source inventory.
 requireReviewedInventory(files);
 require_(closedManifest(files).webapp.access==='ANYONE',
  'private candidate requires the unchanged login-only public baseline');
 closedWebsite(files);
 const patch=(source,from,to)=>{
  require_(source.split(from).length===2,'private candidate source anchor drift');
  return source.replace(from,()=>to);
 };
 const owners={
  AdminSandbox:['study1ConsentVersionList','study1EConsentOwnerList',
   'study1EConsentOwnerSignedPdfDownload','study1EConsentOwnerWithdrawalCases'],
  Study1FormalBooking:['study1OwnerE1OperationsAudit','study1OwnerE1RecoveryAudit','study1OwnerE1Workspace','study1OwnerE1SlotChangePreview','study1OwnerE1RecruitmentDraft','study1OwnerE1Profile','study1OwnerE1ProfilePdf'],
  Study1WizardP0Bridge:['study1OwnerE1SlotAudit']
 };
 const gate="if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();";
 const result=files.map(f=>{
  let s=f.source;
  if(f.name==='appsscript'){
   const manifest=JSON.parse(s);
   manifest.webapp.access='MYSELF';
   s=JSON.stringify(manifest,null,2)+'\n';
  }else if(f.name==='Website'){
   s=patch(s,'function doGet(e){',`function doGet(e){
 if(e&&e.parameter&&e.parameter.view==='admin'){
  study1AdminOwnerRequired_();
  return HtmlService.createHtmlOutputFromFile('AdminConsole')
   .setTitle('Study 1｜OWNER 私人唯讀管理')
   .addMetaTag('viewport','width=device-width, initial-scale=1');
 }`);
  }else if(f.name==='AdminConsole'){
   s=patch(s,'<section><h2>測試研究內容','<section hidden><h2>測試研究內容');
   s=patch(s,'<section><h2>測試預約設定','<section hidden><h2>測試預約設定');
   s=patch(s,'\nreload();\n})();','\n// Private read-only candidate: no automatic sandbox RPC.\n})();');
   s=patch(s,'<label for="e1PdfFile">','<div hidden><label for="e1PdfFile">');
   s=patch(s,'<label for="e1PdfChoose">','</div><label for="e1PdfChoose">');
   s=patch(s,'<label><input type="checkbox" id="e1PdfChooseAttest">',
    '<div hidden><label><input type="checkbox" id="e1PdfChooseAttest">');
   s=patch(s,'<h3>已完成簽署的完整 PDF｜OWNER 私人副本</h3>',
    '</div><p>本私人唯讀候選僅供核對既有 PDF 與下載已核實副本；不提供上傳、選用或設定來源。</p><h3>已完成簽署的完整 PDF｜OWNER 私人副本</h3>');
   s=patch(s,' <h3>OWNER 手動核對已簽 PDF 與原預約（禁止自動重試）</h3>',
    ' <div hidden><h3>OWNER 手動核對已簽 PDF 與原預約（禁止自動重試）</h3>');
   s=patch(s,'</section>\n\n<section id="staffWithdrawal"',
    '</div></section>\n\n<section id="staffWithdrawal"');
   s=patch(s,'<title>Study 1｜OWNER 後台（正式 E1 文件與隔離測試分區）</title>',
    '<title>Study 1｜OWNER 私人唯讀管理</title>');
   s=patch(s,'<header><h1>Study 1｜研究室 OWNER 後台</h1><p>正式 E1 文件與隔離測試分區；目前不接受真人報名、預約或電子簽署。</p></header>',
    '<header><h1>Study 1｜研究室 OWNER 私人唯讀管理</h1><p>核對 E1 原始場次、PDF、預約與通知；不開放真人報名、預約或電子簽署。</p></header>');
   s=patch(s,'<strong>隔離測試與正式文件分區</strong><p>測試設定不會修改正式研究資料；獨立的 E1 OWNER PDF 區將使用原私人 Drive 與同意書版本索引，但不開放真人收件。所有正式操作仍須通過伺服器端 OWNER 身分驗證。</p>',
    '<strong>私人唯讀驗收候選｜非正式營運</strong><p>僅已驗證研究室 OWNER 可核對既有來源；所有寫入、寄信、場次調整、簽署與真人收件 RPC 仍被拒絕。資料是否齊備及正式啟用須另行核對及授權。</p>');
  }else if(Object.hasOwn(owners,f.name)){
   for(const name of owners[f.name]){
    const re=new RegExp('^function '+name+'\\([^\\n]*\\)\\{','gm');
    const hits=[...s.matchAll(re)];
    require_(hits.length===1,'private candidate RPC declaration drift: '+name);
    const prefix=hits[0][0],at=hits[0].index+prefix.length;
    require_(s.slice(at).startsWith(gate)&&
     /^\s*study1AdminOwnerRequired_\(\);/.test(s.slice(at+gate.length)),
     'private candidate RPC must already require OWNER before reads: '+name);
    s=patch(s,prefix+gate,prefix);
   }
  }
  return {...f,source:s};
 });
 require_(closedManifest(result).webapp.access==='MYSELF',
  'private candidate must remain MYSELF');
 closedWebsite(result);
 let publicRejected=false;
 try{publicRpcSurface(result);}catch(e){
  publicRejected=String(e.message).includes('unguarded public RPC');
 }
 require_(publicRejected,'private candidate must not pass public release guard');
 return result;
}
function privateOwnerManagementCandidate(files){
 // Offline only; no automatic HEAD sync, version creation, or deployment.
 // Extend, rather than replace, the already reviewed read-only candidate.
 const base=privateOwnerReadOnlyCandidate(files);
 const patch=(s,a,b)=>{
  require_(s.split(a).length===2,'private management source anchor drift');
  return s.replace(a,()=>b);
 };
 const gate="if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();";
 const original=files.find(f=>f.name==='AdminConsole').source;
 const boundary='<h3>已完成簽署的完整 PDF｜OWNER 私人副本</h3>';
 const start='<label for="e1PdfFile">';
 const first=original.indexOf(start),last=original.indexOf(boundary);
 require_(first>=0&&last>first,'private management PDF UI anchor drift');
 const result=base.map(f=>{
  let s=f.source;
  if(f.name==='AdminSandbox'){
   // Scope all three existing RPCs to E1; preserve the original OWNER,
   // closed flags, lock/revision, ACL, original SHA and readback checks.
   const upload='function study1ConsentVersionUpload(input){'+gate;
   const select='function study1ConsentVersionSelect(input){'+gate;
   const pub='function study1ConsentVersionPublication(input){'+gate;
   s=patch(s,upload,'function study1ConsentVersionUpload(input){\n study1AdminOwnerRequired_();\n if(!input||input.experiment!==\'E1\'||input.researcherPresigned!==true)throw Error(\'E1_PRESIGNED_MANAGEMENT_ONLY\');');
   s=patch(s,select,'function study1ConsentVersionSelect(input){');
   s=patch(s,"if(!entry)throw Error('只能選擇原私人資料夾中的已存版本');","if(!entry)throw Error('只能選擇原私人資料夾中的已存版本');\n  if(entry.experiment!=='E1'||entry.researcherPresigned!==true)throw Error('E1_PRESIGNED_MANAGEMENT_ONLY');");
   s=patch(s,pub,"function study1ConsentVersionPublication(input){\n study1AdminOwnerRequired_();\n if(!input||input.experiment!=='E1'||typeof input.id!=='string'||!input.id)throw Error('E1_PRESIGNED_MANAGEMENT_ONLY');");
   // Verify the selected private source even when the pointer already matches.
   s=patch(s,"  if(before.published[input.experiment]===input.id)return before;\n","");
   s=patch(s,"   if(!entry||before.current[input.experiment]!==input.id||","   if(!entry||entry.researcherPresigned!==true||before.current[input.experiment]!==input.id||");
   s=patch(s,"  const after={...before,revision:before.revision+1,\n   published:","  if(before.published[input.experiment]===input.id)return before;\n  const after={...before,revision:before.revision+1,\n   published:");
  }else if(f.name==='Study1FormalBooking'){
   const signature='function study1OwnerE1SlotChangeCommit(input){';
   s=patch(s,signature+gate+'\n study1AdminOwnerRequired_();',signature+'\n study1AdminOwnerRequired_();');
  }else if(f.name==='AdminConsole'){
   const a=s.indexOf('<div hidden>'+start),b=s.indexOf(boundary);
   require_(a>=0&&b>a,'private read-only PDF UI anchor drift');
   s=patch(s,s.slice(a,b),original.slice(first,last));
   s=patch(s,'<title>Study 1｜OWNER 私人唯讀管理</title>','<title>Study 1｜OWNER 私人 E1 管理</title>');
   s=patch(s,'<h1>Study 1｜研究室 OWNER 私人唯讀管理</h1>','<h1>Study 1｜研究室 OWNER 私人 E1 管理</h1>');
   s=patch(s,'<strong>私人唯讀驗收候選｜非正式營運</strong><p>僅已驗證研究室 OWNER 可核對既有來源；所有寫入、寄信、場次調整、簽署與真人收件 RPC 仍被拒絕。資料是否齊備及正式啟用須另行核對及授權。</p>','<strong>私人 E1 文件管理候選｜非正式營運</strong><p>僅研究室 OWNER 可在獨立授權後管理 E1 研究者預簽 PDF 及已核定單筆場次；不開放報名、參與者預約異動、寄信或簽署。正式資料操作仍需個別授權，場次寫入僅限獨立核定且收件關閉。</p>');
   // Unknown write result never re-enables writes merely because a GET succeeds.
   s=patch(s,'try{unknown=false;render(x);}',"try{render(x);if(unknown)msg.textContent+=' 先前寫入結果未知；本頁仍鎖定寫入，須由 OWNER 獨立核對原紀錄後另行處置，不得重送。';}");
  }else if(f.name==='Website'){
   s=patch(s,".setTitle('Study 1｜OWNER 私人唯讀管理')",".setTitle('Study 1｜OWNER 私人 E1 管理')");
  }
  return {...f,source:s};
 });
 require_(closedManifest(result).webapp.access==='MYSELF','private management requires MYSELF');
 closedWebsite(result);
 let rejected=false;
 try{publicRpcSurface(result);}catch(e){rejected=String(e.message).includes('unguarded public RPC');}
 require_(rejected,'private management candidate rejected by public release guard');
 return result;
}

module.exports={REPO,SID,APPROVED,fail,require_,sha,fileData,canonical,digest,readDevelopmentSources,requireReviewedInventory,localSources,closedManifest,closedWebsite,publicRpcSurface,anonymousReadOnlyCandidate,privateOwnerReadOnlyCandidate,privateOwnerManagementCandidate};
