/**
 * Study1 §70-S.21: participant E1 FORMAL consent-last bridge.
 * This is not a REC approval or a release switch. Every prospective intake,
 * slot, signing, PDF layout and staff explanation gate remains fail-closed.
 * E2 is never accepted. No original Sheet or REC contents are edited here.
 */

/** Check TWO independent, effective PI-reviewed sources with exact SHA.
 * A property switch alone is never evidence that remote e-consent is approved.
 */
function study1FormalConsentRecScope_(){
 const p=PropertiesService.getScriptProperties();
 if(p.getProperty('STUDY1_E1_REMOTE_CONSENT_REC_SCOPE_VERIFIED')!=='true')
  throw Error('REMOTE_CONSENT_REC_SCOPE_NOT_VERIFIED');
 const raw=p.getProperty('STUDY1_E1_REMOTE_CONSENT_POLICY_V1');
 if(typeof raw!=='string'||raw.length<80||raw.length>4500)
  throw Error('REMOTE_CONSENT_POLICY_NOT_CONFIGURED');
 let info;
 try{info=JSON.parse(raw);}catch(_){throw Error('REMOTE_CONSENT_POLICY_INVALID');}
 if(!info||Array.isArray(info)||typeof info!=='object'||
    Object.keys(info).sort().join(',')!==
     'approvalDocumentId,approvalDocumentSha256,approved,approvedAtUtc,consentDocumentId,consentDocumentSha256,experiment,reviewedBy,scope,validThroughUtc'||
    info.approved!==true||info.experiment!=='E1'||
    info.scope!=='202604EM033_E1_REMOTE_PDF_SIGN_AND_COPY'||
    typeof info.reviewedBy!=='string'||info.reviewedBy.trim().length<5||
    info.approvalDocumentId===info.consentDocumentId||
    info.approvalDocumentSha256===info.consentDocumentSha256)
  throw Error('REMOTE_CONSENT_POLICY_INVALID');
 const now=Date.now(),at=study1BindingUtc_(info.approvedAtUtc),
    until=study1BindingUtc_(info.validThroughUtc);
 if(at>now||until<=now||until<=at)
  throw Error('REMOTE_CONSENT_POLICY_NOT_EFFECTIVE');
 // Check source bytes and ACLs, not a filename, modification time or boolean.
 for(const [id,sha] of [[info.approvalDocumentId,info.approvalDocumentSha256],
   [info.consentDocumentId,info.consentDocumentSha256]]){
  study1TrustApprovedFile_(id,sha);
  const f=DriveApp.getFileById(id);
  if(!f||f.getSharingAccess()!==DriveApp.Access.PRIVATE)
   throw Error('REMOTE_CONSENT_REC_SOURCE_ACL_NOT_PRIVATE');
 }
 return info;
}
function study1FormalConsentGate_(){
 study1ParticipantGate_();
 const p=PropertiesService.getScriptProperties();
 for(const k of ['STUDY1_ECONSENT_PROVIDER_VERIFIED',
  'STUDY1_ECONSENT_PDF_PROVIDER_VERIFIED',
  'STUDY1_ECONSENT_WIZARD_LINK_VERIFIED',
  'STUDY1_ECONSENT_LIVE_SHEETS_APPROVED',
  'STUDY1_E1_SELF_REPORT_OTP_SOURCE_VERIFIED',
  'STUDY1_E1_SLOT_REGISTRY_APPROVED']){
  if(p.getProperty(k)!=='true')throw Error('FORMAL_PDF_GATE_NOT_READY:'+k);
 }
 study1FormalConsentRecScope_();
 return true;
}

/** Explicit PI-reviewed post-sign access window. Never silently extend a
 * short-lived HELD booking token into an indefinite bearer credential.
 */
function study1FormalConsentCopyExpiry_(){
 const props=PropertiesService.getScriptProperties();
 if(props.getProperty('STUDY1_E1_PDF_COPY_ACCESS_HOURS_APPROVED')!=='true')
  throw Error('E1_PDF_COPY_WINDOW_NOT_APPROVED');
 const raw=props.getProperty('STUDY1_E1_PDF_COPY_ACCESS_HOURS');
 if(typeof raw!=='string'||!/^[0-9]{1,3}$/.test(raw))
  throw Error('E1_PDF_COPY_WINDOW_INVALID');
 const hours=Number(raw);
 if(!Number.isSafeInteger(hours)||hours<1||hours>720)
  throw Error('E1_PDF_COPY_WINDOW_INVALID');
 return Date.now()+hours*3600000;
}

function study1FormalConsentDocument_(ctx,reservationId){
 if(!ctx||!ctx.lock||ctx.lock.hasLock()!==true||!ctx.identity||
    ctx.identity.experiment!=='E1')
  throw Error('FORMAL_CONSENT_SHARED_LOCK_REQUIRED');
 study1BindingId_(reservationId);
 const matches=ctx.snapshot.reservations.rows.filter(r=>r[0]===reservationId);
 if(matches.length!==1)throw Error('FORMAL_CONSENT_RESERVATION_NOT_UNIQUE');
 const r=matches[0];
 if(r[1]!==ctx.identity.applicantId||r[3]!=='HELD'||
    study1BindingUtc_(r[4])<=Date.now())
  throw Error('FORMAL_CONSENT_NO_CURRENT_PERSONAL_HOLD');
 study1FormalSlot_(ctx,r[2]);
 const scope=study1FormalConsentRecScope_();
 const document=study1EConsentReadyDocument_('E1');
 if(document.id!==scope.consentDocumentId||
    document.sha256!==scope.consentDocumentSha256||
    document.experiment!=='E1')
  throw Error('FORMAL_CONSENT_REC_PDF_VERSION_MISMATCH');
 if(document.researcherPresigned!==true)
  throw Error('E1_RESEARCHER_PRESIGNED_PDF_NOT_UPLOADED');
 // Researcher's signature is already present in the immutable source PDF.
 // Only the approved participant rectangle is stamped after enrollment.
 study1PdfLayoutRead_('E1',document);
 return {r,document};
}
/** The public caller supplies only a consumed Email-OTP proof and a personal
 * original reservation ID. Everything else is rederived from original rows.
 * This creates a one-use HMAC-bound invitation, not consent or acceptance.
 */

/** Deterministic, server-HMAC-backed bearer for one validated E1 issue nonce.
 * The bearer is reconstructible from the original proof/HELD/doc plus the
 * high-entropy client requestId, but never stored in plaintext.
 */
function study1FormalConsentIssueToken_(ctx,r,doc,requestId){
 study1FormalKey_(requestId);
 const base=['FORMAL_E1_PRESIGNED_ISSUE_V1',ctx.identity.applicantId,
  ctx.identity.screeningId,ctx.identity.challengeId,r[0],
  doc.sha256,doc.version,requestId];
 const a=study1BindingHmac_(base.concat(['A']));
 const b=study1BindingHmac_(base.concat(['B']));
 const uuid=x=>x.slice(0,8)+'-'+x.slice(8,12)+'-4'+x.slice(13,16)+
  '-8'+x.slice(17,20)+'-'+x.slice(20,32);
 return uuid(a)+'-'+uuid(b);
}
/** Only read the same original private consent registry; no new issue or send.
 * Invalid original proof, HELD or document remain fail-closed.
 */
function study1FormalConsentIssueState(input){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 if(!input||Array.isArray(input)||typeof input!=='object'||
    Object.keys(input).sort().join(',')!=='emailProof,requestId,reservationId')
  throw Error('FORMAL_CONSENT_ISSUE_OUTCOME_REQUEST_INVALID');
 study1FormalKey_(input.requestId);study1BindingId_(input.reservationId);
 study1FormalConsentGate_();
 return study1FormalWithLock_(input.emailProof,ctx=>{
  study1FormalConsentGate_();
  const {r,document}=study1FormalConsentDocument_(ctx,input.reservationId);
  const token=study1FormalConsentIssueToken_(ctx,r,document,input.requestId);
  const matches=study1EConsentRegistry_().records.filter(x=>x.binding&&
    (x.binding.applicantId===ctx.identity.applicantId||
     x.binding.reservationId===r[0]));
  if(!matches.length)return {found:false,status:'UNKNOWN'};
  if(matches.length!==1)throw Error('FORMAL_CONSENT_ISSUE_OUTCOME_NOT_UNIQUE');
  const entry=matches[0],b=entry.binding;
  if(entry.channel!=='FORMAL_E1'||entry.experiment!=='E1'||
     entry.researcherPresigned!==true||entry.state!=='ISSUED'||
     entry.expires<=Date.now()||entry.documentSha!==document.sha256||
     entry.documentVersion!==document.version||
     b.applicantId!==ctx.identity.applicantId||
     b.screeningId!==ctx.identity.screeningId||
     b.challengeId!==ctx.identity.challengeId||
     b.reservationId!==r[0]||b.slotId!==r[2]||
     entry.tokenHash!==study1EConsentHash_(token))
   return {found:false,status:'SOURCE_MISMATCH'};
  if(ctx.lock.hasLock()!==true)throw Error('FORMAL_CONSENT_ISSUE_OUTCOME_LOCK_LOST');
  return {found:true,status:'ISSUED',token,experiment:'E1',
   reservationId:r[0],documentVersion:document.version,
   documentSha256:document.sha256,researcherPresigned:true,
   recovery:'ORIGINAL_REGISTRY_READ_ONLY'};
 });
}

function study1FormalConsentBegin(input){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 if(!input||Array.isArray(input)||typeof input!=='object'||
    !['emailProof,reservationId','emailProof,requestId,reservationId'].includes(Object.keys(input).sort().join(',')))
  throw Error('FORMAL_CONSENT_REQUEST_INVALID');
 if(Object.prototype.hasOwnProperty.call(input,'requestId'))
  study1FormalKey_(input.requestId);
 study1FormalConsentGate_();
 return study1FormalWithLock_(input.emailProof,ctx=>{
  study1FormalConsentGate_();
  const {r,document}=study1FormalConsentDocument_(ctx,input.reservationId);
  const index={applicantId:ctx.identity.applicantId,
   screeningId:ctx.identity.screeningId,
   challengeId:ctx.identity.challengeId,experiment:'E1',
   reservationId:r[0],slotId:r[2],
   documentSha:document.sha256,documentVersion:document.version};
  const adapter=study1EConsentBindingAdapter_('PUBLIC_E1');
  const binding=study1BindingVerify_(
   adapter.readTrustedSnapshot(index,ctx.lock),index,document,ctx.nowUtc);
  if(binding.identityEvidenceSha!==ctx.identity.evidenceSha256)
   throw Error('FORMAL_CONSENT_EMAIL_OTP_AUTHORITY_CHANGED');
  binding.digest=study1BindingDigest_({...binding,digest:''});
  const registry=study1EConsentRegistry_();
  const stable=typeof input.requestId==='string';
  const token=stable?
   study1FormalConsentIssueToken_(ctx,r,document,input.requestId):
   Utilities.getUuid()+'-'+Utilities.getUuid();
  const prior=registry.records.filter(x=>x.binding&&
   (x.binding.applicantId===binding.applicantId||
    x.binding.reservationId===binding.reservationId));
  if(prior.length){
   if(stable&&prior.length===1){
    const old=prior[0],v=old.binding;
    if(old.channel==='FORMAL_E1'&&old.experiment==='E1'&&
       old.researcherPresigned===true&&old.state==='ISSUED'&&
       old.expires>Date.now()&&old.documentSha===document.sha256&&
       old.documentVersion===document.version&&
       v.applicantId===binding.applicantId&&
       v.screeningId===binding.screeningId&&
       v.challengeId===binding.challengeId&&
       v.reservationId===r[0]&&v.slotId===r[2]&&
       old.tokenHash===study1EConsentHash_(token))
     return {state:'ISSUED',experiment:'E1',reservationId:r[0],
      documentVersion:document.version,documentSha256:document.sha256,
      token,expiresAtUtc:new Date(old.expires).toISOString(),
      researcherPresigned:true,needsResearcherExplanation:false,
      signatureAccepted:false,readOnlyReplay:true};
   }
   throw Error('FORMAL_CONSENT_ALREADY_ISSUED');
  }
  if(registry.records.length>=STUDY1_ECONSENT_MAX_RECORDS_)
   throw Error('FORMAL_CONSENT_REGISTRY_FULL');
  const expires=Math.min(Date.now()+86400000,Date.parse(binding.holdUntilUtc));
  if(expires<=Date.now())throw Error('FORMAL_CONSENT_HOLD_EXPIRED');
  const entry={id:Utilities.getUuid(),tokenHash:study1EConsentHash_(token),
   experiment:'E1',documentSha:document.sha256,
   documentVersion:document.version,expires,state:'ISSUED',
   binding,channel:'FORMAL_E1',researcherPresigned:true,
   explanation:null,signature:null,
   confirmation:null,withdrawal:null};
  if(registry.records.some(x=>x.id===entry.id||x.tokenHash===entry.tokenHash))
   throw Error('FORMAL_CONSENT_TOKEN_COLLISION');
  study1FormalConsentGate_();
  if(ctx.lock.hasLock()!==true)throw Error('FORMAL_CONSENT_LOCK_LOST');
  study1EConsentWrite_(registry,{...registry,revision:registry.revision+1,
   records:registry.records.concat([entry])});
  return {state:'ISSUED',experiment:'E1',reservationId:r[0],
   documentVersion:document.version,documentSha256:document.sha256,
   token,expiresAtUtc:new Date(expires).toISOString(),
   researcherPresigned:true,needsResearcherExplanation:false,
   signatureAccepted:false};
 });
}

/** Token-bound full ORIGINAL PDF, separate from old CLOSED public document RPC. */
function study1FormalConsentOriginalPdf(token){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 study1FormalConsentGate_();
 const entry=study1EConsentEntry_(token,study1EConsentRegistry_());
 if(entry.channel!=='FORMAL_E1'||entry.experiment!=='E1'||!entry.binding||
    entry.state!=='ISSUED')
  throw Error('FORMAL_ORIGINAL_PDF_NOT_AUTHORIZED');
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(10000)!==true)throw Error('FORMAL_ORIGINAL_PDF_LOCK_BUSY');
 try{
  if(lock.hasLock()!==true)throw Error('FORMAL_ORIGINAL_PDF_LOCK_LOST');
  study1FormalConsentGate_();
  const latest=study1EConsentEntry_(token,study1EConsentRegistry_());
  if(latest.id!==entry.id||!latest.binding||
     latest.binding.digest!==entry.binding.digest||
     latest.state!=='ISSUED')
   throw Error('FORMAL_ORIGINAL_PDF_SESSION_CHANGED');
  const doc=study1EConsentReadyDocument_('E1'),
   policy=study1FormalConsentRecScope_();
  if(doc.id!==policy.consentDocumentId||
     doc.sha256!==policy.consentDocumentSha256||
     doc.sha256!==entry.documentSha||
     doc.version!==entry.documentVersion)
   throw Error('FORMAL_ORIGINAL_PDF_REC_VERSION_CHANGED');
  if(doc.researcherPresigned!==true||latest.researcherPresigned!==true)
   throw Error('FORMAL_RESEARCHER_PRESIGNED_PDF_NOT_VERIFIED');
  study1PdfLayoutRead_('E1',doc);
  const adapter=study1EConsentBindingAdapter_('PUBLIC_E1');
  study1BindingRecheck_(latest.binding,doc,adapter,
   new Date().toISOString(),lock);
  const bytes=study1ConsentDocumentBytes_(doc);
  if(lock.hasLock()!==true)throw Error('FORMAL_ORIGINAL_PDF_LOCK_LOST');
  return {available:true,experiment:'E1',title:doc.title,version:doc.version,
   sha256:doc.sha256,bytes:bytes.length,mime:'application/pdf',
   base64:Utilities.base64Encode(bytes)};
 }finally{lock.releaseLock();}
}

/** Server-side status exposes no name, email, individual screening answers,
 * raw signature or document bytes; participant needs possession of the token.
 */
function study1FormalConsentStatus(token){if(typeof study1V2PublicRpcDeny_==='function')study1V2PublicRpcDeny_();
 const entry=study1EConsentEntry_(token,study1EConsentRegistry_());
 // A confirmed participant must still obtain their existing signed copy or
 // submit withdrawal if intake is closed later. Bearer TTL and private SHA
 // remain enforced; unconfirmed invitations still need every live gate.
 if(!['CONFIRMED','WITHDRAWN'].includes(entry.state))study1FormalConsentGate_();
 if(entry.channel!=='FORMAL_E1'||!entry.binding||
    entry.experiment!=='E1'||entry.researcherPresigned!==true)
  throw Error('FORMAL_CONSENT_SESSION_NOT_BOUND');
 const dualConfirmed=['CONFIRMED','WITHDRAWN'].includes(entry.state)&&
  !!entry.signedPdf&&!!entry.participantSignedPdf&&!!entry.confirmation;
 return {experiment:'E1',state:entry.state,version:entry.documentVersion,
  sourceSha256:entry.documentSha,expiresAtUtc:new Date(entry.expires).toISOString(),
  researcherPreSigned:true,
  researcherExplanationCompleted:false,
  signatureAccepted:!!entry.signature,
  staffConfirmed:dualConfirmed,
  copyAvailable:dualConfirmed,
  withdrawn:entry.state==='WITHDRAWN',
  dataDispositionState:entry.state==='WITHDRAWN'?
   (entry.disposition?'OWNER_EVIDENCE_RECORDED_PI_REVIEW':'PENDING_RESEARCH_TEAM_ACTION'):null,
  explanation:null};
}
