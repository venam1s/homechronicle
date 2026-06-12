/**
 * emails.test.js — Tests for listener/src/emails.js
 *
 * Requirements covered:
 *   EMAIL-01 — initEmail() calls verify(); non-fatal on failure; disables transport on error
 *   EMAIL-03 — sendInvite() calls transporter.sendMail with correct to/subject/html
 *   EMAIL-04 — sendPasswordReset() calls transporter.sendMail with correct to/subject
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// We'll test emails.js by directly manipulating its module-level transporter via
// a dedicated test hook or by using a separate module-scoped approach.
// emails.js exports initEmail, sendInvite, sendPasswordReset, sendAlertEmail, isEmailEnabled.

// Use a test-transport injection approach: emails.js accepts a config with
// an optional _testTransport override for testability.

// Import the module under test
import {
  initEmail,
  sendInvite,
  sendPasswordReset,
  sendAlertEmail,
  isEmailEnabled,
} from '../src/emails.js';

// -- Helper: create a mock transporter --
function makeMockTransport({ verifyResult = 'ok', sendMailResult = 'ok' } = {}) {
  const calls = { sendMail: [] };
  return {
    calls,
    verify: async () => {
      if (verifyResult === 'throw') throw new Error('SMTP verify failed (mock)');
    },
    sendMail: async (opts) => {
      if (sendMailResult === 'throw') throw new Error('SMTP send failed (mock)');
      calls.sendMail.push(opts);
      return { messageId: 'mock-id' };
    },
  };
}

// Reset transport state between tests by calling initEmail with no-config
async function resetTransport() {
  // Calling initEmail with no host/smtpPass resets transporter to null
  await initEmail({ host: '', smtpPass: '' });
}

// -- EMAIL-01: initEmail graceful degrade on missing config --

test('initEmail: missing host → email disabled (isEmailEnabled false)', async () => {
  await initEmail({ host: '', smtpPass: 'secret' });
  assert.equal(isEmailEnabled(), false, 'isEmailEnabled should be false when host is missing');
});

test('initEmail: missing smtpPass → email disabled (isEmailEnabled false)', async () => {
  await initEmail({ host: 'smtp.example.com', smtpPass: '' });
  assert.equal(isEmailEnabled(), false, 'isEmailEnabled should be false when smtpPass is missing');
});

test('initEmail: verify() rejection is non-fatal — does not throw, leaves isEmailEnabled false', async () => {
  const mockTransport = makeMockTransport({ verifyResult: 'throw' });
  // Inject mock transport via config._testTransport
  await assert.doesNotReject(
    () => initEmail({
      host: 'smtp.example.com',
      port: 587,
      user: 'user@example.com',
      smtpPass: 'secret',
      from: 'noreply@example.com',
      secure: false,
      _testTransport: mockTransport,
    }),
    'initEmail must not throw even when verify() rejects',
  );
  assert.equal(isEmailEnabled(), false, 'isEmailEnabled should be false after verify() failure');
});

test('initEmail: verify() success → isEmailEnabled true', async () => {
  const mockTransport = makeMockTransport({ verifyResult: 'ok' });
  await initEmail({
    host: 'smtp.example.com',
    port: 587,
    user: 'user@example.com',
    smtpPass: 'secret',
    from: 'noreply@example.com',
    secure: false,
    _testTransport: mockTransport,
  });
  assert.equal(isEmailEnabled(), true, 'isEmailEnabled should be true after successful verify');
  await resetTransport();
});

// -- EMAIL-03: sendInvite --

test('sendInvite: throws "Email not configured" when email disabled', async () => {
  await resetTransport();
  assert.equal(isEmailEnabled(), false, 'precondition: email disabled');
  await assert.rejects(
    () => sendInvite('user@example.com', 'https://example.com/invite?token=abc', { from: 'noreply@example.com' }),
    (err) => err.message === 'Email not configured',
    'sendInvite should throw "Email not configured" when transporter is null',
  );
});

test('sendInvite: calls sendMail with correct to, subject, and body containing the invite URL', async () => {
  const mockTransport = makeMockTransport();
  await initEmail({
    host: 'smtp.example.com',
    port: 587,
    user: 'user@example.com',
    smtpPass: 'secret',
    from: 'noreply@example.com',
    secure: false,
    _testTransport: mockTransport,
  });
  assert.equal(isEmailEnabled(), true, 'precondition: email enabled');

  const inviteUrl = 'https://hc.example.com/accept-invite?token=TEST123';
  await sendInvite('recipient@example.com', inviteUrl, { from: 'noreply@hc.example.com' });

  assert.equal(mockTransport.calls.sendMail.length, 1, 'sendMail should be called once');
  const call = mockTransport.calls.sendMail[0];
  assert.equal(call.to, 'recipient@example.com', 'to field should match');
  assert.ok(call.subject.includes('invited'), 'subject should mention invite');
  // Body (text or html) should contain the invite URL
  const bodyText = (call.text ?? '') + (call.html ?? '');
  assert.ok(bodyText.includes(inviteUrl), 'body should contain the invite URL');
  await resetTransport();
});

// -- EMAIL-04: sendPasswordReset --

test('sendPasswordReset: throws "Email not configured" when email disabled', async () => {
  await resetTransport();
  await assert.rejects(
    () => sendPasswordReset('user@example.com', 'https://example.com/reset?token=xyz', { from: 'noreply@example.com' }),
    (err) => err.message === 'Email not configured',
    'sendPasswordReset should throw "Email not configured" when transporter is null',
  );
});

// Regression: auth-router calls sendPasswordReset(to, url) with NO options arg.
// The signature must default the options object so it throws the clean
// "Email not configured" instead of "Cannot destructure property 'from' of
// 'undefined'" (which crashed the fire-and-forget forgot-password path).
test('sendPasswordReset: no options arg → "Email not configured", not a destructure TypeError', async () => {
  await resetTransport();
  await assert.rejects(
    () => sendPasswordReset('user@example.com', 'https://example.com/reset?token=xyz'),
    (err) => err.message === 'Email not configured',
    'sendPasswordReset() with no opts must not throw a destructure TypeError',
  );
});

test('sendInvite: no options arg → "Email not configured", not a destructure TypeError', async () => {
  await resetTransport();
  await assert.rejects(
    () => sendInvite('user@example.com', 'https://example.com/invite?token=abc'),
    (err) => err.message === 'Email not configured',
    'sendInvite() with no opts must not throw a destructure TypeError',
  );
});

test('sendPasswordReset: calls sendMail with correct to and body containing the reset URL', async () => {
  const mockTransport = makeMockTransport();
  await initEmail({
    host: 'smtp.example.com',
    port: 587,
    user: 'user@example.com',
    smtpPass: 'secret',
    from: 'noreply@example.com',
    secure: false,
    _testTransport: mockTransport,
  });

  const resetUrl = 'https://hc.example.com/reset-password?token=RESET456';
  await sendPasswordReset('user@example.com', resetUrl, { from: 'noreply@hc.example.com' });

  assert.equal(mockTransport.calls.sendMail.length, 1, 'sendMail should be called once');
  const call = mockTransport.calls.sendMail[0];
  assert.equal(call.to, 'user@example.com', 'to field should match');
  assert.ok(call.subject.toLowerCase().includes('password'), 'subject should mention password');
  const bodyText = (call.text ?? '') + (call.html ?? '');
  assert.ok(bodyText.includes(resetUrl), 'body should contain the reset URL');
  await resetTransport();
});

// -- sendAlertEmail: stub behavior --

test('sendAlertEmail: throws "Email not configured" when email disabled', async () => {
  await resetTransport();
  await assert.rejects(
    () => sendAlertEmail('user@example.com', 'Alert', 'Alert body', { from: 'noreply@example.com' }),
    (err) => err.message === 'Email not configured',
    'sendAlertEmail should throw "Email not configured" when transporter is null',
  );
});
