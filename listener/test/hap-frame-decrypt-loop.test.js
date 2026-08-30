// Regression test for hap-controller HttpConnection._requestEncrypted()'s
// bodyParser catch block.
//
// Background: upstream hap-controller@0.10.2's encrypted bodyParser (inside
// _requestEncrypted) advances `message` only on a SUCCESSFUL decrypt. When
// libsodium's crypto_aead_chacha20poly1305_ietf_decrypt throws on a MAC
// verification failure (e.g. a desynced counter or a hostile/corrupt frame),
// `message`, `frameLength` and `this.a2cCounter` are all left unchanged, the
// enclosing `while (message.length >= 18)` condition is still true, and the
// identical decrypt re-runs synchronously forever inside a socket 'data'
// handler on the single event loop — freezing the whole listener at 100% CPU
// (same bug class as the May dnssd incident fixed by
// listener/patches/dnssd+0.4.1.patch).
//
// This test exercises two cases:
//   a) Hang case — a frame with a valid length header but garbage
//      ciphertext+tag must cause the returned promise to REJECT rather than
//      hang. Because the pre-patch loop is synchronous, the only safe way to
//      bound it is to run it inside a worker_threads Worker we can terminate
//      from the main thread.
//   b) Positive case — a legitimately encrypted frame still resolves with a
//      valid HTTP response. This proves the fix doesn't break the normal
//      path.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

// libsodium-wrappers' ESM build (dist/modules-esm) is broken in this install
// (it imports a sibling libsodium.mjs that isn't hoisted correctly), but its
// CJS build works fine and is exactly what hap-controller itself uses
// internally — so load it the same way via createRequire.
const require = createRequire(import.meta.url);
const sodium = require('libsodium-wrappers');

/**
 * Builds a fake net.Socket-like EventEmitter suitable for driving
 * HttpConnection._requestEncrypted() without a real TCP connection.
 */
function makeFakeSocket() {
  const socket = new EventEmitter();
  socket.write = () => {};
  socket.destroy = () => {
    socket.destroyed = true;
    socket.emit('close');
  };
  socket.end = () => {};
  socket.setKeepAlive = () => {};
  socket.setTimeout = () => {};
  return socket;
}

test('_requestEncrypted rejects (does not hang) on an undecryptable frame', async () => {
  // Run the attack inside a worker thread so the pre-patch infinite
  // synchronous loop can be aborted via worker.terminate() — a main-thread
  // setTimeout would never fire while that loop is spinning.
  const workerSrc = `
    const { parentPort } = require('node:worker_threads');
    const { EventEmitter } = require('node:events');
    (async () => {
      try {
        const HttpConnection = require('hap-controller/lib/transport/ip/http-connection.js').default;
        const conn = new HttpConnection('127.0.0.1', 1234);
        const socket = new EventEmitter();
        socket.write = () => {};
        socket.destroy = () => { socket.emit('close'); };
        socket.end = () => {};
        socket.setKeepAlive = () => {};
        socket.setTimeout = () => {};
        conn.socket = socket;
        conn._open = async () => {};
        conn.sessionKeys = {
          AccessoryToControllerKey: Buffer.alloc(32),
          ControllerToAccessoryKey: Buffer.alloc(32),
        };

        conn._requestEncrypted(Buffer.from('GET / HTTP/1.1\\r\\n\\r\\n'))
          .then(() => parentPort.postMessage({ outcome: 'resolved' }))
          .catch((err) => parentPort.postMessage({ outcome: 'threw', message: err.message }));

        // Wait until _requestEncrypted has attached its 'data' listener
        // (it awaits libsodium.ready + this._open() first) before emitting
        // the bad frame. Poll rather than guessing a fixed delay.
        const waitForListener = () => new Promise((resolve) => {
          const check = () => {
            if (socket.listenerCount('data') > 0) return resolve();
            setTimeout(check, 5);
          };
          check();
        });
        await waitForListener();

        // 26-byte frame: 2-byte LE length header (=8) + 24 bytes of garbage
        // (8 ciphertext + 16 tag). Satisfies message.length >= 18 and
        // message.length >= frameLength + 18 (26 >= 26), so a decrypt is
        // attempted and throws (MAC verification failure against zero keys).
        const badFrame = Buffer.alloc(26);
        badFrame.writeUInt16LE(8, 0);
        for (let i = 2; i < 26; i++) badFrame[i] = 0xAB;
        socket.emit('data', badFrame);
      } catch (err) {
        parentPort.postMessage({ outcome: 'setup-error', message: err.message });
      }
    })();
  `;
  const worker = new Worker(workerSrc, { eval: true });

  const result = await new Promise((resolve) => {
    // This deadline exists ONLY to bound a genuine pre-patch infinite loop:
    // the patched catch rejects in microseconds, so the passing case
    // resolves on the worker's message and never waits for this timer. Keep
    // this generous to avoid a false 'hung' verdict on a loaded/cold runner.
    // Do not lower this.
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
    `Expected _requestEncrypted to reject on an undecryptable frame; got: ${JSON.stringify(result)}`
  );
  assert.match(
    result.message,
    /undecryptable|MAC/i,
    `Expected rejection message to mention undecryptable/MAC; got: ${result.message}`
  );
});

test('_requestEncrypted still resolves a legitimately encrypted frame', async () => {
  await sodium.ready;

  // require('hap-controller/...').default is the HttpConnection class
  // (verified) — hap-controller has no `exports` field so a deep require
  // works, and CJS's own `exports.default = HttpConnection` means the
  // dynamic-import interop double-wraps it as `.default.default`, so use
  // require here for a single, unambiguous unwrap.
  const HttpConnection = require('hap-controller/lib/transport/ip/http-connection.js').default;

  const conn = new HttpConnection('127.0.0.1', 1234);
  const socket = makeFakeSocket();
  conn.socket = socket;
  conn._open = async () => {};
  const a2cKey = Buffer.alloc(32);
  conn.sessionKeys = {
    AccessoryToControllerKey: a2cKey,
    ControllerToAccessoryKey: Buffer.alloc(32),
  };

  const plaintext = Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok');
  const aad = Buffer.alloc(2);
  aad.writeUInt16LE(plaintext.length, 0);
  const nonce = Buffer.alloc(12);
  nonce.writeUInt32LE(0, 4); // a2cCounter starts at 0

  const cipher = sodium.crypto_aead_chacha20poly1305_ietf_encrypt(
    plaintext,
    aad,
    null,
    nonce,
    a2cKey
  );
  const frame = Buffer.concat([aad, Buffer.from(cipher)]);

  const requestPromise = conn._requestEncrypted(Buffer.from('GET / HTTP/1.1\r\n\r\n'));

  // Wait for _requestEncrypted to attach its 'data' listener before emitting.
  await new Promise((resolve) => {
    const check = () => {
      if (socket.listenerCount('data') > 0) return resolve();
      setTimeout(check, 5);
    };
    check();
  });

  socket.emit('data', frame);

  const response = await requestPromise;
  assert.equal(response.statusCode, 200);
  assert.equal(conn.a2cCounter, 1);
});
