#!/usr/bin/env node
// Builds the release notes for a version tag from CHANGELOG.md.
//
// Runs as a step of the `release` job in .github/workflows/release.yml:
//   node scripts/release-notes.mjs vX.Y.Z[-beta.N] [CHANGELOG.md] > release-notes.md
//
// CHANGELOG.md IS the release notes. The notes for tag vX.Y.Z[-beta.N] are the
// body of its `## [X.Y.Z]` section (the heading itself is dropped). The heading
// reads `## [X.Y.Z] — Unreleased` while the version is in beta and gets its date
// at GA, so every beta of a version publishes the whole section as it stands:
// cumulative notes since the last stable release, not a diff from the previous
// beta.
//
//   - A beta tag gets a generated header first (which beta this is, the image
//     tags, that `:latest` stays on the last stable release, how to try it).
//   - The section's `### Beta notes` subsection, where each beta records what
//     it changed and what to know before going back, is kept for betas and
//     dropped for the stable release.
//   - A missing section is a warning, not a failure (the images are already
//     pushed by then): the notes fall back to a bare title.
//
// Warnings go to stderr; the notes go to stdout.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TAG_RE = /^v(\d+\.\d+\.\d+)(?:-beta\.(\d+))?$/;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits a changelog into its `## [version]` sections, in file order.
 * @returns {{ version: string, heading: string, body: string }[]}
 */
function parseSections(changelog) {
  const lines = changelog.split(/\r?\n/);
  const sections = [];
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^## \[([^\]]+)\](.*)$/);
    if (heading) {
      current = { version: heading[1], heading: heading[2].trim(), lines: [] };
      sections.push(current);
    } else if (line.startsWith('## ')) {
      current = null;
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections.map(({ version, heading, lines: body }) => ({
    version,
    heading,
    body: body.join('\n').trim(),
  }));
}

/** Removes the `### Beta notes` subsection (up to the next `### ` heading) from a section body. */
function stripBetaNotes(body) {
  return body
    .replace(/(^|\n)### Beta notes\n[\s\S]*?(?=\n### |$)/, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function betaHeader({ version, beta, previous, hasBetaNotes, namespace }) {
  const latest = previous ? `v${previous}` : 'the last stable release';
  const since = previous ? ` since v${previous}` : '';
  const lines = [
    `Beta ${beta} of v${version}. The images are \`${namespace}/homechronicle-listener:${version}-beta.${beta}\` ` +
      `and \`${namespace}/homechronicle-web:${version}-beta.${beta}\`, also tagged \`:beta\`. ` +
      `\`:latest\` stays on ${latest}, and there is no standalone image for a beta.`,
    '',
    'To try it, point `LISTENER_IMAGE` and `WEB_IMAGE` in your `.env` at those tags (or `:beta`) and pull. ' +
      `These notes cover all of v${version} so far${since}.` +
      (hasBetaNotes
        ? ' **Beta notes** below say what each beta changed and what to know before going back to an earlier version.'
        : ''),
  ];
  return lines.join('\n');
}

/**
 * @param {string} changelog  the text of CHANGELOG.md
 * @param {string} tag        vX.Y.Z or vX.Y.Z-beta.N
 * @returns {{ notes: string, warnings: string[] }}
 */
export function buildReleaseNotes(changelog, tag, { namespace = 'havuq' } = {}) {
  const match = tag.match(TAG_RE);
  if (!match) throw new Error(`tag '${tag}' does not match vX.Y.Z or vX.Y.Z-beta.N`);
  const [, version, beta] = match;
  const isBeta = beta !== undefined;
  const warnings = [];

  const sections = parseSections(changelog);
  const index = sections.findIndex((s) => s.version === version);
  const section = index === -1 ? null : sections[index];
  // The last stable release: the next heading that carries a date rather than
  // "Unreleased" (two in-progress versions can sit at the top at once).
  const previous = sections
    .slice(index === -1 ? 0 : index + 1)
    .find((s) => s.version !== version && !/unreleased/i.test(s.heading))?.version ?? null;

  let body;
  if (!section) {
    warnings.push(`no '## [${version}]' section in CHANGELOG.md; using a bare title`);
    body = isBeta ? `_No CHANGELOG section for ${version} yet._` : `Release ${tag}`;
  } else if (isBeta) {
    body = section.body;
  } else {
    if (/unreleased/i.test(section.heading)) {
      warnings.push(`the '## [${version}]' heading still says Unreleased; give it its release date`);
    }
    body = stripBetaNotes(section.body);
  }

  if (!isBeta) return { notes: body, warnings };

  const hasBetaNotes = /(^|\n)### Beta notes\n/.test(body);
  const header = betaHeader({ version, beta, previous, hasBetaNotes, namespace });
  return { notes: `${header}\n\n${body}`.trim(), warnings };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [tag, file = 'CHANGELOG.md'] = process.argv.slice(2);
  if (!tag) {
    console.error('usage: release-notes.mjs vX.Y.Z[-beta.N] [CHANGELOG.md]');
    process.exit(2);
  }
  let notes;
  let warnings;
  try {
    ({ notes, warnings } = buildReleaseNotes(readFileSync(file, 'utf8'), tag, {
      namespace: process.env.DOCKER_HUB_NAMESPACE || 'havuq',
    }));
  } catch (err) {
    console.error(`release-notes: ${err.message}`);
    process.exit(1);
  }
  for (const warning of warnings) console.error(`release-notes: WARNING: ${warning}`);
  process.stdout.write(`${notes}\n`);
}
