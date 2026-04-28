import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveDeviceHealth } from '../src/device-health.js';

test('deriveDeviceHealth marks active device as online', () => {
  const now = new Date('2026-02-26T18:00:00.000Z').getTime();
  const health = deriveDeviceHealth({
    lastSeen: '2026-02-26T17:55:00.000Z',
    heartbeatSeconds: 300,
    heartbeatSamples: 10,
    now,
  });

  assert.equal(health.status, 'online');
  assert.equal(health.missedHeartbeats, 0);
  assert.equal(health.isStale, false);
});

test('deriveDeviceHealth reports offline and missed heartbeats', () => {
  const now = new Date('2026-02-26T18:00:00.000Z').getTime();
  const health = deriveDeviceHealth({
    lastSeen: '2026-02-26T16:00:00.000Z',
    heartbeatSeconds: 600,
    heartbeatSamples: 12,
    now,
  });

  assert.equal(health.status, 'offline');
  assert.equal(health.offlineDurationSeconds, 7200);
  assert.equal(health.missedHeartbeats, 11);
  assert.equal(health.isStale, false);
});

test('deriveDeviceHealth marks stale when paired device never emits', () => {
  const now = new Date('2026-02-26T18:00:00.000Z').getTime();
  const health = deriveDeviceHealth({
    pairedAt: '2026-02-25T00:00:00.000Z',
    now,
  });

  assert.equal(health.status, 'stale');
  assert.equal(health.isStale, true);
  assert.match(health.staleReason, /never produced events/i);
});

test('deriveDeviceHealth honors configured staleThresholdSeconds', () => {
  const now = new Date('2026-02-26T18:00:00.000Z').getTime();
  const health = deriveDeviceHealth({
    lastSeen: '2026-02-26T11:00:00.000Z',
    staleThresholdSeconds: 6 * 60 * 60,
    now,
  });

  assert.equal(health.status, 'stale');
  assert.equal(health.staleThresholdSeconds, 6 * 60 * 60);
  assert.equal(health.isStale, true);
});

// -- subscriberConnectedAt override tests --

test('deriveDeviceHealth: subscriberConnectedAt within onlineThreshold overrides stale lastSeen to online', () => {
  // lastSeen is 2 days ago (stale), but subscriber connected 5 minutes ago
  const now = new Date('2026-02-26T18:00:00.000Z').getTime();
  const health = deriveDeviceHealth({
    lastSeen: '2026-02-24T18:00:00.000Z',
    subscriberConnectedAt: '2026-02-26T17:55:00.000Z',
    now,
  });

  assert.equal(health.status, 'online');
  assert.equal(health.isStale, false);
  assert.equal(health.staleReason, null);
});

test('deriveDeviceHealth: subscriberConnectedAt within onlineThreshold overrides offline lastSeen to online', () => {
  // lastSeen is 30 minutes ago (offline but not stale), subscriber connected 5 minutes ago
  const now = new Date('2026-02-26T18:00:00.000Z').getTime();
  const health = deriveDeviceHealth({
    lastSeen: '2026-02-26T17:30:00.000Z',
    subscriberConnectedAt: '2026-02-26T17:55:00.000Z',
    now,
  });

  assert.equal(health.status, 'online');
  assert.equal(health.isStale, false);
});

test('deriveDeviceHealth: subscriberConnectedAt older than staleThreshold does NOT override stale status', () => {
  // lastSeen is 2 days ago (stale), subscriber also connected 2 days ago
  const now = new Date('2026-02-26T18:00:00.000Z').getTime();
  const health = deriveDeviceHealth({
    lastSeen: '2026-02-24T18:00:00.000Z',
    subscriberConnectedAt: '2026-02-24T18:05:00.000Z',
    now,
  });

  assert.equal(health.status, 'stale');
  assert.equal(health.isStale, true);
});

test('deriveDeviceHealth: null subscriberConnectedAt preserves existing behavior', () => {
  const now = new Date('2026-02-26T18:00:00.000Z').getTime();
  // Online device with null subscriberConnectedAt
  const health = deriveDeviceHealth({
    lastSeen: '2026-02-26T17:55:00.000Z',
    heartbeatSeconds: 300,
    heartbeatSamples: 10,
    subscriberConnectedAt: null,
    now,
  });

  assert.equal(health.status, 'online');
  assert.equal(health.missedHeartbeats, 0);
});

test('deriveDeviceHealth: subscriberConnectedAt with null lastSeen and null pairedAt yields online', () => {
  // Device with no events and no pairedAt, but subscriber connected recently
  const now = new Date('2026-02-26T18:00:00.000Z').getTime();
  const health = deriveDeviceHealth({
    lastSeen: null,
    pairedAt: null,
    subscriberConnectedAt: '2026-02-26T17:55:00.000Z',
    now,
  });

  assert.equal(health.status, 'online');
  assert.equal(health.isStale, false);
});

// -- subscriberLastHealthyAt rescue tests --

test('deriveDeviceHealth: rescue clause prefers subscriberLastHealthyAt when both timestamps are provided', () => {
  // lastSeen 24h ago (stale), subscriberConnectedAt 30 min ago (outside 15-min onlineThreshold),
  // subscriberLastHealthyAt 2 min ago (inside threshold) → SHOULD rescue.
  const now = new Date('2026-02-26T18:00:00.000Z').getTime();
  const health = deriveDeviceHealth({
    lastSeen: '2026-02-25T18:00:00.000Z',
    subscriberConnectedAt: '2026-02-26T17:30:00.000Z',
    subscriberLastHealthyAt: '2026-02-26T17:58:00.000Z',
    now,
  });

  assert.equal(health.status, 'online');
  assert.equal(health.isStale, false);
  assert.equal(health.staleReason, null);
  assert.equal(health.subscriberLastHealthyAt, '2026-02-26T17:58:00.000Z');
});

test('deriveDeviceHealth: rescue clause falls back to subscriberConnectedAt when subscriberLastHealthyAt is null', () => {
  // Existing-behavior preservation: lastSeen 24h ago, lastHealthyAt null,
  // subscriberConnectedAt 2 min ago → still rescues.
  const now = new Date('2026-02-26T18:00:00.000Z').getTime();
  const health = deriveDeviceHealth({
    lastSeen: '2026-02-25T18:00:00.000Z',
    subscriberConnectedAt: '2026-02-26T17:58:00.000Z',
    subscriberLastHealthyAt: null,
    now,
  });

  assert.equal(health.status, 'online');
  assert.equal(health.isStale, false);
});

test('deriveDeviceHealth: rescue does not fire when both subscriber timestamps are stale', () => {
  // Both > onlineThresholdSeconds old (15 min) → status stays stale.
  const now = new Date('2026-02-26T18:00:00.000Z').getTime();
  const health = deriveDeviceHealth({
    lastSeen: '2026-02-25T18:00:00.000Z',
    subscriberConnectedAt: '2026-02-26T17:00:00.000Z',
    subscriberLastHealthyAt: '2026-02-26T17:00:00.000Z',
    now,
  });

  assert.equal(health.status, 'stale');
  assert.equal(health.isStale, true);
});

test('deriveDeviceHealth: subscriberLastHealthyAt is irrelevant when status is already online from lastSeen', () => {
  const now = new Date('2026-02-26T18:00:00.000Z').getTime();
  const health = deriveDeviceHealth({
    lastSeen: '2026-02-26T17:55:00.000Z',
    heartbeatSeconds: 300,
    heartbeatSamples: 10,
    subscriberLastHealthyAt: '2026-02-26T17:58:00.000Z',
    now,
  });

  assert.equal(health.status, 'online');
  assert.equal(health.missedHeartbeats, 0);
});
