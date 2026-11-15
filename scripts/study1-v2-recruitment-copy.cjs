'use strict';
/** Original Index only. GitHub branch/PR/history are the persistent document
 * version store. No GAS/Sheets/Properties API, no alternative published copy.
 */
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const REPO='solactw-star/study1-recruitment-e1-v1',FILE='gas/Index.html';
const SAVE='I_SAVE_STUDY1_COPY_DRAFT',PUBLISH='I_PUBLISH_APPROVED_STUDY1_COPY_TO_MAIN';
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const sha=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const fail=m=>{throw Error('B11_COPY_BLOCKED: '+m);};
const require_=(v,m)=>{if(!v)fail(m);};
function parseIndex(html){
 const hero=[...html.matchAll(/<section id="home" class="hero">([\s\S]*?)<div class="actions">/g)];
 require_(hero.length===1,'original homepage hero mismatch');
 const parts=hero[0][0].match(/<h1>([\s\S]*?)<\/h1><p>([\s\S]*?)<\/p>/);
 require_(parts,'original homepage title/intro mismatch');
 const plain=v=>v.replace(/<br\s*\/?\s*>/gi,'').replace(/<\/?span>/g,'').trim().replace(/&amp;/g,'&');
 const title=plain(parts[1]),intro=plain(parts[2]);
 validateText(title,intro);
 return {title,intro,start:hero[0].index+parts.index,segment:parts[0],rawTitle:parts[1],rawIntro:parts[2]};
}
function validateText(title,intro){
 require_(typeof title==='string'&&title===title.trim()&&title.length>0&&title.length<=120&&
   !/[<>\x00-\x1f]/.test(title)&&typeof intro==='string'&&intro===intro.trim()&&intro.length>0&&
   intro.length<=1000&&!/[<>\x00-\x08\x0b\x0c\x0d-\x1f]/.test(intro)&&!/<\?|\?>/.test(title+intro),
  'only bounded plain title and intro are editable');
}
function patchIndex(html,title,intro){
 validateText(title,intro);
 const p=parseIndex(html),escape=v=>v.replace(/&/g,'&amp;');
 require_(title!==p.title||intro!==p.intro,'no actual copy changes');
 const section='<h1>'+(title===p.title?p.rawTitle:escape(title))+'</h1><p>'+
   (intro===p.intro?p.rawIntro:escape(intro))+'</p>';
 const next=html.slice(0,p.start)+section+html.slice(p.start+p.segment.length);
 const n=parseIndex(next);
 require_(n.title===title&&n.intro===intro,'copy readback mismatch');
 return next;
}
function draftCandidate(html,draft){
 require_(draft&&Object.keys(draft).sort().join(',')==='approved,baseRevision,baseSha256,intro,kind,open,published,source,title'&&
   draft.kind==='RECRUITMENT_COPY_REVIEW_DRAFT'&&draft.source===FILE&&hex(draft.baseRevision)&&hex(draft.baseSha256)&&
   draft.approved===false&&draft.open===false&&draft.published===false,'invalid draft envelope');
 require_(hash(html)===draft.baseSha256,'stale deployed homepage; compare latest original source, do not overwrite');
 return patchIndex(html,draft.title,draft.intro);
}
function verifyCandidate(base,candidate){
 const c=parseIndex(candidate);
 require_(patchIndex(base,c.title,c.intro)===candidate,'changes outside original editable copy');
 return {title:c.title,intro:c.intro};
}
function api(route,method='GET',body){
 const args=['api','repos/'+REPO+'/'+route,'--method',method];
 if(body!==undefined)args.push('--input','-');
 return JSON.parse(execFileSync('gh',args,{input:body===undefined?undefined:JSON.stringify(body),
   encoding:'utf8',maxBuffer:4*1024*1024,stdio:['pipe','pipe','pipe']}));
}
function original(api,ref){
 require_(sha(ref),'exact commit SHA required');
 const file=api('contents/'+FILE+'?ref='+ref);
 require_(file&&file.path===FILE&&file.type==='file'&&file.encoding==='base64'&&typeof file.content==='string'&&sha(file.sha),'original Index unavailable');
 return {text:Buffer.from(file.content,'base64').toString('utf8'),blob:file.sha};
}
function mainSha(api){
 const x=api('git/ref/heads/main');require_(x?.ref==='refs/heads/main'&&sha(x.object?.sha),'main unavailable');
 return x.object.sha;
}
function exactBranch(run){
 require_(typeof run==='string'&&/^[0-9]+$/.test(run),'invalid workflow run id');
 return 'b11-copy/'+run;
}
function save(api,input){
 require_(input.confirmation===SAVE,'explicit draft save confirmation required');
 require_(typeof input.draft==='string'&&input.draft.length<=10000,'draft missing or too long');
 const base=mainSha(api),source=original(api,base),next=draftCandidate(source.text,JSON.parse(input.draft));
 const branch=exactBranch(input.runId);
 require_(mainSha(api)===base,'main changed before saving');
 // Non-idempotent operations are attempted once. On failure, inspect refs and
 // contents for this run ID; do not blindly resubmit.
 const created=api('git/refs','POST',{ref:'refs/heads/'+branch,sha:base});
 require_(created?.ref==='refs/heads/'+branch&&created.object?.sha===base,'draft ref not verified');
 const commit=api('contents/'+FILE,'PUT',{message:'docs(b11): save recruitment copy review draft',content:Buffer.from(next,'utf8').toString('base64'),sha:source.blob,branch});
 const head=commit?.commit?.sha;require_(sha(head),'draft commit unknown');
 require_(api('git/ref/heads/'+branch)?.object?.sha===head&&original(api,head).text===next,'draft readback failed');
 const compare='https://github.com/'+REPO+'/compare/main...'+branch+'?expand=1';
 let pull=null;
 // The repository may disallow Actions-created PRs. The persistent branch
 // is already verified; report it even if creation is rejected or unknown.
 try{
  const pr=api('pulls','POST',{title:'B11 招募首頁文案審核',head:branch,base:'main',
    body:'僅 gas/Index.html 標題與介紹。請核對原 REC/PI 文案決策及差異；獨立 Approve review 請附 PI_APPROVAL_REF=核定參照。不得啟用收件或部署。',draft:false});
  if(Number.isSafeInteger(pr?.number)&&pr.head?.sha===head)pull=pr.number;
 }catch(_){}
 return {status:'DRAFT_SAVED',branch,base,head,compare,pull,source:FILE,gasDeployed:false};
}
function approvalReview(api,pr,head,approvalRef){
 const reviews=api('pulls/'+pr.number+'/reviews?per_page=100');
 require_(Array.isArray(reviews)&&reviews.length<100,'review history unavailable or requires manual review');
 const latest=new Map();
 for(const r of reviews){
  if(!r?.user?.login||!Number.isSafeInteger(r.id)||!['APPROVED','CHANGES_REQUESTED','DISMISSED','COMMENTED','PENDING'].includes(r.state))fail('invalid review record');
  if(['COMMENTED','PENDING'].includes(r.state))continue;
  const prior=latest.get(r.user.login.toLowerCase());
  if(!prior||r.id>prior.id)latest.set(r.user.login.toLowerCase(),r);
 }
 require_(![...latest.values()].some(r=>r.state==='CHANGES_REQUESTED'),'unresolved change request');
 const qualifying=[...latest.values()].filter(r=>r.state==='APPROVED'&&r.commit_id===head&&
  r.user.login.toLowerCase()!==pr.user.login.toLowerCase()&&
  ['OWNER','MEMBER','COLLABORATOR'].includes(r.author_association)&&
  String(r.body||'').split(/\r?\n/).some(x=>x.trim()==='PI_APPROVAL_REF='+approvalRef));
 for(const r of qualifying){
  const permission=api('collaborators/'+encodeURIComponent(r.user.login)+'/permission');
  if(['admin','maintain','write'].includes(permission?.permission))return r.user.login;
 }
 fail('independent current-head authorized approval with PI reference required');
}
function publish(api,input){
 require_(input.confirmation===PUBLISH,'explicit source publication confirmation required');
 require_(typeof input.pr==='string'&&/^[1-9]\d{0,8}$/.test(input.pr)&&sha(input.head)&&
  typeof input.approvalRef==='string'&&/^[A-Za-z0-9_.:/-]{8,120}$/.test(input.approvalRef)&&
  typeof input.reason==='string'&&input.reason.trim()===input.reason&&input.reason.length>0&&input.reason.length<=300&&
  !/[\x00-\x1f<>]/.test(input.reason),'publication request invalid');
 const pr=api('pulls/'+input.pr),head=input.head;
 require_(pr?.number===Number(input.pr)&&pr.state==='open'&&pr.draft===false&&pr.merged===false&&pr.user?.login&&
  pr.base?.repo?.full_name===REPO&&pr.base.ref==='main'&&pr.head?.repo?.full_name===REPO&&
  /^b11-copy\/[0-9]+$/.test(pr.head.ref)&&pr.head.sha===head,'not an eligible original draft PR');
 const files=api('pulls/'+input.pr+'/files?per_page=100');
 require_(Array.isArray(files)&&files.length===1&&files[0].filename===FILE&&files[0].status==='modified','PR may change only original Index');
 const base=mainSha(api),source=original(api,base),candidate=original(api,head);
 const commit=api('commits/'+head);
 require_(commit?.sha===head&&commit.parents?.length===1&&sha(commit.parents[0].sha),'draft commit must be a single-parent version');
 require_(original(api,commit.parents[0].sha).text===source.text,'original published copy changed since draft; save new draft');
 verifyCandidate(source.text,candidate.text);
 const reviewer=approvalReview(api,pr,head,input.approvalRef);
 require_(mainSha(api)===base&&api('pulls/'+input.pr)?.head?.sha===head,'main or reviewed draft changed');
 // GitHub exact head precondition; normal repo branch protection applies.
 // One attempt only. Network/uncertain merge must be independently read back.
 const merged=api('pulls/'+input.pr+'/merge','PUT',{sha:head,merge_method:'squash',
  commit_title:'docs(b11): publish approved recruitment copy',
  commit_message:'PI_APPROVAL_REF='+input.approvalRef+'\nReviewer: '+reviewer+'\nReason: '+input.reason});
 require_(merged?.merged===true&&sha(merged.sha),'merge not verified; inspect PR before retry');
 const after=api('pulls/'+input.pr),actual=mainSha(api);
 require_(after?.merged===true&&after.merge_commit_sha===merged.sha&&original(api,actual).text===candidate.text,'publication readback unknown');
 return {status:'MAIN_COPY_PUBLISHED',pr:pr.number,reviewedHead:head,main:actual,
  mergeCommit:merged.sha,reviewer,approvalRef:input.approvalRef,gasDeployed:false};
}
module.exports={REPO,FILE,SAVE,PUBLISH,hash,parseIndex,patchIndex,draftCandidate,verifyCandidate,save,publish};
if(require.main===module){
 try{
  require_(process.env.GITHUB_REPOSITORY===REPO&&process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch','manual original main only');
  const result=process.env.COPY_MODE==='save'?save(api,{runId:process.env.GITHUB_RUN_ID,draft:process.env.COPY_DRAFT,confirmation:process.env.COPY_CONFIRM}):
    process.env.COPY_MODE==='publish'?publish(api,{pr:process.env.COPY_PR,head:process.env.COPY_HEAD,approvalRef:process.env.COPY_APPROVAL,reason:process.env.COPY_REASON,confirmation:process.env.COPY_CONFIRM}):
    fail('invalid mode');
  console.log(JSON.stringify(result));
 }catch(e){console.error(String(e.message).startsWith('B11_COPY_BLOCKED:')?e.message:'B11_COPY_UNKNOWN: inspect original branch/PR/main before another write');process.exitCode=1;}
}
