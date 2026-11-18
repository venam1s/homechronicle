// node --test scripts/release-notes.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReleaseNotes } from './release-notes.mjs';

const CHANGELOG = `# Changelog

All notable changes to homechronicle are documented in this file.

## [0.6.1] — Unreleased

Days counted in your time zone, and the top-bar date can be hidden.

### Beta notes
- **beta.2:** supersedes beta.1, whose detail chart was off by one day.
- **beta.1:** first beta of 0.6.1.

### Upgrade notes
- **No database migrations** and no required \`.env\` changes.

### Fixed
- The TODAY card and the house summary disagreed every evening.

## [0.6.0] — 2026-11-17

Temperatures in °C or °F.

### Added
- **Temperature unit (#3).**

## [0.5.0] — 2026-11-08

Older.
`;

test('a beta tag gets a generated header and the whole in-progress section', () => {
  const { notes, warnings } = buildReleaseNotes(CHANGELOG, 'v0.6.1-beta.2');
  assert.deepEqual(warnings, []);
  assert.match(notes, /^Beta 2 of v0\.6\.1\./);
  assert.match(notes, /`havuq\/homechronicle-listener:0\.6\.1-beta\.2`/);
  assert.match(notes, /`havuq\/homechronicle-web:0\.6\.1-beta\.2`/);
  assert.match(notes, /`:latest` stays on v0\.6\.0/);
  assert.match(notes, /since v0\.6\.0/);
  assert.match(notes, /\*\*Beta notes\*\* below/);
  assert.match(notes, /### Beta notes\n- \*\*beta\.2:\*\* supersedes beta\.1/);
  assert.match(notes, /### Upgrade notes/);
  assert.match(notes, /### Fixed\n- The TODAY card/);
  assert.doesNotMatch(notes, /## \[0\.6\.1\]/, 'the heading itself is not part of the notes');
  assert.doesNotMatch(notes, /Unreleased/);
  assert.doesNotMatch(notes, /Temperatures in °C/, 'the previous release is not included');
});

test('a stable tag gets the section as is, without the Beta notes subsection', () => {
  const dated = CHANGELOG.replace('## [0.6.1] — Unreleased', '## [0.6.1] — 2026-11-30');
  const { notes, warnings } = buildReleaseNotes(dated, 'v0.6.1');
  assert.deepEqual(warnings, []);
  assert.match(notes, /^Days counted in your time zone/);
  assert.doesNotMatch(notes, /Beta notes/);
  assert.doesNotMatch(notes, /beta\.1/);
  assert.match(notes, /### Upgrade notes\n- \*\*No database migrations\*\*/);
  assert.match(notes, /### Fixed\n- The TODAY card and the house summary disagreed every evening\.$/);
  assert.doesNotMatch(notes, /Beta 1 of/);
});

test('a stable tag on an Unreleased heading still publishes, with a warning', () => {
  const { notes, warnings } = buildReleaseNotes(CHANGELOG, 'v0.6.1');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Unreleased/);
  assert.match(notes, /^Days counted in your time zone/);
  assert.doesNotMatch(notes, /Unreleased/);
});

test('the previous stable release is the next dated heading, not the next heading', () => {
  const twoUnreleased = CHANGELOG.replace(
    '## [0.6.0] — 2026-11-17',
    '## [0.6.0] — Unreleased\n\nNot out yet.\n\n## [0.5.9] — 2026-11-10',
  );
  const { notes } = buildReleaseNotes(twoUnreleased, 'v0.6.1-beta.1');
  assert.match(notes, /`:latest` stays on v0\.5\.9/);
});

test('a version with no section falls back and warns, keeping the beta header', () => {
  const beta = buildReleaseNotes(CHANGELOG, 'v0.7.0-beta.1');
  assert.equal(beta.warnings.length, 1);
  assert.match(beta.warnings[0], /no '## \[0\.7\.0\]' section/);
  assert.match(beta.notes, /^Beta 1 of v0\.7\.0\./);
  assert.match(beta.notes, /`:latest` stays on v0\.6\.0/, 'the last dated release is still known');
  assert.match(beta.notes, /_No CHANGELOG section for 0\.7\.0 yet\._/);
  assert.doesNotMatch(beta.notes, /Beta notes/);

  const stable = buildReleaseNotes(CHANGELOG, 'v0.7.0');
  assert.equal(stable.notes, 'Release v0.7.0');
  assert.equal(stable.warnings.length, 1);
});

test('0.6.1 does not match the 0.6.10 section', () => {
  const log = CHANGELOG.replace('## [0.6.1] — Unreleased', '## [0.6.10] — Unreleased');
  const { notes, warnings } = buildReleaseNotes(log, 'v0.6.1');
  assert.equal(notes, 'Release v0.6.1');
  assert.equal(warnings.length, 1);
});

test('a beta without a Beta notes subsection does not point at one', () => {
  const log = CHANGELOG.replace(/### Beta notes\n(- .*\n)+\n/, '');
  const { notes } = buildReleaseNotes(log, 'v0.6.1-beta.1');
  assert.doesNotMatch(notes, /Beta notes/);
  assert.match(notes, /### Upgrade notes/);
});

test('a malformed tag is rejected', () => {
  assert.throws(() => buildReleaseNotes(CHANGELOG, 'v0.6'), /vX\.Y\.Z/);
  assert.throws(() => buildReleaseNotes(CHANGELOG, '0.6.1'), /vX\.Y\.Z/);
  assert.throws(() => buildReleaseNotes(CHANGELOG, 'v0.6.1-rc.1'), /vX\.Y\.Z/);
});
