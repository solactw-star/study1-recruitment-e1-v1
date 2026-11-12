'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const html=fs.readFileSync(path.join(__dirname,'../gas/AdminConsole.html'),'utf8');
const a=html.indexOf('function e1OwnerPresignSetup_(){'),
 b=html.indexOf('\ne1OwnerPresignSetup_();',a);
assert.ok(a>0&&b>a,'OWNER E1 PDF module must stay in the existing admin file');
const script=html.slice(a,b+'\ne1OwnerPresignSetup_();'.length);
const ids=['e1PdfRead','e1PdfStatus','e1PdfFile','e1PdfTitle','e1PdfVersion',
 'e1PdfUploadAttest','e1PdfUpload','e1PdfChoose','e1PdfReview','e1PdfChooseAttest',
 'e1PdfSelect','e1PdfSource','e1PdfSignedRead','e1PdfSignedChoose','e1PdfSignedGet',
 'e1PdfSignedLink','e1PdfSignedStatus'];
function fixture(opts={}){
 const dom=new Map(),calls=[],errors=[];
 function el(id){
  if(!dom.has(id)){
   dom.set(id,{id,value:'',textContent:'',disabled:false,hidden:false,checked:false,
    files:[],children:[],handlers:{},
    addEventListener(type,fn){this.handlers[type]=fn},
    appendChild(child){this.children.push(child);return child},
    removeChild(child){const i=this.children.indexOf(child);if(i<0)throw Error('MISSING_CHILD');this.children.splice(i,1);return child},
    get firstChild(){return this.children[0]||null},
    removeAttribute(key){delete this[key]}
   });
  }
  return dom.get(id);
 }
 for(const id of ids)el(id);
 const pdf=Buffer.from('%PDF-1.7\n'+'PRE-SIGNED RESEARCHER OWNER FILE '.repeat(12)+'\n%%EOF'),
  sha=crypto.createHash('sha256').update(pdf).digest('hex'),
  pdfId='E1_PRESIGNED_12345678901234567890',recordId='11111111-2222-3333-4444-555555555555';
 let index={schemaVersion:1,revision:0,documents:[],current:{E1:null,E2:null},published:{E1:null,E2:null}};
 const signed={revision:1,records:[{id:recordId,experiment:'E1',version:'E1V2',
  state:'CONFIRMED',researcherPresigned:true,signedPdfSha256:sha}]};
 function respond(method,arg){
  if(Object.prototype.hasOwnProperty.call(opts,method))return opts[method](arg);
  if(method==='study1ConsentVersionList')return index;
  if(method==='study1ConsentVersionUpload'){
   index={...index,revision:index.revision+1,documents:index.documents.concat([{
    experiment:'E1',id:pdfId,version:arg.version,title:arg.title,
    sha256:sha,bytes:pdf.length,researcherPresigned:true,
    url:'https://drive.google.com/file/d/'+pdfId+'/view'
   }])};return index;
  }
  if(method==='study1ConsentVersionSelect'){
   index={...index,revision:index.revision+1,
    current:{...index.current,E1:arg.id}};return index;
  }
  if(method==='study1ConsentVersionPublication'){
   index={...index,revision:index.revision+1,
    published:{...index.published,E1:arg.id}};return index;
  }
  if(method==='study1EConsentOwnerList')return signed;
  if(method==='study1EConsentOwnerSignedPdfDownload')return {
   experiment:'E1',recordId,version:'E1V2',researcherPreSigned:true,
   sourceSha256:'a'.repeat(64),signedPdfSha256:sha,
   mime:'application/pdf',bytes:pdf.length,base64:pdf.toString('base64')};
  throw Error('UNEXPECTED_RPC_'+method);
 }
 function runner(){
  let success,fail;
  const handle=(method,arg)=>{
   calls.push({method,arg});try{success(respond(method,arg))}catch(e){errors.push(e);fail(e)}
  };
  return {
   withFailureHandler(fn){fail=fn;return this},
   withSuccessHandler(fn){success=fn;return this},
   study1ConsentVersionList(){handle('study1ConsentVersionList')},
   study1ConsentVersionUpload(arg){handle('study1ConsentVersionUpload',arg)},
   study1ConsentVersionSelect(arg){handle('study1ConsentVersionSelect',arg)},
   study1ConsentVersionPublication(arg){handle('study1ConsentVersionPublication',arg)},
   study1EConsentOwnerList(){handle('study1EConsentOwnerList')},
   study1EConsentOwnerSignedPdfDownload(arg){handle('study1EConsentOwnerSignedPdfDownload',arg)}
  };
 }
 let revoked=0;
 const make=tag=>({...el('CREATED_'+crypto.randomBytes(3).toString('hex')),tagName:tag,children:[],
  value:'',textContent:''});
 const runtime={document:{getElementById:el,createElement:make},
  window:{crypto:{subtle:crypto.webcrypto.subtle}},google:{script:{get run(){return runner()}}},
  URL:{createObjectURL:()=>('blob:owner:verified'),revokeObjectURL:()=>{revoked++}},
  Blob:globalThis.Blob,Uint8Array,Array,Object,String,Number,Date,Error,Promise,
  btoa:s=>Buffer.from(s,'binary').toString('base64'),
  atob:s=>Buffer.from(s,'base64').toString('binary')};
 vm.runInNewContext('const $=id=>document.getElementById(id);\n'+script,runtime,{timeout:2000});
 const fire=(id,event='click')=>{
  const n=el(id);assert.notEqual(n.disabled,true,'disabled '+id);
  assert.equal(typeof n.handlers[event],'function','missing '+id+'/'+event);
  return n.handlers[event]();
 };
 const file={size:pdf.length,arrayBuffer:async()=>Uint8Array.from(pdf).buffer};
 return {el,fire,calls,errors,pdf,sha,recordId,file,get revoked(){return revoked}};
}
test('existing OWNER page provides actual E1 presigned controls; hides legacy per-record researcher signing',()=>{
 assert.match(html,/id="e1OwnerPresign"/);
 assert.match(html,/id="staffPdfDualSignature" hidden/);
 assert.match(html,/id="e1PdfUpload" type="button" disabled/);
 assert.match(html,/id="e1PdfSource" type="button" disabled/);
});
test('OWNER never uploads before fresh directory read, local PDF and explicit human attestation',async()=>{
 const h=fixture();
 assert.equal(h.el('e1PdfUpload').disabled,true);
 h.fire('e1PdfRead');
 h.el('e1PdfFile').files=[h.file];
 h.el('e1PdfTitle').value='已預簽研究同意書';
 h.el('e1PdfVersion').value='REC_V02';
 h.fire('e1PdfVersion','input');
 assert.equal(h.el('e1PdfUpload').disabled,true);
 h.el('e1PdfUploadAttest').checked=true;
 h.fire('e1PdfUploadAttest','input');
 assert.equal(h.el('e1PdfUpload').disabled,false);
 await h.fire('e1PdfUpload');await new Promise(r=>setImmediate(r));
 const sent=h.calls.filter(x=>x.method==='study1ConsentVersionUpload');
 assert.equal(sent.length,1);assert.equal(sent[0].arg.researcherPresigned,true);
 assert.equal(sent[0].arg.experiment,'E1');
 assert.equal(Buffer.from(sent[0].arg.base64,'base64').equals(h.pdf),true);
 assert.match(h.el('e1PdfStatus').textContent,/尚未選用/);
 assert.equal(h.el('e1PdfSource').disabled,true,'upload is not publication');
});
test('OWNER selection and protected source are separate revision-checked decisions',async()=>{
 const h=fixture();h.fire('e1PdfRead');
 h.el('e1PdfFile').files=[h.file];h.el('e1PdfTitle').value='Presigned E1';
 h.el('e1PdfVersion').value='V2';h.el('e1PdfUploadAttest').checked=true;
 h.fire('e1PdfUploadAttest','input');await h.fire('e1PdfUpload');
 h.el('e1PdfChoose').value='E1_PRESIGNED_12345678901234567890';
 h.fire('e1PdfChoose','change');h.el('e1PdfChooseAttest').checked=true;
 h.fire('e1PdfChooseAttest','change');
 assert.equal(h.el('e1PdfSelect').disabled,false);
 h.fire('e1PdfSelect');
 assert.equal(h.el('e1PdfSource').disabled,true,'new attestation required after owner selection');
 h.el('e1PdfChooseAttest').checked=true;h.fire('e1PdfChooseAttest','change');
 h.fire('e1PdfSource');
 assert.equal(h.calls.filter(x=>x.method==='study1ConsentVersionSelect').length,1);
 const published=h.calls.filter(x=>x.method==='study1ConsentVersionPublication');
 assert.equal(published.length,1);assert.equal(published[0].arg.confirmSha256,h.sha);
 assert.match(h.el('e1PdfStatus').textContent,/仍維持關閉/);
});
test('ambiguous OWNER upload result locks repeated writes until a fresh read',async()=>{
 const h=fixture({study1ConsentVersionUpload:()=>{throw Error('COMMIT_UNKNOWN')}});
 h.fire('e1PdfRead');
 h.el('e1PdfFile').files=[h.file];h.el('e1PdfTitle').value='Presigned E1';
 h.el('e1PdfVersion').value='V2';h.el('e1PdfUploadAttest').checked=true;
 h.fire('e1PdfUploadAttest','input');await h.fire('e1PdfUpload');
 assert.equal(h.el('e1PdfUpload').disabled,true);
 assert.match(h.el('e1PdfStatus').textContent,/不得重送/);
 assert.equal(h.calls.filter(x=>x.method==='study1ConsentVersionUpload').length,1);
});
test('OWNER private completed PDF link appears only after SHA and byte readback, invalid bytes fail closed',async()=>{
 const h=fixture();h.fire('e1PdfSignedRead');
 h.el('e1PdfSignedChoose').value=h.recordId;h.fire('e1PdfSignedChoose','change');
 h.fire('e1PdfSignedGet');await new Promise(r=>setTimeout(r,40));
 assert.equal(h.el('e1PdfSignedLink').hidden,false,h.el('e1PdfSignedStatus').textContent);
 assert.match(h.el('e1PdfSignedLink').download,/Study1_E1_E1V2_/);
 const bad=fixture({study1EConsentOwnerSignedPdfDownload:()=>({
  experiment:'E1',recordId:h.recordId,version:'E1V2',researcherPreSigned:true,
  sourceSha256:'a'.repeat(64),signedPdfSha256:h.sha,bytes:h.pdf.length,
  mime:'application/pdf',base64:Buffer.from('%PDF-BROKEN').toString('base64')
 })});
 bad.fire('e1PdfSignedRead');bad.el('e1PdfSignedChoose').value=bad.recordId;
 bad.fire('e1PdfSignedChoose','change');bad.fire('e1PdfSignedGet');
 await new Promise(r=>setImmediate(r));
 assert.equal(bad.el('e1PdfSignedLink').hidden,true);
 assert.match(bad.el('e1PdfSignedStatus').textContent,/禁止下載/);
});
