#!/usr/bin/env node
// Creates the GitHub release for a version tag that GitLab CI has just released.
//
// Releases are cut by GitLab CI on the homelab runner (no GitHub Actions — they
// stay disabled on the GitHub repo), so this is how a release reaches GitHub,
// where the in-app update check (listener/src/updates-router.js) also looks.
//
// Runs as the `github-release` job in .gitlab-ci.yml. Inputs (env):
//   GITHUB_RELEASE_TOKEN  fine-grained PAT, venam1s/homechronicle, Contents: read & write
//   CI_COMMIT_TAG         the tag being released, e.g. v0.6.0 or v0.6.0-beta.2
//   IS_PRERELEASE         "true" for betas (from the validate-release job)
//   NOTES_FILE            release notes; default release-notes.md (create-release artifact)
//   GITHUB_REPO           default venam1s/homechronicle
//   DRY_RUN               "1" prints the request instead of sending it
//
// Safe to re-run: an existing release for the tag is left alone.

import { readFileSync } from 'node:fs';

const {
  GITHUB_RELEASE_TOKEN: token,
  CI_COMMIT_TAG: tag,
  IS_PRERELEASE,
  NOTES_FILE = 'release-notes.md',
  GITHUB_REPO: repo = 'venam1s/homechronicle',
  DRY_RUN,
} = process.env;

const api = `https://api.github.com/repos/${repo}`;
const headers = {
  // A dry run may go without a token: the lookups below work anonymously on a public repo.
  ...(token ? { authorization: `Bearer ${token}` } : {}),
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'homechronicle-gitlab-ci',
};

function fail(message) {
  console.error(`github-release: ${message}`);
  process.exit(1);
}

if (!tag) fail('CI_COMMIT_TAG is not set');
if (!token && DRY_RUN !== '1') fail('GITHUB_RELEASE_TOKEN is not set');

const prerelease = IS_PRERELEASE === 'true';
const tagPath = encodeURIComponent(tag);

// Already released (job re-run, or created by hand) → nothing to do.
const existing = await fetch(`${api}/releases/tags/${tagPath}`, { headers });
if (existing.ok) {
  const { html_url: url } = await existing.json();
  console.log(`github-release: ${tag} already exists on GitHub, leaving it alone: ${url}`);
  process.exit(0);
}
if (existing.status !== 404) fail(`checking for an existing release: HTTP ${existing.status} ${await existing.text()}`);

// The tag reaches GitHub through the dual push (`git push origin <tag>`), which
// finishes long before this job runs. Requiring it — instead of letting the API
// create it — keeps the token to Contents: read & write.
const ref = await fetch(`${api}/git/ref/tags/${tagPath}`, { headers });
if (ref.status === 404) {
  fail(`tag ${tag} is not on GitHub. Push it (git push origin ${tag}) and retry this job.`);
}
if (!ref.ok) fail(`checking tag: HTTP ${ref.status} ${await ref.text()}`);

let body;
try {
  body = readFileSync(NOTES_FILE, 'utf8').trim();
} catch {
  body = '';
}
if (!body) body = `Release ${tag}`;

const payload = {
  tag_name: tag,
  name: tag,
  body,
  prerelease,
  // A beta must never become "Latest"; a stable release always does.
  make_latest: prerelease ? 'false' : 'true',
};

if (DRY_RUN === '1') {
  console.log(JSON.stringify({ ...payload, body: `${body.slice(0, 120)}…` }, null, 2));
  process.exit(0);
}

const res = await fetch(`${api}/releases`, {
  method: 'POST',
  headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});
if (!res.ok) fail(`creating release: HTTP ${res.status} ${await res.text()}`);
const created = await res.json();
console.log(`github-release: created ${tag}${prerelease ? ' (prerelease)' : ''}: ${created.html_url}`);
