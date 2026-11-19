'use strict';
const fs=require('node:fs'),path=require('node:path');
const runtime='\n'+fs.readFileSync(path.join(__dirname,'study1-v2-same-date-runtime.js'),'utf8');
const edits={
 Study1PdfStampCore:[
  ['async function study1PdfComposeSigned_(source,signature,layout,expected,serverDate){',
   'async function study1PdfComposeSigned_(source,signature,layout,expected,serverDate,sameDateBinding){'],
  ['  page.drawText(taipeiDate,{x:layout.date.x,y:layout.date.y,\n   size:layout.date.fontSize,font,color:PDFLib.rgb(0,0,0)});',
`  if(sameDateBinding!==undefined){
   const policy=study1PdfSameDateValidate_(sameDateBinding.value,expected,layout);
   if(!/^[a-f0-9]{64}$/.test(sameDateBinding.sha256||''))throw Error('E1_SAME_DATE_BINDING_INVALID');
   const parts=taipeiDate.split('/');
   for(const role of ['researcher','participant']){
    const box=policy[role],target=pdf.getPage(box.pageIndex),actual=target.getSize();
    if(Math.abs(actual.width-box.pageWidth)>1.5||Math.abs(actual.height-box.pageHeight)>1.5)
     throw Error('E1_SAME_DATE_PAGE_SIZE_CHANGED');
    for(const [i,part] of ['year','month','day'].entries())
     target.drawText(parts[i],{x:box[part].x,y:box[part].y,size:policy.fontSize,font,color:PDFLib.rgb(0,0,0)});
   }
  }else{
   page.drawText(taipeiDate,{x:layout.date.x,y:layout.date.y,
    size:layout.date.fontSize,font,color:PDFLib.rgb(0,0,0)});
  }`],
  ['   experiment:expected.experiment,version:expected.version};',
   "   experiment:expected.experiment,version:expected.version,\n   ...(sameDateBinding?{researcherDatePolicy:'MATCH_PARTICIPANT_COMPLETION_DATE',researcherDateFieldValue:taipeiDate,dateBindingSha256:sameDateBinding.sha256}:{})};"]
 ],
 Study1FormalConsent:[
  [" // Researcher's signature is already present in the immutable source PDF.\n // Only the approved participant rectangle is stamped after enrollment.",
   " // Researcher's ink is preserved from the immutable source. Participant\n // ink and both user-approved date fields are added at agreement completion."]
 ],
 AdminSandbox:[
  [" const stamped=await study1PdfComposeSigned_(original,pngBytes,layout,\n  {experiment:'E1',sha256:prior.documentSha,version:prior.documentVersion},new Date());",
   " const completionTime=new Date();\n const sameDateBinding=study1PdfSameDateRead_(doc,layout);\n const stamped=await study1PdfComposeSigned_(original,pngBytes,layout,\n  {experiment:'E1',sha256:prior.documentSha,version:prior.documentVersion},completionTime,sameDateBinding);"],
  ["   study1PdfLayoutRead_('E1',current);\n   study1BindingRecheck_(x.binding,current,bindingAdapter,new Date().toISOString(),heldLock);",
   "   const currentLayout=study1PdfLayoutRead_('E1',current);\n   if(study1PdfSameDateRead_(current,currentLayout).sha256!==stamped.dateBindingSha256)throw Error('E1_SAME_DATE_POLICY_CHANGED');\n   study1BindingRecheck_(x.binding,current,bindingAdapter,new Date().toISOString(),heldLock);"],
  ["   // Researcher ink/date already exist INSIDE the exact original private PDF.\n   // No second handwritten researcher signature or after-the-fact attestation.",
   "   // Preserve the original researcher's ink. Both printed dates use the\n   // participant completion date; this is not a new researcher signing act."],
  ["    researcherSignedPdfSha256:savedPdf.sha,recordedAtUtc:new Date().toISOString()});",
   "    researcherSignedPdfSha256:savedPdf.sha,recordedAtUtc:new Date().toISOString(),\n    researcherDatePolicy:stamped.researcherDatePolicy,researcherDateFieldValue:stamped.researcherDateFieldValue,\n    participantCompletionAtUtc:stamped.serverSignedAt,dateBindingSha256:stamped.dateBindingSha256});"]
 ]
};
function once(source,from,to){if(source.split(from).length!==2)throw Error('V2_SAME_DATE_SOURCE_ANCHOR_CHANGED');return source.replace(from,()=>to);}
function transform(files,reverse){return files.map(file=>{
 let source=file.source;
 if(reverse&&file.name==='Study1PdfStampCore'){
  if(!source.endsWith(runtime))throw Error('V2_SAME_DATE_RUNTIME_CHANGED');source=source.slice(0,-runtime.length);
 }
 for(const [before,after] of edits[file.name]||[])source=once(source,reverse?after:before,reverse?before:after);
 if(!reverse&&file.name==='Study1PdfStampCore')source+=runtime;
 return {...file,source};
});}
module.exports={apply:files=>transform(files,false),restore:files=>transform(files,true)};
