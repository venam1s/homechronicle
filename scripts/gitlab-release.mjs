#!/usr/bin/env node
// Mirrors a release to GitLab (gitlab.com/havuq/homechronicle) after GitHub
// Actions has cut it. Installs up to v0.5.0 only ask GitLab for updates
// (listener/src/updates-router.js), so GitLab keeps receiving every release.
//
// Runs as a step of the `release` job in .github/workflows/release.yml. Inputs (env):
//   GITLAB_RELEASE_TOKEN  project access token, havuq/homechronicle, scope api
//   CI_COMMIT_TAG         the tag being released, e.g. v0.6.1 or v0.6.1-beta.2
//   IS_PRERELEASE         "true" for betas (names the release "vX.Y.Z-beta.N (beta)")
//   NOTES_FILE            release notes; default release-notes.md
//   GITLAB_PROJECT        default havuq/homechronicle
//   DRY_RUN               "1" prints the request instead of sending it
//
// Safe to re-run: an existing release for the tag is left alone. The tag must
// already be on GitLab (the dual push puts it there).

import { readFileSync } from 'node:fs';

const {
  GITLAB_RELEASE_TOKEN: token,
  CI_COMMIT_TAG: tag,
  IS_PRERELEASE,
  NOTES_FILE = 'release-notes.md',
  GITLAB_PROJECT: project = 'havuq/homechronicle',
  DRY_RUN,
} = process.env;

const api = `https://gitlab.com/api/v4/projects/${encodeURIComponent(project)}`;
const headers = {
  ...(token ? { 'PRIVATE-TOKEN': token } : {}),
  accept: 'application/json',
  'content-type': 'application/json',
  'user-agent': 'homechronicle-release-ci',
};

function fail(message) {
  console.error(`gitlab-release: ${message}`);
  process.exit(1);
}

if (!tag) fail('CI_COMMIT_TAG is not set');
if (!token && DRY_RUN !== '1') fail('GITLAB_RELEASE_TOKEN is not set');

const prerelease = IS_PRERELEASE === 'true';
const tagPath = encodeURIComponent(tag);

const existing = await fetch(`${api}/releases/${tagPath}`, { headers });
if (existing.ok) {
  const { _links: links } = await existing.json();
  console.log(`gitlab-release: ${tag} already exists on GitLab, leaving it alone: ${links?.self ?? ''}`);
  process.exit(0);
}
if (existing.status !== 404 && existing.status !== 403) {
  fail(`checking for an existing release: HTTP ${existing.status} ${await existing.text()}`);
}

const tagCheck = await fetch(`${api}/repository/tags/${tagPath}`, { headers });
if (tagCheck.status === 404) fail(`tag ${tag} is not on GitLab yet; push it first (git push origin ${tag})`);
if (!tagCheck.ok) fail(`checking the tag: HTTP ${tagCheck.status} ${await tagCheck.text()}`);

let description;
try {
  description = readFileSync(NOTES_FILE, 'utf8').trim();
} catch (err) {
  fail(`cannot read ${NOTES_FILE}: ${err.message}`);
}
if (!description) description = `Release ${tag}`;

const body = {
  tag_name: tag,
  name: prerelease ? `${tag} (beta)` : tag,
  description,
};

if (DRY_RUN === '1') {
  console.log(`gitlab-release: DRY RUN — would POST ${api}/releases`);
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

const res = await fetch(`${api}/releases`, { method: 'POST', headers, body: JSON.stringify(body) });
if (!res.ok) fail(`creating the release: HTTP ${res.status} ${await res.text()}`);
const created = await res.json();
console.log(`gitlab-release: created ${tag}${prerelease ? ' (beta)' : ''}: ${created._links?.self ?? ''}`);
