'use strict';

const {auth, script} = require('@googleapis/script');
const {SID, fileData, verifyRemote} = require('./study1-v2-release-source.cjs');
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

function originalDeployment(deployment) {
  const web = deployment.entryPoints?.find(entry => entry.entryPointType === 'WEB_APP')?.webApp;
  const version = deployment.deploymentConfig?.versionNumber;
  if (deployment.deploymentId !== deploymentId || deployment.deploymentConfig?.scriptId !== SID ||
      web?.url !== deployedUrl || web.entryPointConfig?.access !== 'ANYONE_ANONYMOUS' ||
      web.entryPointConfig?.executeAs !== 'USER_DEPLOYING' || !Number.isInteger(version) || version < 1) {
    throw new Error('V2_ORIGINAL_DEPLOYMENT_MISMATCH');
  }
  return version;
}

async function release() {
  const files = fileData(sameSiteCandidate());
  const candidateSha = requireSameSiteReleaseSource(files);
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
  const getContent = (versionNumber) => request('projects.getContent', () =>
    api.projects.getContent({...target, versionNumber})).then(response => response.data);
  const getDeployment = () => request('projects.deployments.get', () =>
    api.projects.deployments.get({...target, deploymentId})).then(response => response.data);
  const [head, deployment, versions] = await Promise.all([
    getContent(), getDeployment(),
    request('projects.versions.list', () => api.projects.versions.list(target)).then(response => response.data)
  ]);
  const version = originalDeployment(deployment);
  const previous = await getContent(version);
  const headSha = verifyRemote(head).sha;
  const previousSha = verifyRemote(previous).sha;
  const previousManifest = JSON.parse(previous.files.find(file => file.name === 'appsscript').source);
  if (previousManifest.webapp?.access !== 'ANYONE_ANONYMOUS' || previousManifest.webapp?.executeAs !== 'USER_DEPLOYING') {
    throw new Error('V2_DEPLOYMENT_VERSION_MANIFEST_MISMATCH');
  }
  console.log(JSON.stringify({
    candidateSha, headSha, deployedVersion: version,
    deployedSourceSha: previousSha, versionPageCount: versions.versions?.length ?? 0,
    mutationPerformed: false
  }));
  const mode = process.env.V2_RELEASE_MODE || 'preflight';
  if (mode === 'preflight') return;
  if (mode !== 'publish') throw new Error('V2_UNKNOWN_RELEASE_MODE');
  if (headSha !== process.env.V2_EXPECTED_HEAD_SHA || String(version) !== process.env.V2_EXPECTED_VERSION) {
    throw new Error('V2_BASELINE_CHANGED_OR_MISSING: HEAD or deployment differs from the reviewed preflight');
  }
  if (candidateSha === previousSha && candidateSha === headSha) {
    console.log(JSON.stringify({version, candidateSha, deployedUrl, mutationPerformed: false, alreadyPublished: true}));
    return;
  }
  const description = 'Study1 V2 ' + process.env.GITHUB_SHA;
  const noRetry = {retry: false};
  if (headSha !== candidateSha) {
    await request('projects.updateContent (read HEAD before any retry)', () =>
      api.projects.updateContent({...target, requestBody: {files}}, noRetry));
  }
  if (verifyRemote(await getContent()).sha !== candidateSha) throw new Error('V2_HEAD_READBACK_MISMATCH');
  const created = await request('projects.versions.create (list versions before any retry)', () =>
    api.projects.versions.create({...target, requestBody: {description}}, noRetry)).then(response => response.data);
  const nextVersion = created.versionNumber;
  if (!Number.isInteger(nextVersion) || nextVersion <= version || verifyRemote(await getContent(nextVersion)).sha !== candidateSha) {
    throw new Error('V2_IMMUTABLE_VERSION_READBACK_MISMATCH');
  }
  if (originalDeployment(await getDeployment()) !== version) throw new Error('V2_DEPLOYMENT_CHANGED_DURING_RELEASE');
  await request('projects.deployments.update (read deployment before any retry)', () =>
    api.projects.deployments.update({...target, deploymentId, requestBody: {deploymentConfig: {
      scriptId: SID, versionNumber: nextVersion, manifestFileName: 'appsscript', description
    }}}, noRetry));
  if (originalDeployment(await getDeployment()) !== nextVersion ||
      verifyRemote(await getContent(nextVersion)).sha !== candidateSha ||
      verifyRemote(await getContent()).sha !== candidateSha) {
    throw new Error('V2_FINAL_READBACK_MISMATCH');
  }
  console.log(JSON.stringify({previousVersion: version, version: nextVersion, candidateSha, deployedUrl, mutationPerformed: true}));
}

if (require.main === module) {
  release().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
