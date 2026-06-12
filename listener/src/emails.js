/**
 * emails.js — nodemailer SMTP transport lifecycle and email send functions.
 *
 * Transport is module-level singleton, initialized at startup via initEmail().
 * Failure is non-fatal: if SMTP is unconfigured or verify() fails, email features
 * are silently disabled (EMAIL-01). Callers check isEmailEnabled() before sending.
 *
 * Public surface:
 *   initEmail(config)                               — init or reset transport
 *   sendInvite(to, inviteUrl, { from })             — EMAIL-03
 *   sendPasswordReset(to, resetUrl, { from })       — EMAIL-04
 *   sendAlertEmail(to, subject, body, { from })     — stub (Phase 22)
 *   isEmailEnabled()                                — true when transporter is ready
 */

import nodemailer from 'nodemailer';
import { log } from './logger.js';

// Module-level singleton — null means email is disabled
let transporter = null;

/**
 * Initialize the nodemailer SMTP transport from config + secret.
 * Called once at startup from index.js (EMAIL-01).
 * Non-fatal: if SMTP is not configured or verify() fails, transporter stays null.
 *
 * @param {{ host?: string, port?: number, user?: string, smtpPass?: string, from?: string, secure?: boolean, _testTransport?: object }} config
 *   _testTransport: optional mock transport injected in tests (avoids real network calls)
 */
export async function initEmail(config) {
  // Reset in case of re-initialization
  transporter = null;

  if (!config.host || !config.smtpPass) {
    log.warn('[email] SMTP not configured — email features disabled');
    return;
  }

  const port = config.port ?? 587;
  const secure = typeof config.secure === 'boolean' ? config.secure : port === 465;

  // Allow test injection via _testTransport; never use in production
  const transport = config._testTransport ?? nodemailer.createTransport({
    host: config.host,
    port,
    secure,
    auth: {
      user: config.user,
      pass: config.smtpPass,
    },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
    greetingTimeout: 10_000,
  });

  try {
    await transport.verify();
    log.info('[email] SMTP transport verified OK');
    transporter = transport;
  } catch (err) {
    log.error('[email] SMTP verify failed — email features disabled:', err.message);
    transporter = null;
  }
}

/**
 * Send an invite email to a new user.
 * @param {string} to — recipient email
 * @param {string} inviteUrl — full accept-invite URL with token
 * @param {{ from: string }} opts
 * @throws {Error} 'Email not configured' when transporter is null
 */
export async function sendInvite(to, inviteUrl, { from } = {}) {
  if (!transporter) throw new Error('Email not configured');
  await transporter.sendMail({
    from,
    to,
    subject: 'You have been invited to HomeChronicle',
    text: `You have been invited to HomeChronicle. Accept your invitation within 72 hours:\n\n${inviteUrl}\n`,
    html: `<p>You have been invited to HomeChronicle.</p><p>Accept your invitation within 72 hours:</p><p><a href="${inviteUrl}">${inviteUrl}</a></p>`,
  });
}

/**
 * Send a password reset email.
 * @param {string} to — recipient email
 * @param {string} resetUrl — full reset-confirm URL with token
 * @param {{ from: string }} opts
 * @throws {Error} 'Email not configured' when transporter is null
 */
export async function sendPasswordReset(to, resetUrl, { from } = {}) {
  if (!transporter) throw new Error('Email not configured');
  await transporter.sendMail({
    from,
    to,
    subject: 'Reset your HomeChronicle password',
    text: `Reset your HomeChronicle password within 1 hour:\n\n${resetUrl}\n`,
    html: `<p>Reset your HomeChronicle password within 1 hour:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });
}

/**
 * Send an alert email. Stubbed for Phase 22 — alert email channel.
 * Defined here so Phase 22 can wire it without modifying emails.js.
 *
 * @param {string} to
 * @param {string} subject
 * @param {string} body
 * @param {{ from: string }} opts
 * @throws {Error} 'Email not configured' when transporter is null
 */
export async function sendAlertEmail(to, subject, body, { from } = {}) {
  if (!transporter) throw new Error('Email not configured');
  await transporter.sendMail({ from, to, subject, text: body });
}

/**
 * Returns true when the SMTP transport has been successfully initialized.
 * @returns {boolean}
 */
export function isEmailEnabled() {
  return transporter !== null;
}
