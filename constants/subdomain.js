// Format + reserved-word rules for business subdomain slugs. This is the
// single source of truth — both the /register schema (final submit) and
// GET /register/check-subdomain (live availability check) import from
// here, so the two never drift out of sync.
//
// Note: this only reserves the slug as a unique DB value today — there is
// no live *.tellmewhen.co.uk DNS/routing wired up yet. That's a separate
// infra project.

export const SUBDOMAIN_MIN_LENGTH = 3;
export const SUBDOMAIN_MAX_LENGTH = 63;

// Lowercase letters, digits, hyphens; can't start or end with a hyphen —
// standard DNS label rules.
export const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// Deliberately generous — cheap to extend later, expensive to relax once
// businesses have registered against it. `api` is required: it's the real
// production API host (api.tellmewhen.co.uk).
export const RESERVED_SUBDOMAINS = new Set([
  'api', 'www', 'admin', 'mail', 'ftp', 'app', 'staging', 'dev', 'test',
  'localhost', 'root', 'support', 'help', 'status', 'blog', 'docs',
  'assets', 'static', 'cdn', 'ns1', 'ns2', 'smtp', 'imap', 'pop',
  'webmail', 'portal', 'dashboard', 'console', 'secure', 'vpn',
]);

export const isReservedSubdomain = (subdomain) =>
  RESERVED_SUBDOMAINS.has(subdomain.toLowerCase());
