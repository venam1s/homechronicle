import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3001';

describe('Toast retention settings', () => {
  it('GET /api/setup/retention includes toast fields with defaults', async () => {
    const res = await fetch(`${BASE}/api/setup/retention`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.toastsEnabled, true);
    assert.equal(data.liveEventToastsEnabled, false);
    assert.deepEqual(data.toastAccessories, []);
  });

  it('PATCH /api/setup/retention accepts toastsEnabled boolean', async () => {
    const res = await fetch(`${BASE}/api/setup/retention`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toastsEnabled: false }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.toastsEnabled, false);
  });

  it('PATCH /api/setup/retention rejects non-boolean toastsEnabled', async () => {
    const res = await fetch(`${BASE}/api/setup/retention`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toastsEnabled: 'yes' }),
    });
    assert.equal(res.status, 400);
  });

  it('PATCH /api/setup/retention accepts liveEventToastsEnabled boolean', async () => {
    const res = await fetch(`${BASE}/api/setup/retention`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ liveEventToastsEnabled: true }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.liveEventToastsEnabled, true);
  });

  it('PATCH /api/setup/retention accepts toastAccessories array', async () => {
    const res = await fetch(`${BASE}/api/setup/retention`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toastAccessories: ['acc-1', 'acc-2'] }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data.toastAccessories, ['acc-1', 'acc-2']);
  });

  it('PATCH /api/setup/retention rejects non-array toastAccessories', async () => {
    const res = await fetch(`${BASE}/api/setup/retention`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toastAccessories: 'not-array' }),
    });
    assert.equal(res.status, 400);
  });
});
