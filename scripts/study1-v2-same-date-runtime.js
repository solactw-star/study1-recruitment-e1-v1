/** Trusted configuration for dates in an existing researcher-presigned PDF.
 * The printed researcher's date is the participant's agreement-completion
 * date by explicit user decision; it is NOT a new researcher signing event. */
function study1PdfSameDateValidate_(value,expected,layout){
 const keys='documentSha,experiment,fontSize,pageCount,participant,policy,researcher,schemaVersion,version';
 if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys||
    value.schemaVersion!==1||value.policy!=='MATCH_PARTICIPANT_COMPLETION_DATE'||
    value.experiment!=='E1'||expected.experiment!=='E1'||
    value.documentSha!==expected.sha256||value.version!==expected.version||
    value.pageCount!==layout.pageCount||!Number.isFinite(value.fontSize)||
    value.fontSize<8||value.fontSize>16)
  throw Error('E1_SAME_DATE_POLICY_INVALID');
 for(const role of ['researcher','participant']){
  const box=value[role];
  if(!box||Array.isArray(box)||Object.keys(box).sort().join(',')!=='day,month,pageHeight,pageIndex,pageWidth,year'||
     !Number.isInteger(box.pageIndex)||box.pageIndex<0||box.pageIndex>=value.pageCount||
     !Number.isFinite(box.pageWidth)||box.pageWidth<180||box.pageWidth>1500||
     !Number.isFinite(box.pageHeight)||box.pageHeight<180||box.pageHeight>2000)
   throw Error('E1_SAME_DATE_PAGE_INVALID');
  for(const part of ['year','month','day']){
   const pos=box[part],width=part==='year'?28:16;
   if(!pos||Object.keys(pos).sort().join(',')!=='x,y'||
      !Number.isFinite(pos.x)||!Number.isFinite(pos.y)||pos.x<0||pos.y<0||
      pos.x+width>box.pageWidth||pos.y+value.fontSize>box.pageHeight)
    throw Error('E1_SAME_DATE_POSITION_INVALID');
  }
 }
 if(value.participant.pageIndex!==layout.pageIndex||
    value.researcher.pageIndex===value.participant.pageIndex||
    Math.abs(value.participant.pageWidth-layout.pageWidth)>1.5||
    Math.abs(value.participant.pageHeight-layout.pageHeight)>1.5)
  throw Error('E1_SAME_DATE_LAYOUT_MISMATCH');
 // Reserve disjoint boxes; preserve the source's printed 年/月/日 labels.
 const a=value.participant,b=layout.signature;
 for(const part of ['year','month','day']){
  const p=a[part],w=part==='year'?28:16;
  if(p.x<b.x+b.width&&p.x+w>b.x&&p.y<b.y+b.height&&p.y+value.fontSize>b.y)
   throw Error('E1_SAME_DATE_SIGNATURE_OVERLAP');
 }
 return value;
}
function study1PdfSameDateRead_(document,layout){
 const raw=PropertiesService.getScriptProperties().getProperty('STUDY1_E1_SAME_DATE_POLICY_V1');
 if(typeof raw!=='string'||raw.length<100||raw.length>3500)throw Error('E1_SAME_DATE_POLICY_NOT_CONFIGURED');
 let value;try{value=JSON.parse(raw);}catch(_){throw Error('E1_SAME_DATE_POLICY_INVALID');}
 study1PdfSameDateValidate_(value,document,layout);
 return {value,sha256:study1PdfDigest_(Utilities.newBlob(raw).getBytes())};
}
