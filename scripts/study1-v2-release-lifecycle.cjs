'use strict';
/** V2 release lifecycle, phase 3. Local or existing GET-only inspection.
 * Deploy/rollback intentionally have no implementation, credentials or
 * transport. A check receipt is evidence, never permission to publish.
 */
const core=require('./study1-v2-release-source.cjs');
const {sourceProof,normalizedVersions,normalizedDeployments,fingerprint}=require('./study1-v2-release-evidence.cjs');
const assert=(ok,message)=>{if(!ok)throw Error('V2_PRIVATE_BLOCKED: '+message)};
const sha=core.sha;
async function inventory(api,allowAnonymous=false){
 const [head,versions,deps]=await Promise.all([api.getHead(),api.getVersions(),api.getDeployments()]);
 const hp=sourceProof(head,allowAnonymous),vn=normalizedVersions(versions),dn=normalizedDeployments(deps,allowAnonymous);
 assert(vn.length<=100,'version inventory too large for complete verification');
 const proofs=[];
 for(const v of vn)proofs.push({version:v.version,...sourceProof(await api.getVersionContent(v.version),allowAnonymous)});
 let safe=hp.known;
 for(const dep of dn){
  const proof=dep.version===null?hp:proofs.find(x=>x.version===dep.version);
  assert(proof,'deployment version missing from complete inventory');
  if(!proof.known||dep.points.some(x=>x.web&&x.web.access&&x.web.access!==proof.access&&
   !(dep.kind==='HEAD'&&['ANYONE','ANYONE_ANONYMOUS'].includes(proof.access)&&x.web.access==='MYSELF')))safe=false;
 }
 const fp=fingerprint(versions,deps,hp.sha,proofs,allowAnonymous);
 const stable=sha(JSON.stringify({versions:vn,deployments:dn.filter(x=>x.kind==='VERSIONED'),proofs}));
 return {head,versions,deps,fp,stable,headSha:hp.sha,headProof:hp,proofs,safe,
  versionCount:vn.length,deploymentCount:dn.length,versionedDeployments:dn.filter(d=>d.version!==null).length};
}

function receipt(scope){
 return {mode:'check',scope,releaseAuthorized:false,writeAuthorized:false,
  runtimeVerified:false,mutationPerformed:false,
  stages:{check:'COMPLETED',deploy:'BLOCKED_PENDING_INDEPENDENT_PERMISSION',rollback:'BLOCKED_PENDING_INDEPENDENT_PERMISSION'}};
}
async function check(mode='check',options={}){
 // Reject before touching any client, credentials or candidate.
 if(mode==='deploy'||mode==='rollback')throw Error('V2_RELEASE_STAGE_BLOCKED: '+mode);
 if(mode!=='check')throw Error('V2_RELEASE_UNKNOWN_MODE');
 const {scope='local',api,allowAnonymous=false}=options;
 if(scope==='local'){
  if(api!==undefined)throw Error('V2_RELEASE_LOCAL_CHECK_NO_CLIENT');
  const files=require('./study1-v2-uat-original-visitor.cjs').sameSiteCandidate();
  return {receipt:{...receipt(scope),candidate:{sourceSha256:core.digest(files),fileCount:files.length,
   profile:'SAME_SITE_REVIEW_ONLY'}}};
 }
 if(scope!=='remote'||!api)throw Error('V2_RELEASE_CHECK_SCOPE');
 // Reuse the existing inventory, not a second scan or a new remote client.
 // Only the four methods used by inventory are exposed to this invocation.
 const readOnly={getHead:()=>api.getHead(),getVersions:()=>api.getVersions(),
  getDeployments:()=>api.getDeployments(),getVersionContent:n=>api.getVersionContent(n)};
 const state=await inventory(readOnly,allowAnonymous);
 return {state,receipt:{...receipt(scope),baseline:{sourceSha256:state.headSha,
  access:state.headProof.access,inventorySha256:state.fp,knownSafe:state.safe,
  versionCount:state.versionCount,deploymentCount:state.deploymentCount}}};
}
module.exports={check,inventory};
// CLI deliberately supports local inspection only; no remote client factory.
if(require.main===module){
 const args=process.argv.slice(2);
 if(args.length!==1||args[0]!=='check'){
  console.error('V2_RELEASE_CLI_LOCAL_CHECK_ONLY');process.exitCode=1;
 }else check('check').then(({receipt:r})=>console.log(JSON.stringify(r))).catch(e=>{
  console.error(String(e.message).replace(/https?:\/\/\S+/g,'[URL]'));process.exitCode=1;
 });
}
