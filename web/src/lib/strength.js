/**
 * Client-side password strength utility (D-16, no zxcvbn).
 * Mirrors server-side validatePasswordStrength() logic in listener/src/security.js for UX only.
 * The server is ALWAYS authoritative — this file drives the 3-segment strength meter only.
 *
 * Tiers per UI-SPEC (21-UI-SPEC § Strength Meter Feedback):
 *   weak   — empty OR < 10 chars OR blocklisted
 *   fair   — 10–14 chars, not blocklisted
 *   strong — 15+ chars, not blocklisted
 *
 * No React imports. No zxcvbn. Pure JS — safe to import from any page component.
 */

// Representative client-side subset of the server COMMON_PASSWORDS blocklist.
// This is UX feedback only; the server re-validates on every password-set route.
// Keep smaller than the server-side list — covers the most commonly typed entries.
const CLIENT_COMMON_PASSWORDS = new Set([
  '123456', 'password', '12345678', 'qwerty', '123456789',
  '12345', '1234', '111111', '1234567', 'dragon',
  '123123', 'baseball', 'abc123', 'football', 'monkey',
  'letmein', 'shadow', 'master', 'sunshine', 'princess',
  'welcome', 'admin', 'login', 'iloveyou', 'pass',
  'qwerty123', 'password1', 'starwars', 'access', 'batman',
  'trustno1', 'superman', 'mustang', 'michael', 'jessica',
  // Numeric sequences >= 10 chars
  '0987654321', '1234567890', '9876543210', '1111111111', '0000000000',
  '1234512345', '0123456789',
  // Longer common patterns
  'qwertyuiop', 'asdfghjkl', '1q2w3e4r5t', 'passw0rd', 'p@ssword',
  'administrator', 'changeme', 'rootroot', 'adminadmin',
  'iloveyou1', 'iloveyou12', 'password12', 'password123',
  'hello123', 'hello1234', 'hello12345', 'monkey123', 'dragon123',
  'facebook', 'internet', 'computer', 'letmein123', 'welcome123',
  // Self-referential
  'homechronicle',
]);

/**
 * Determine the password strength tier for the 3-segment UI meter.
 * @param {string} password - The password to evaluate.
 * @returns {'weak' | 'fair' | 'strong'}
 */
export function passwordStrengthTier(password) {
  if (!password || password.length < 10 || CLIENT_COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'weak';
  }
  if (password.length < 15) {
    return 'fair';
  }
  return 'strong';
}

/**
 * Return the exact UI-SPEC feedback copy string for the strength meter caption.
 * Matches 21-UI-SPEC § Copywriting Contract — Strength meter feedback.
 * @param {string} password - The password to evaluate.
 * @returns {string} Feedback copy to display below the strength meter.
 */
export function strengthFeedback(password) {
  if (!password || password.length < 10) {
    return 'At least 10 characters required';
  }
  if (CLIENT_COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'That password is too common. Choose something more unique.';
  }
  if (password.length < 15) {
    return 'Fair — try a longer passphrase';
  }
  return 'Strong';
}
