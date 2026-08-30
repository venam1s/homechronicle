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

// -- Internal helpers --

/**
 * Escape untrusted plain text for safe embedding in HTML.
 * Escapes the five HTML-significant characters (& first), then converts
 * newlines to <br> so multi-line plain-text bodies preserve line breaks.
 *
 * @param {string} str — untrusted input
 * @returns {string} — HTML-safe string
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>');
}

/**
 * Escape untrusted text for safe embedding inside an HTML attribute value
 * (e.g. href="...") (L-4). Escapes the same five HTML-significant characters
 * as escapeHtml, but deliberately WITHOUT its \n -> <br> transform, which is
 * wrong inside an attribute. Current URL slots (invite/reset tokens, the
 * admin-configured APP_BASE_URL) are hex-token-only or operator-controlled,
 * so this is defence in depth against a future regression, not a fix for a
 * reachable issue today.
 *
 * @param {string} str — untrusted input
 * @returns {string} — attribute-safe string
 */
function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a complete, email-client-safe branded HTML email.
 * Table-based layout, all CSS inline, no <style> blocks, no external assets.
 * The "homechronicle" wordmark uses styled-text spans (no inline SVG).
 *
 * @param {{ heading: string, bodyHtml: string, ctaLabel?: string, ctaUrl?: string, footerNote?: string }} opts
 *   heading   — heading line rendered above bodyHtml (trusted caller markup)
 *   bodyHtml  — pre-trusted or pre-escaped HTML content (injected as-is)
 *   ctaLabel  — CTA button label; omit to suppress the button (e.g. alert emails)
 *   ctaUrl    — CTA button href; omit to suppress the button
 *   footerNote — optional short note below the generic footer line
 * @returns {string} — complete HTML email document
 */
function renderEmailLayout({ heading, bodyHtml, ctaLabel, ctaUrl, footerNote }) {
  // heading is always plain text (bodyHtml is the markup slot). Escape it so
  // untrusted sources — e.g. an alert subject built from device/room names —
  // cannot inject markup into <title> or the heading line.
  const safeHeading = escapeHtml(heading);
  const showCta = ctaUrl && ctaLabel;
  const ctaBlock = showCta
    ? `
      <tr>
        <td style="padding: 24px 32px 8px 32px; text-align: center;">
          <a href="${escapeAttr(ctaUrl)}"
             style="display: inline-block; background-color: #1d4ed8; color: #ffffff;
                    font-family: Arial, Helvetica, sans-serif; font-size: 15px;
                    font-weight: bold; text-decoration: none; padding: 12px 28px;
                    border-radius: 6px; letter-spacing: 0.01em;">
            ${ctaLabel}
          </a>
        </td>
      </tr>`
    : '';

  const footerExtra = footerNote
    ? `<br><span style="color: #6b7280;">${footerNote}</span>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeHeading}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color: #f3f4f6; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="background-color: #ffffff; border-radius: 8px;
                      border: 1px solid #e5e7eb; overflow: hidden;">
          <!-- Header brand bar -->
          <tr>
            <td style="background-color: #dbeafe; padding: 20px 32px;">
              <span style="font-family: Arial, Helvetica, sans-serif; font-size: 22px;
                           font-weight: bold; color: #111827; letter-spacing: -0.01em;">home</span><span
                    style="font-family: Arial, Helvetica, sans-serif; font-size: 22px;
                           font-weight: bold; color: #1d4ed8; letter-spacing: -0.01em;">chronicle</span>
            </td>
          </tr>
          <!-- Heading -->
          <tr>
            <td style="padding: 32px 32px 8px 32px;">
              <p style="margin: 0; font-family: Arial, Helvetica, sans-serif;
                        font-size: 20px; font-weight: bold; color: #111827;">
                ${safeHeading}
              </p>
            </td>
          </tr>
          <!-- Body content -->
          <tr>
            <td style="padding: 16px 32px 8px 32px; font-family: Arial, Helvetica, sans-serif;
                       font-size: 15px; color: #374151; line-height: 1.6;">
              ${bodyHtml}
            </td>
          </tr>
          ${ctaBlock}
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px 32px 32px; border-top: 1px solid #e5e7eb;
                       margin-top: 24px;">
              <p style="margin: 0; font-family: Arial, Helvetica, sans-serif;
                        font-size: 12px; color: #6b7280; text-align: center;">
                HomeChronicle${footerExtra}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Build the nodemailer transport options for the given SMTP config.
 * Pure function — no I/O, safe to unit test without a real transport.
 *
 * `requireTLS` forces a STARTTLS upgrade before AUTH is attempted on a plaintext
 * connection (M-10): without it, a relay that doesn't advertise STARTTLS — or an
 * on-path attacker stripping it from EHLO — gets the SMTP password in cleartext.
 * On `secure: true` (implicit TLS, e.g. port 465) the connection is already
 * encrypted from the first byte, so `requireTLS` is meaningless there and is
 * forced to false. Everywhere else it defaults to true; `config.requireTLS === false`
 * is an explicit opt-out for a legacy relay that cannot do TLS.
 *
 * `disableFileAccess`/`disableUrlAccess` (I-1) are always on — this app never
 * passes `raw`/`attachments`/`path`/`href` to sendMail, so this is defence in
 * depth against a future regression, not a fix for a reachable issue today.
 *
 * @param {{ host: string, port: number, secure: boolean, user?: string, smtpPass?: string, requireTLS?: boolean }} config
 * @returns {object} — options object suitable for nodemailer.createTransport()
 */
export function buildTransportOptions(config) {
  const { host, port, secure } = config;
  const requireTLS = !secure && (config.requireTLS ?? true);
  return {
    host,
    port,
    secure,
    requireTLS,
    auth: {
      user: config.user,
      pass: config.smtpPass,
    },
    disableFileAccess: true,
    disableUrlAccess: true,
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
    greetingTimeout: 10_000,
  };
}

/**
 * Initialize the nodemailer SMTP transport from config + secret.
 * Called once at startup from index.js (EMAIL-01).
 * Non-fatal: if SMTP is not configured or verify() fails, transporter stays null.
 *
 * @param {{ host?: string, port?: number, user?: string, smtpPass?: string, from?: string, secure?: boolean, requireTLS?: boolean, _testTransport?: object }} config
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
  const transport = config._testTransport ?? nodemailer.createTransport(buildTransportOptions({ ...config, port, secure }));

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
    html: renderEmailLayout({
      heading: 'You have been invited to HomeChronicle',
      bodyHtml: `<p style="margin: 0 0 12px 0;">You have been invited to join HomeChronicle. Accept your invitation within 72 hours:</p>
<p style="margin: 0; word-break: break-all;"><a href="${escapeAttr(inviteUrl)}" style="color: #1d4ed8;">${escapeAttr(inviteUrl)}</a></p>`,
      ctaLabel: 'Accept invitation',
      ctaUrl: inviteUrl,
      footerNote: 'This invitation expires in 72 hours.',
    }),
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
    html: renderEmailLayout({
      heading: 'Reset your HomeChronicle password',
      bodyHtml: `<p style="margin: 0 0 12px 0;">Click the button below to reset your password. This link expires in 1 hour:</p>
<p style="margin: 0; word-break: break-all;"><a href="${escapeAttr(resetUrl)}" style="color: #1d4ed8;">${escapeAttr(resetUrl)}</a></p>`,
      ctaLabel: 'Reset password',
      ctaUrl: resetUrl,
      footerNote: 'This link expires in 1 hour. If you did not request a password reset, you can ignore this email.',
    }),
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
  await transporter.sendMail({
    from,
    to,
    subject,
    text: body,
    html: renderEmailLayout({
      heading: subject,
      bodyHtml: escapeHtml(body),
      footerNote: 'HomeChronicle alert',
    }),
  });
}

/**
 * Returns true when the SMTP transport has been successfully initialized.
 * @returns {boolean}
 */
export function isEmailEnabled() {
  return transporter !== null;
}
