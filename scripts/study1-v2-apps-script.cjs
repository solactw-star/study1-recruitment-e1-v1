'use strict';

const {auth, script} = require('@googleapis/script');
const {SID, verifyRemote} = require('./study1-v2-release-source.cjs');
const {sameSiteCandidate, requireSameSiteReleaseSource} = require('./study1-v2-uat-original-visitor.cjs');

const deploymentId = 'AKfycbyfbWLyabMOd2y5LpUpyYzVTuoooeK_prZkmfWHhCTARZAFsfl2Ww9OBtlCQjUCkRQ';
const deployedUrl = 'https://script.google.com/macros/s/' + deploymentId + '/exec';
const scopes = ['script.projects', 'script.deployments'].map(scope => 'https://www.googleapis.com/auth/' + scope);

async function request(stage, operation) {
  try {
    return await operation();
  } catch (error) {
    const data = error.response?.data?.error;
    const status = error.response?.status;
    const reason = typeof data === 'string' ? data : data?.status;
    const safeReason = /^[a-z_]{1,60}$/i.test(reason || '') ? reason : 'REQUEST_FAILED';
    throw new Error(stage + ': ' + (Number.isInteger(status) ? 'HTTP ' + status + ' ' : '') + safeReason);
  }
}

async function preflight() {
  const candidateSha = requireSameSiteReleaseSource(sameSiteCandidate());
  let saved;
  try {
    saved = JSON.parse(process.env.V2_GAS_CLASPRC_JSON || '');
  } catch {
    throw new Error('V2_GAS_CLASPRC_JSON_MISSING_OR_INVALID');
  }
  const token = saved.tokens?.default || saved.token;
  const clientId = token?.client_id || saved.oauth2ClientSettings?.clientId;
  const clientSecret = token?.client_secret || saved.oauth2ClientSettings?.clientSecret;
  if (![clientId, clientSecret, token?.refresh_token].every(value => typeof value === 'string' && value)) {
    throw new Error('V2_GAS_CLASPRC_JSON_UNSUPPORTED');
  }

  const oauth = new auth.OAuth2(clientId, clientSecret);
  oauth.setCredentials({refresh_token: token.refresh_token});
  const access = await request('OAuth refresh', () => oauth.getAccessToken());
  const info = await request('OAuth scope lookup', () => oauth.getTokenInfo(access.token));
  const missingScopes = scopes.filter(scope => !info.scopes.includes(scope));
  if (missingScopes.length) throw new Error('V2_REQUIRED_SCOPES_MISSING: ' + missingScopes.join(', '));

  const session = new auth.OAuth2();
  session.setCredentials({access_token: access.token});
  const api = script({version: 'v1', auth: session});
  const target = {scriptId: SID};
  const [head, deployment, versions] = await Promise.all([
    request('projects.getContent', () => api.projects.getContent(target)).then(response => response.data),
    request('projects.deployments.get', () => api.projects.deployments.get({...target, deploymentId})).then(response => response.data),
    request('projects.versions.list', () => api.projects.versions.list(target)).then(response => response.data)
  ]);
  const web = deployment.entryPoints?.find(entry => entry.entryPointType === 'WEB_APP')?.webApp;
  const version = deployment.deploymentConfig?.versionNumber;
  if (deployment.deploymentId !== deploymentId || deployment.deploymentConfig?.scriptId !== SID ||
      web?.url !== deployedUrl || web.entryPointConfig?.access !== 'ANYONE_ANONYMOUS' ||
      web.entryPointConfig?.executeAs !== 'USER_DEPLOYING' || !Number.isInteger(version) || version < 1) {
    throw new Error('V2_ORIGINAL_DEPLOYMENT_MISMATCH');
  }
  const previous = await request('projects.getContent (deployed version)', () =>
    api.projects.getContent({...target, versionNumber: version})).then(response => response.data);
  const previousManifest = JSON.parse(previous.files.find(file => file.name === 'appsscript').source);
  if (previousManifest.webapp?.access !== 'ANYONE_ANONYMOUS' || previousManifest.webapp?.executeAs !== 'USER_DEPLOYING') {
    throw new Error('V2_DEPLOYMENT_VERSION_MANIFEST_MISMATCH');
  }
  console.log(JSON.stringify({
    candidateSha, headSha: verifyRemote(head).sha, deployedVersion: version,
    deployedSourceSha: verifyRemote(previous).sha, versionPageCount: versions.versions?.length ?? 0,
    mutationPerformed: false
  }));
}

if (require.main === module) {
  preflight().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
