'use strict';
// Regression guard: loss of the browser-only E1 consent capability must fail closed.
// These assertions are intentionally source-level: no GAS, Sheets or email access.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../gas/Study1Visitor.html'),'utf8');
function body(name,next){
 const start=html.indexOf('function '+name+'(');
 assert.ok(start>=0,'missing '+name);
 const end=html.indexOf('\n'+next,start);
 assert.ok(end>start,'missing boundary after '+name);
 return html.slice(start,end);
}
test('lost browser capability is never persisted or reconstructed from identity',()=>{
 assert.doesNotMatch(html,/\b(?:localStorage|sessionStorage|indexedDB)\b/);
 assert.doesNotMatch(html,/\b(?:document\.cookie|window\.name)\b/);
 const status=body('formalConsentStatus_','async function formalVerifySigned_');
 const copy=body('formalConsentCopy_','function formalConsentAdopt_');
 for(const source of [status,copy]){
  assert.match(source,/if\(!formalConsent\|\|state\.busy\)return/);
  assert.match(source,/const token=formalConsent\.token/);
  assert.match(source,/formalConsent\.token!==token/);
 }
 assert.match(status,/rpc\('study1FormalConsentStatus',token,/);
 assert.match(copy,/rpc\('study1EConsentSignedPdfCopy',token,/);
});
test('reset destroys signed-PDF capability and revokes stale download links',()=>{
 const reset=body('formalConsentReset_','async function formalVerifyPdf_');
 assert.match(reset,/formalRevoke_\(formalSignedUrl\)/);
 assert.match(reset,/formalConsent=null/);
 assert.match(reset,/formalReceiptVerified=null/);
 assert.match(reset,/formalReceiptEpoch\+\+/);
 assert.match(reset,/formalDonePdfDownload/);
 assert.match(reset,/removeAttribute\('href'\)/);
});
test('verified signed PDF is not conflated with a confirmed reservation',()=>{
 const copy=body('formalConsentCopy_','function formalConsentAdopt_');
 assert.match(copy,/await formalVerifySigned_\(copy\)/);
 assert.match(copy,/formalReceiptVerified=\{token,sha:result\.sha/);
 assert.match(copy,/formalReceiptRefresh_\(\)/);
 assert.match(copy,/原預約是否成立，仍須獨立核對Reservations/);
});
