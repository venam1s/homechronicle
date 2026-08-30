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
import nodemailer from 'nodemailer';

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

// Create a mock transport, initialize email with the standard good config plus
// any overrides, assert it came up enabled, and return the transport for
// inspection. Cuts the repeated 9-line config block across tests.
async function enableEmail(opts = {}) {
  const mockTransport = makeMockTransport(opts.transportOpts);
  await initEmail({
    host: 'smtp.example.com',
    port: 587,
    user: 'user@example.com',
    smtpPass: 'secret',
    from: 'noreply@example.com',
    secure: false,
    _testTransport: mockTransport,
    ...opts.config,
  });
  assert.equal(isEmailEnabled(), true, 'precondition: email enabled');
  return mockTransport;
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

test('sendInvite: html output contains branded wordmark and invite URL (branding regression)', async () => {
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

  const inviteUrl = 'https://hc.example.com/accept-invite?token=BRAND123';
  await sendInvite('recipient@example.com', inviteUrl, { from: 'noreply@hc.example.com' });

  assert.equal(mockTransport.calls.sendMail.length, 1, 'sendMail should be called once');
  const call = mockTransport.calls.sendMail[0];
  assert.ok(call.html, 'html field must be present');
  assert.ok(call.html.includes('chronicle'), 'html must contain branded wordmark "chronicle"');
  assert.ok(call.html.includes(inviteUrl), 'html must contain the invite URL');
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

// -- sendAlertEmail: branded layout + escaping --

test('sendAlertEmail: happy path — to/from/subject pass through, text unescaped, html is a full document', async () => {
  const mockTransport = await enableEmail();

  await sendAlertEmail('user@example.com', 'Motion detected', 'Front door motion at 10:02pm', { from: 'alerts@hc.example.com' });

  assert.equal(mockTransport.calls.sendMail.length, 1, 'sendMail should be called once');
  const call = mockTransport.calls.sendMail[0];
  assert.equal(call.to, 'user@example.com', 'to passes through verbatim');
  assert.equal(call.from, 'alerts@hc.example.com', 'from passes through verbatim');
  assert.equal(call.subject, 'Motion detected', 'subject passes through verbatim');
  assert.equal(call.text, 'Front door motion at 10:02pm', 'text is the raw unescaped body');
  assert.ok(call.html.startsWith('<!DOCTYPE html>'), 'html is a full document');
  await resetTransport();
});

test('sendAlertEmail: html contains wordmark spans, footer note, and no CTA button', async () => {
  const mockTransport = await enableEmail();

  await sendAlertEmail('user@example.com', 'Motion detected', 'Front door motion', { from: 'alerts@hc.example.com' });

  const call = mockTransport.calls.sendMail[0];
  assert.ok(call.html.includes('>home</span>'), 'html contains the "home" wordmark span');
  assert.ok(call.html.includes('>chronicle</span>'), 'html contains the "chronicle" wordmark span');
  assert.ok(call.html.includes('HomeChronicle alert'), 'html contains the alert footer note');
  assert.ok(!call.html.includes('padding: 12px 28px'), 'html has no CTA button (distinctive inline style absent)');
  assert.ok(!call.html.includes('<a '), 'html has no anchor tag at all — alert bodies are plain text');
  await resetTransport();
});

test('sendAlertEmail: HTML-injection hardening — script tag in subject is escaped, not executed', async () => {
  const mockTransport = await enableEmail();
  const subject = '<script>alert(1)</script> Motion';

  await sendAlertEmail('user@example.com', subject, 'body', { from: 'alerts@hc.example.com' });

  const call = mockTransport.calls.sendMail[0];
  assert.ok(!call.html.includes('<script>'), 'html must not contain a raw <script> tag');
  assert.ok(call.html.includes('&lt;script&gt;'), 'html must contain the escaped form');
  const titleMatch = call.html.match(/<title>([\s\S]*?)<\/title>/);
  assert.ok(titleMatch, '<title> element must be present');
  assert.ok(titleMatch[1].includes('&lt;script&gt;'), '<title> contains the escaped form');
  assert.ok(!titleMatch[1].includes('<script>'), '<title> does not contain the raw tag');
  assert.equal(call.subject, subject, 'the raw subject is preserved on the mail header (not HTML)');
  await resetTransport();
});

test('sendAlertEmail: HTML-injection hardening — body markup and entities are escaped', async () => {
  const mockTransport = await enableEmail();
  const body = 'Tom & Jerry <b>"bold"</b> it\'s';

  await sendAlertEmail('user@example.com', 'Subj', body, { from: 'alerts@hc.example.com' });

  const call = mockTransport.calls.sendMail[0];
  assert.ok(
    call.html.includes('Tom &amp; Jerry &lt;b&gt;&quot;bold&quot;&lt;/b&gt; it&#39;s'),
    'html contains the fully escaped body',
  );
  assert.ok(!call.html.includes('<b>'), 'html must not contain the raw <b> tag');
  await resetTransport();
});

test('sendAlertEmail: & is escaped first — no double-escaping of pre-existing entities', async () => {
  const mockTransport = await enableEmail();

  await sendAlertEmail('user@example.com', 'Subj', 'a &lt; b', { from: 'alerts@hc.example.com' });

  const call = mockTransport.calls.sendMail[0];
  assert.ok(call.html.includes('a &amp;lt; b'), 'the literal "&lt;" text is escaped to "&amp;lt;"');
  assert.ok(!call.html.includes('&amp;amp;'), 'must not double-escape the ampersand');
  await resetTransport();
});

test('sendAlertEmail: newlines become <br> in html but stay literal in text', async () => {
  const mockTransport = await enableEmail();

  await sendAlertEmail('user@example.com', 'Subj', 'line one\nline two', { from: 'alerts@hc.example.com' });

  const call = mockTransport.calls.sendMail[0];
  assert.ok(call.html.includes('line one<br>line two'), 'html converts \\n to <br>');
  assert.ok(call.text.includes('line one\nline two'), 'text keeps the literal newline');
  await resetTransport();
});

test('sendAlertEmail: non-string body is coerced, not thrown', async () => {
  const mockTransport = await enableEmail();

  await assert.doesNotReject(
    () => sendAlertEmail('user@example.com', 'Subj', 42, { from: 'alerts@hc.example.com' }),
    'a numeric body must not throw',
  );
  const call = mockTransport.calls.sendMail[0];
  assert.ok(call.html.includes('42'), 'html contains the coerced body value');
  await resetTransport();
});

// -- sendInvite / sendPasswordReset: layout --

test('sendInvite: html has CTA anchor, expiry footer note, and escaped title', async () => {
  const mockTransport = await enableEmail();
  const inviteUrl = 'https://hc.example.com/accept-invite?token=LAYOUT1';

  await sendInvite('recipient@example.com', inviteUrl, { from: 'noreply@hc.example.com' });

  const call = mockTransport.calls.sendMail[0];
  assert.ok(call.html.includes(`href="${inviteUrl}"`), 'CTA anchor href matches the invite URL');
  assert.ok(call.html.includes('Accept invitation'), 'CTA label is "Accept invitation"');
  assert.ok(call.html.includes('This invitation expires in 72 hours.'), 'footer note present');
  assert.ok(call.html.includes('<title>You have been invited to HomeChronicle</title>'), 'title element present');
  const occurrences = call.html.split(inviteUrl).length - 1;
  assert.ok(occurrences >= 2, 'the invite URL appears at least twice (link paragraph + CTA button)');
  await resetTransport();
});

test('sendPasswordReset: html has CTA anchor, expiry footer note; text carries the raw URL', async () => {
  const mockTransport = await enableEmail();
  const resetUrl = 'https://hc.example.com/reset-password?token=LAYOUT2';

  await sendPasswordReset('user@example.com', resetUrl, { from: 'noreply@hc.example.com' });

  const call = mockTransport.calls.sendMail[0];
  assert.ok(call.html.includes(`href="${resetUrl}"`), 'CTA anchor href matches the reset URL');
  assert.ok(call.html.includes('Reset password'), 'CTA label is "Reset password"');
  assert.ok(call.html.includes('This link expires in 1 hour.'), 'footer note present');
  assert.ok(call.text.includes(resetUrl), 'text contains the raw reset URL');
  const occurrences = call.html.split(resetUrl).length - 1;
  assert.ok(occurrences >= 2, 'the reset URL appears at least twice (link paragraph + CTA button)');
  await resetTransport();
});

// -- Email-client-safety constraints (renderEmailLayout contract) --

test('all three senders: html is table-based, all CSS inline, no style/svg/script/img/link tags', async () => {
  const mockTransport = await enableEmail();

  await sendAlertEmail('user@example.com', 'Subj', 'body', { from: 'alerts@hc.example.com' });
  await sendInvite('user@example.com', 'https://hc.example.com/accept-invite?token=X', { from: 'noreply@hc.example.com' });
  await sendPasswordReset('user@example.com', 'https://hc.example.com/reset-password?token=X', { from: 'noreply@hc.example.com' });

  assert.equal(mockTransport.calls.sendMail.length, 3, 'all three sends captured');
  for (const call of mockTransport.calls.sendMail) {
    const html = call.html;
    assert.ok(!/<style[\s>]/i.test(html), `no <style> tag (subject: ${call.subject})`);
    assert.ok(!/<svg[\s>]/i.test(html), `no <svg> tag (subject: ${call.subject})`);
    assert.ok(!/<script[\s>]/i.test(html), `no <script> tag (subject: ${call.subject})`);
    assert.ok(!/<img[\s>]/i.test(html), `no <img> tag (subject: ${call.subject})`);
    assert.ok(!/<link[\s>]/i.test(html), `no <link> tag (subject: ${call.subject})`);
    const tableCount = (html.match(/<table/g) || []).length;
    assert.ok(tableCount >= 2, `layout is table-based, >= 2 <table> elements (subject: ${call.subject}, got ${tableCount})`);
  }
  await resetTransport();
});

// -- Error scenarios --

test('sendAlertEmail: sendMail rejection propagates and does not disable the transport', async () => {
  await enableEmail({ transportOpts: { sendMailResult: 'throw' } });

  await assert.rejects(
    () => sendAlertEmail('user@example.com', 'Subj', 'body', { from: 'alerts@hc.example.com' }),
    /SMTP send failed/,
    'sendMail rejection should propagate to the caller',
  );
  assert.equal(isEmailEnabled(), true, 'a single send failure must not disable the transport');
  await resetTransport();
});

test('sendInvite: sendMail rejection propagates and does not disable the transport', async () => {
  await enableEmail({ transportOpts: { sendMailResult: 'throw' } });

  await assert.rejects(
    () => sendInvite('user@example.com', 'https://hc.example.com/accept-invite?token=X', { from: 'noreply@hc.example.com' }),
    /SMTP send failed/,
    'sendMail rejection should propagate to the caller',
  );
  assert.equal(isEmailEnabled(), true, 'a single send failure must not disable the transport');
  await resetTransport();
});

// -- initEmail edge cases --

test('initEmail: re-init after success with a bad config disables email', async () => {
  await enableEmail();

  await initEmail({ host: 'smtp.example.com', smtpPass: '' });
  assert.equal(isEmailEnabled(), false, 'isEmailEnabled should be false after re-init with missing smtpPass');
  await assert.rejects(
    () => sendAlertEmail('user@example.com', 'Subj', 'body', { from: 'alerts@hc.example.com' }),
    (err) => err.message === 'Email not configured',
    'sendAlertEmail should reject with "Email not configured" after the bad re-init',
  );
});

test('initEmail: re-init after success with a verify-throwing transport disables email (not left on the old good transport)', async () => {
  await enableEmail();

  const badTransport = makeMockTransport({ verifyResult: 'throw' });
  await initEmail({
    host: 'smtp.example.com',
    port: 587,
    user: 'user@example.com',
    smtpPass: 'secret',
    from: 'noreply@example.com',
    secure: false,
    _testTransport: badTransport,
  });
  assert.equal(isEmailEnabled(), false, 'isEmailEnabled should be false — transporter must not remain pointed at the old good transport');
  await resetTransport();
});

test('initEmail: secure/port derivation from nodemailer.createTransport (no _testTransport)', async () => {
  let captured;
  const orig = nodemailer.createTransport;
  try {
    nodemailer.createTransport = (o) => {
      captured = o;
      return { verify: async () => {} };
    };

    await initEmail({ host: 'smtp.example.com', smtpPass: 'secret', port: 465 });
    assert.equal(captured.secure, true, 'port 465 implies secure=true');

    await initEmail({ host: 'smtp.example.com', smtpPass: 'secret', port: 587 });
    assert.equal(captured.secure, false, 'port 587 implies secure=false');

    await initEmail({ host: 'smtp.example.com', smtpPass: 'secret', port: 465, secure: false });
    assert.equal(captured.secure, false, 'explicit secure:false wins over the port-465 default');

    await initEmail({ host: 'smtp.example.com', smtpPass: 'secret' });
    assert.equal(captured.port, 587, 'port defaults to 587 when omitted');

    assert.equal(captured.connectionTimeout, 10_000, 'connectionTimeout is 10000');
    assert.equal(captured.socketTimeout, 15_000, 'socketTimeout is 15000');
    assert.equal(captured.greetingTimeout, 10_000, 'greetingTimeout is 10000');
  } finally {
    nodemailer.createTransport = orig;
  }
  await resetTransport();
});
