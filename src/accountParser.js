'use strict';

/**
 * Account lines use the format: login:password:email:emailPassword
 *
 * Fields are split on ':'. Values that themselves contain ':' (for example a
 * password with a colon) are not supported by this format and would be parsed
 * incorrectly; such lines should be stored in another format upstream.
 *
 * Returns null for blank lines, comment lines (starting with '#'), or lines
 * missing a login/password.
 */
function parseAccountLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const [login, password, email, emailPassword] = trimmed.split(':');
  if (!login || !password) return null;

  return { login, password, email, emailPassword };
}

module.exports = { parseAccountLine };
