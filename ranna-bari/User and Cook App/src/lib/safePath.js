/**
 * A `next` parameter that is safe to navigate to.
 *
 * Several screens hand the customer somewhere to fix a thing (top up the
 * wallet, add an address) and ask to be brought back with `?next=/requests/42`.
 * That parameter arrives from a URL, so it is untrusted: anything other than
 * an in-app path would turn "go back where you were" into an open redirect
 * (`//evil.example`, `https://...`) or a route that does not exist. One rule,
 * one place: a single leading slash, no second slash straight after it, no
 * backslash (browsers treat `/\host` as `//host`), no scheme, no control
 * characters.
 */
export function safeNext(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  let path = raw.trim();
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (!path.startsWith('/')) return null;
  if (path.startsWith('//')) return null;
  if (path.includes('\\')) return null;
  if (/[\u0000-\u001f]/.test(path)) return null;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(path)) return null;
  return path;
}

/** `/wallet?need=..&next=..` — the shortfall and the way back. */
export function walletRoute(short, next) {
  const q = [];
  if (Number.isFinite(short) && short > 0) q.push(`need=${Math.ceil(short)}`);
  if (next) q.push(`next=${encodeURIComponent(next)}`);
  return q.length ? `/wallet?${q.join('&')}` : '/wallet';
}
