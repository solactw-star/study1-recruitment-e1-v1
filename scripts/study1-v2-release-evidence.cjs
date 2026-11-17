'use strict';
/** Existing historical source evidence and semantic inventory normalization. Pure evidence processing; no network, OAuth, or release authorization. */
const core=require('./study1-v2-release-source.cjs');
const crypto=require('node:crypto');
const SID=core.SID;
const HISTORICAL_TARGET='73dea801154abbe847863a07df2e623fc1d68622a4442f006d1be7473dd5a0f7';
function reviewedPrivateTarget(){return core.reviewedPrivateTarget();}
// Immutable anonymous v4, verified by GET-only Run 43795872212 on 2026-11-16.
// Historical provenance must not depend on the current mutable checkout.
const VERIFIED_VERSION4_SHA='ab5906a7e733cd2ea3520bc01e4ed137e3bd87c04f496da1ad06bf0c961c56c3';
// Verified historical version 2, read back from release Run 43706978095.
const VERIFIED_VERSION2_SHA='b33dd95f092e562ab7948645fcf997e2545b9ad9fefe1e6f9bc4cffd9d4d0da3';
const assert=(ok,message)=>{if(!ok)throw Error('V2_PRIVATE_BLOCKED: '+message)};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');

function sourceProof(obj,allowAnonymous=false){
 assert(obj?.scriptId===SID,'remote Script ID mismatch');
 const remote=core.verifyRemote(obj);
 let access='UNKNOWN',known=false;
 try{
  const manifest=core.closedManifest(obj.files,allowAnonymous);core.closedWebsite(obj.files);
  access=manifest.webapp.access;
  known=(access==='MYSELF'&&([HISTORICAL_TARGET,VERIFIED_VERSION2_SHA].includes(remote.sha)||remote.sha===reviewedPrivateTarget()))||
   (access==='ANYONE'&&((allowAnonymous===true&&remote.sha==='3449d43bee67d450a1934cd24870b581c487bd84f854511a467e270bccf62158')||remote.sha===core.digest(core.localSources())))||
   (allowAnonymous===true&&access==='ANYONE_ANONYMOUS'&&(remote.sha===VERIFIED_VERSION4_SHA||remote.sha===core.digest(core.anonymousReadOnlyCandidate())));
 }catch(_){}
 return {sha:remote.sha,count:remote.count,access,known};
}
function normalizedVersions(v){
 assert(Array.isArray(v),'versions must be an array');
 const seen=new Set();
 return v.map(x=>{
  assert(x?.scriptId===SID&&Number.isSafeInteger(x.versionNumber)&&
   x.versionNumber>0&&!seen.has(x.versionNumber),'invalid V2 version entry');
  seen.add(x.versionNumber);
  return {scriptId:SID,version:x.versionNumber,
   created:String(x.createTime||''),description:String(x.description||'')};
 }).sort((a,b)=>a.version-b.version);
}
// Google creates exactly one HEAD (development) deployment. The REST
// DeploymentConfig.versionNumber is an integer when versioned; a HEAD
// deployment can omit it or return zero, independent of deploymentId.
function deploymentVersionShape(v){
 if(v===undefined||v===0)return {kind:'HEAD',version:null};
 assert(Number.isSafeInteger(v)&&v>0,'unexpected deployment version shape');
 return {kind:'VERSIONED',version:v};
}
// Safe public CI diagnostic: never log deployment IDs, web URLs or secrets.
function redactedDeploymentShapes(deps){
 assert(Array.isArray(deps),'deployment inventory is not an array');
 return deps.map((d,index)=>{
  const v=d?.deploymentConfig?.versionNumber;
  return {index:index+1,idIsLiteralHEAD:d?.deploymentId==='HEAD',
   versionShape:v===undefined?'omitted':v===0?'zero':
    Number.isSafeInteger(v)&&v>0?'positive_integer':'invalid',
   manifestPresent:typeof d?.deploymentConfig?.manifestFileName==='string',
   webAccess:(Array.isArray(d?.entryPoints)?d.entryPoints:[])
    .filter(e=>e?.webApp).map(e=>({
     access:e.webApp.entryPointConfig?.access??e.webApp.access??'omitted',
     executeAs:e.webApp.entryPointConfig?.executeAs??e.webApp.executeAs??'omitted'
    }))};
 });
}
function normalizedDeployments(d,allowAnonymous=false){
 assert(Array.isArray(d),'deployments must be an array');
 const seen=new Set();
 let headCount=0;
 return d.map(x=>{
  const id=x?.deploymentId, config=x?.deploymentConfig;
  assert(typeof id==='string'&&id.length>0&&!seen.has(id),
   'duplicate/missing deployment ID');
  seen.add(id);
  assert(config?.scriptId===SID,'deployment belongs to a foreign Script ID');
  const {kind,version}=deploymentVersionShape(config.versionNumber);
  if(kind==='HEAD'){
   headCount++;
   assert(headCount<=1,'multiple unversioned/HEAD deployments');
  }
  assert(config.manifestFileName==='appsscript' ||
   (kind==='HEAD'&&
    (config.manifestFileName===undefined||config.manifestFileName==='')),
   'deployment manifest file is not appsscript');
  const points=(x.entryPoints||[]).map(e=>({
   type:e.entryPointType||'',
   web:e.webApp?{
    access:e.webApp.entryPointConfig?.access??e.webApp.access??null,
    executeAs:e.webApp.entryPointConfig?.executeAs??e.webApp.executeAs??null,
    url:e.webApp.url||''
   }:null
  }));
  for(const e of points){
   if(e.web){
    // API can omit resolved access metadata; immutable version manifest
    // will be checked separately. Explicit public access is never tolerated.
    assert(e.web.access===null||['MYSELF','ANYONE'].includes(e.web.access)||(allowAnonymous===true&&e.web.access==='ANYONE_ANONYMOUS'),
     'existing web app publicly accessible');
    assert(e.web.executeAs===null||e.web.executeAs==='USER_DEPLOYING',
     'unexpected existing web app execution identity');
   }
  }
  return {id,kind,version,manifest:config.manifestFileName||'',
   description:String(config.description||''), // raw updateTime is preserved in the encrypted backup, not the semantic digest
   points:points.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};
 }).sort((a,b)=>a.id.localeCompare(b.id,'en'));
}
function fingerprint(versions,deps,headSha='',proofs=[],allowAnonymous=false){
 return sha(JSON.stringify({versions:normalizedVersions(versions),
  deployments:normalizedDeployments(deps,allowAnonymous),headSha,proofs}));
}
// Evidence only: do not infer deployed ACL from the source manifest, or
// infer permission when the API omits resolved entry point metadata.
// Neither the authorization checks nor the existing inventory fingerprint change.
function readOnlyAclEvidence(state,allowAnonymous=false){
 return normalizedDeployments(state.deps,allowAnonymous).map(d=>{
  const proof=d.kind==='HEAD'?state.headProof:state.proofs.find(p=>p.version===d.version);
  return {kind:d.kind,version:d.version,manifestAccess:proof?.access||'UNKNOWN',
   webEntryPoints:d.points.filter(p=>p.web).map(p=>({
    access:p.web.access??'omitted',executeAs:p.web.executeAs??'omitted'
   }))};
 });
}

module.exports={HISTORICAL_TARGET,VERIFIED_VERSION2_SHA,VERIFIED_VERSION4_SHA,sourceProof,normalizedVersions,normalizedDeployments,deploymentVersionShape,redactedDeploymentShapes,fingerprint,readOnlyAclEvidence};
