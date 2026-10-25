import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpClient } from 'hap-controller';

// patches/hap-controller+0.10.2.patch: HttpClient.close() must abort a
// request whose connection is still being set up. Unpatched, the socket to an
// address that silently drops traffic (here TEST-NET-1) lingers until the OS
// gives up, and the listener's timeouts leak one per attempt.
test('HttpClient.close() aborts a request still connecting', async () => {
  const client = new HttpClient('AA:BB:CC:DD:EE:FF', '192.0.2.1', 51999, {
    AccessoryPairingID: Buffer.from('AA:BB:CC:DD:EE:FF').toString('hex'),
    AccessoryLTPK: '00'.repeat(32),
    iOSDevicePairingID: Buffer.from('11:22:33:44:55:66').toString('hex'),
    iOSDeviceLTSK: '00'.repeat(64),
    iOSDeviceLTPK: '00'.repeat(32),
  });
  const pending = client.getAccessories().then(() => 'resolved', () => 'rejected');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(client._openConnections?.size, 1, 'the in-flight connection is tracked');
  const [conn] = client._openConnections;
  const socket = conn.socket;
  await client.close();
  assert.equal(client._openConnections.size, 0);
  assert.ok(!socket || socket.destroyed, 'the connecting socket was destroyed, not left half-open');
  const outcome = await Promise.race([pending, new Promise((r) => setTimeout(() => r('still pending'), 2000))]);
  assert.notEqual(outcome, 'resolved');
});
