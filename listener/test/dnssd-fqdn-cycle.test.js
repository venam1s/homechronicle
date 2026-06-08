// Regression test for dnssd BufferWrapper.readFQDN() cycle + budget guards.
//
// Background: upstream dnssd@0.4.1 follows DNS name-compression pointers
// (RFC 1035 §4.1.4) inside readFQDN() with no cycle detection and no
// iteration budget. A malformed mDNS packet whose pointers form a cycle
// would peg the event loop forever — the v0.1.10 prod incident.
//
// This test exercises two cases:
//   a) Cycle case — a [0xC0, 0x00] self-pointer must cause readFQDN() to
//      throw within a hard 1-second deadline. Because readFQDN() is
//      synchronous, the only safe way to bound the pre-patch infinite loop
//      is to run it inside a worker_threads Worker we can terminate from
//      the main thread.
//   b) Positive case — a legitimately compressed FQDN ("baz" + pointer to
//      "foo.bar.") still parses to 'baz.foo.bar.'. This proves the fix
//      doesn't break valid compression.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';

test('readFQDN throws on self-referential compression pointer (no hang)', async () => {
  // Run readFQDN() with a self-loop pointer inside a worker thread so the
  // pre-patch infinite loop can be aborted via worker.terminate() — the
  // main thread's setTimeout would never fire if we ran readFQDN() inline.
  const workerSrc = `
    const { parentPort } = require('node:worker_threads');
    (async () => {
      try {
        const mod = await import('dnssd/lib/BufferWrapper.js');
        const BufferWrapper = mod.default ?? mod.BufferWrapper ?? mod;
        // [0xC0, 0x00] = compression pointer to offset 0 (self-loop).
        const buf = Buffer.from([0xC0, 0x00]);
        const wrapper = new BufferWrapper(buf);
        wrapper.readFQDN();
        parentPort.postMessage({ outcome: 'returned-without-throw' });
      } catch (err) {
        parentPort.postMessage({ outcome: 'threw', message: err.message });
      }
    })();
  `;
  const worker = new Worker(workerSrc, { eval: true });

  const result = await new Promise((resolve) => {
    // This deadline exists ONLY to bound a genuine pre-patch infinite loop: the
    // patched guard throws in microseconds (128-iteration budget), so the
    // passing case resolves immediately on the worker's message and never waits
    // for this timer. The wall-clock cost here is cold worker_threads spawn +
    // dynamic ESM import of dnssd, which on a loaded CI runner can exceed a
    // second — so keep this generous (15s) to avoid a false 'hung' verdict on
    // slow startup. A truly broken guard posts no message → timer fires →
    // outcome:'hung' → the assertion below still fails. Do not lower this.
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ outcome: 'hung' });
    }, 15000);
    worker.on('message', (m) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(m);
    });
    worker.on('error', (e) => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ outcome: 'threw', message: e.message });
    });
  });

  assert.equal(
    result.outcome,
    'threw',
    `Expected readFQDN to throw on a compression-pointer cycle; got: ${JSON.stringify(result)}`
  );
  assert.match(
    result.message,
    /malformed FQDN|cycle|budget/i,
    `Expected thrown error to mention malformed FQDN / cycle / budget; got: ${result.message}`
  );
});

test('readFQDN still parses legitimate compressed FQDNs', async () => {
  const mod = await import('dnssd/lib/BufferWrapper.js');
  const BufferWrapper = mod.default ?? mod.BufferWrapper ?? mod;

  // Layout:
  //   offset 0..8  : [3]foo[3]bar[0]                                (9 bytes)
  //   offset 9..14 : [3]baz + pointer to offset 0 (0xC000 | 0x0000) (6 bytes)
  // Total: 15 bytes.
  const buf = Buffer.from([
    0x03, 0x66, 0x6f, 0x6f, // [3] f o o
    0x03, 0x62, 0x61, 0x72, // [3] b a r
    0x00,                    // root label
    0x03, 0x62, 0x61, 0x7a, // [3] b a z
    0xC0, 0x00,              // compression pointer to offset 0
  ]);

  const wrapper = new BufferWrapper(buf);
  wrapper.seek(9);
  const result = wrapper.readFQDN();

  assert.equal(result, 'baz.foo.bar.');
});
