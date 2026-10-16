// Regression test for hap-controller IPDiscovery dropping dnssd Browser errors.
//
// Background: upstream hap-controller@0.10.2's IPDiscovery.start() creates a
// dnssd Browser and forwards serviceUp/serviceDown/serviceChanged, but never
// listens for the Browser's 'error' event. When an mDNS send fails — macOS
// Local Network privacy blocking a LaunchAgent (EHOSTUNREACH 224.0.0.251:5353),
// or a network that drops while the listener is running — dnssd stops the
// Browser and emits 'error' with no listener. EventEmitter throws it, it lands
// in index.js's uncaughtException handler, and the whole listener exits,
// dropping every HAP subscription. discovery-helpers.js already listens for
// IPDiscovery 'error' and turns it into a skipped scan; the patch in
// listener/patches/hap-controller+0.10.2.patch makes IPDiscovery forward it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { IPDiscovery } from 'hap-controller';

test('IPDiscovery emits a failed mDNS send as an error event instead of crashing', async () => {
  const origSend = dgram.Socket.prototype.send;
  const uncaught = [];
  const onUncaught = (err) => uncaught.push(err);
  process.on('uncaughtException', onUncaught);

  // Fail every UDP send the way a blocked or unreachable network does.
  dgram.Socket.prototype.send = function (...args) {
    const callback = args.find((a) => typeof a === 'function');
    const err = Object.assign(new Error('send EHOSTUNREACH 224.0.0.251:5353'), {
      code: 'EHOSTUNREACH',
      syscall: 'send',
    });
    if (callback) process.nextTick(callback, err);
    else process.nextTick(() => this.emit('error', err));
  };

  const discovery = new IPDiscovery(null);
  try {
    const received = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no error event within 3 s')), 3000);
      discovery.on('error', (err) => {
        clearTimeout(timer);
        resolve(err);
      });
      discovery.start();
    });

    assert.ok(received instanceof Error);
    // Give any stray emit a tick to surface as an uncaught exception.
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(uncaught.map((e) => e.message), []);
  } finally {
    dgram.Socket.prototype.send = origSend;
    process.off('uncaughtException', onUncaught);
    try { discovery.stop(); } catch { /* browser already stopped itself */ }
  }
});
