// Regression coverage for JsonObjectStore._sweepStaleTemps() (M-6).
//
// Background: _doWrite() writes to `<file>.tmp-<pid>-<ts>` then renames it
// into place. A SIGKILL between those two steps (docker stop past the grace
// period) leaves the temp file behind forever — /app/data accumulates them
// across restarts. init() now sweeps stale `.tmp-*` siblings before the
// first refresh().

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonObjectStore } from '../src/store.js';

test('init() removes stale .tmp-* siblings and leaves everything else intact', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hc-store-'));
  try {
    const filePath = join(dir, 'rooms.json');
    await writeFile(filePath, JSON.stringify({ foo: 'bar' }));
    await writeFile(join(dir, 'rooms.json.tmp-1234-1700000000000'), 'garbage');
    await writeFile(join(dir, 'rooms.json.tmp-9999-1700000000001'), 'garbage');
    await writeFile(join(dir, 'other.json'), JSON.stringify({ untouched: true }));

    const store = new JsonObjectStore(filePath, {});
    await store.init();

    const remaining = await readdir(dir);
    assert.ok(!remaining.includes('rooms.json.tmp-1234-1700000000000'), 'first temp file should be removed');
    assert.ok(!remaining.includes('rooms.json.tmp-9999-1700000000001'), 'second temp file should be removed');
    assert.ok(remaining.includes('rooms.json'), 'real file should still exist');
    assert.ok(remaining.includes('other.json'), 'unrelated file should still exist');

    const otherContent = JSON.parse(await readFile(join(dir, 'other.json'), 'utf8'));
    assert.deepEqual(otherContent, { untouched: true });

    assert.deepEqual(store.getSnapshot(), { foo: 'bar' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('init() does not throw when constructed over a non-existent directory', async () => {
  const dir = join(tmpdir(), `hc-store-missing-${process.pid}-${Date.now()}`);
  const store = new JsonObjectStore(join(dir, 'rooms.json'), { default: true });

  await assert.doesNotReject(() => store.init());
  assert.deepEqual(store.getSnapshot(), { default: true });
});

test('_sweepStaleTemps only matches this file\'s own .tmp- prefix, not similarly-named files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hc-store-'));
  try {
    const filePath = join(dir, 'rooms.json');
    await writeFile(filePath, JSON.stringify({}));
    // A sibling store's temp file must NOT be swept by rooms.json's store.
    await writeFile(join(dir, 'display-names.json.tmp-1-1'), 'garbage');
    // A file that merely starts with the same stem but isn't a temp file.
    await writeFile(join(dir, 'rooms.json.bak'), 'not a temp file');

    const store = new JsonObjectStore(filePath, {});
    await store.init();

    const remaining = await readdir(dir);
    assert.ok(remaining.includes('display-names.json.tmp-1-1'), 'sibling store temp file must be left alone');
    assert.ok(remaining.includes('rooms.json.bak'), 'non-tmp- suffixed file must be left alone');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
