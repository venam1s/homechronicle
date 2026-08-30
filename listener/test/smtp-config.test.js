/**
 * smtp-config.test.js — Tests for listener/src/smtp-config.js
 *
 * Requirements covered:
 *   M-10 — buildSmtpConfig() requireTLS field defaults to true; SMTP_REQUIRE_TLS
 *          env var is an explicit opt-out (same truthy parse as SMTP_SECURE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSmtpConfig } from '../src/smtp-config.js';

// -- Helper: save/restore SMTP_REQUIRE_TLS around each test so ordering cannot leak --

function withRequireTlsEnv(value, fn) {
  const orig = process.env.SMTP_REQUIRE_TLS;
  if (value === undefined) {
    delete process.env.SMTP_REQUIRE_TLS;
  } else {
    process.env.SMTP_REQUIRE_TLS = value;
  }
  try {
    return fn();
  } finally {
    if (orig === undefined) {
      delete process.env.SMTP_REQUIRE_TLS;
    } else {
      process.env.SMTP_REQUIRE_TLS = orig;
    }
  }
}

test('buildSmtpConfig: SMTP_REQUIRE_TLS unset -> requireTLS true (default)', () => {
  withRequireTlsEnv(undefined, () => {
    const config = buildSmtpConfig({ host: 'smtp.example.com', port: 587 }, 'secret');
    assert.equal(config.requireTLS, true);
  });
});

test('buildSmtpConfig: SMTP_REQUIRE_TLS="false" -> requireTLS false', () => {
  withRequireTlsEnv('false', () => {
    const config = buildSmtpConfig({ host: 'smtp.example.com', port: 587 }, 'secret');
    assert.equal(config.requireTLS, false);
  });
});

test('buildSmtpConfig: SMTP_REQUIRE_TLS="0" -> requireTLS false', () => {
  withRequireTlsEnv('0', () => {
    const config = buildSmtpConfig({ host: 'smtp.example.com', port: 587 }, 'secret');
    assert.equal(config.requireTLS, false);
  });
});

test('buildSmtpConfig: SMTP_REQUIRE_TLS="off" -> requireTLS false', () => {
  withRequireTlsEnv('off', () => {
    const config = buildSmtpConfig({ host: 'smtp.example.com', port: 587 }, 'secret');
    assert.equal(config.requireTLS, false);
  });
});

test('buildSmtpConfig: SMTP_REQUIRE_TLS="true" -> requireTLS true', () => {
  withRequireTlsEnv('true', () => {
    const config = buildSmtpConfig({ host: 'smtp.example.com', port: 587 }, 'secret');
    assert.equal(config.requireTLS, true);
  });
});
