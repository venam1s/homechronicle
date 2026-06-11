/**
 * smtp-config.js — SMTP configuration helper: env-over-UI merge + secret isolation.
 *
 * The SMTP password (smtpPass) MUST NOT be stored in any store object or API response.
 * It lives exclusively in smtp-secret.json (0600) or overridden by env SMTP_PASS.
 *
 * Public surface:
 *   readSmtpSecret()                           — returns smtpPass (env > file > null)
 *   writeSmtpSecret(smtpPass)                  — persists smtpPass to 0600 file
 *   buildSmtpConfig(storeSnapshot, secret)     — merges env-over-UI for transport config
 *   envOverriddenFields(snapshot)              — list of fields pinned by env vars
 *   getAppBaseUrl()                            — APP_BASE_URL for email link building
 */

import { readFile, writeFile, rename, chmod, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { log } from './logger.js';

// -- File path constants (mirror index.js convention: env > production path > dev path) --
export const SMTP_CONFIG_FILE = process.env.SMTP_CONFIG_FILE
  || (process.env.NODE_ENV === 'production' ? '/app/data/smtp-config.json' : './data/smtp-config.json');

export const SMTP_SECRET_FILE = process.env.SMTP_SECRET_FILE
  || (process.env.NODE_ENV === 'production' ? '/app/data/smtp-secret.json' : './data/smtp-secret.json');

/**
 * Read the SMTP secret (password) from env or the dedicated secret file.
 * Env var wins over file (D-02). Returns null when neither is configured.
 * Never throws on a missing file.
 *
 * @param {string} [secretPath] — optional override for testing
 * @returns {Promise<string|null>}
 */
export async function readSmtpSecret(secretPath) {
  // Env var always wins (D-02)
  if (process.env.SMTP_PASS) return process.env.SMTP_PASS;

  const filePath = secretPath ?? SMTP_SECRET_FILE;
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw).smtpPass ?? null;
  } catch {
    // Missing file or parse error — not configured
    return null;
  }
}

/**
 * Persist the SMTP secret to a dedicated 0600 file using atomic temp-rename.
 * Mirrors store.js write discipline. The password MUST live ONLY here — never
 * in any store object or API response (D-01, EMAIL-04).
 *
 * @param {string} smtpPass
 * @param {string} [secretPath] — optional override for testing
 */
export async function writeSmtpSecret(smtpPass, secretPath) {
  const filePath = secretPath ?? SMTP_SECRET_FILE;
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, JSON.stringify({ smtpPass }), { encoding: 'utf8', mode: 0o600 });
  await rename(tempPath, filePath);
  try {
    await chmod(filePath, 0o600);
  } catch (err) {
    log.debug('[smtp-config] chmod skipped (filesystem may not support POSIX permissions):', err.message);
  }
}

/**
 * Build the SMTP transport configuration by merging a store snapshot with
 * env var overrides (D-02). Env vars always win per field.
 *
 * @param {object} storeSnapshot — non-secret fields from smtpConfigStore.getSnapshot()
 * @param {string|null} secret — smtpPass from readSmtpSecret()
 * @returns {{ host: string, port: number, user: string, from: string, secure: boolean, smtpPass: string|null }}
 */
export function buildSmtpConfig(storeSnapshot, secret) {
  const snap = storeSnapshot ?? {};

  const host = process.env.SMTP_HOST ?? snap.host ?? '';
  const port = Number(process.env.SMTP_PORT ?? snap.port ?? 587);
  const user = process.env.SMTP_USER ?? snap.user ?? '';
  const from = process.env.SMTP_FROM ?? snap.from ?? '';

  // secure: env SMTP_SECURE (truthy) or port===465, fallback to snapshot
  let secure;
  if (process.env.SMTP_SECURE !== undefined) {
    secure = /^(1|true|yes|on)$/i.test(process.env.SMTP_SECURE);
  } else if (snap.secure !== undefined) {
    secure = Boolean(snap.secure);
  } else {
    secure = port === 465;
  }

  return { host, port, user, from, secure, smtpPass: secret ?? null };
}

/**
 * Returns an array of SMTP config field names that are currently overridden
 * by environment variables. Used by the GET /api/setup/smtp response to
 * show "Set via environment variable" notices per field in the UI.
 *
 * @param {object} _snapshot — unused, reserved for future field-level detection
 * @returns {string[]}
 */
export function envOverriddenFields(_snapshot) {
  const pinned = [];
  if (process.env.SMTP_HOST !== undefined) pinned.push('host');
  if (process.env.SMTP_PORT !== undefined) pinned.push('port');
  if (process.env.SMTP_USER !== undefined) pinned.push('user');
  if (process.env.SMTP_FROM !== undefined) pinned.push('from');
  if (process.env.SMTP_SECURE !== undefined) pinned.push('secure');
  if (process.env.SMTP_PASS !== undefined) pinned.push('password');
  return pinned;
}

/**
 * Returns the application base URL used for constructing email links.
 * Falls back to empty string when not configured (RESEARCH Open Question 3).
 *
 * @returns {string}
 */
export function getAppBaseUrl() {
  return (process.env.APP_BASE_URL ?? '').trim();
}
