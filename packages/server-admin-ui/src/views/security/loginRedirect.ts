// Matches /admin/#/login (with optional trailing slash before #) followed by
// end-of-string, /, or ? — used as a loop guard so a stale link cannot send a
// freshly logged-in user back to the login page.
const ADMIN_LOGIN_LOOP_RE = /^\/admin\/?#\/login(?:[/?]|$)/

/**
 * Validate a redirect target is a safe same-origin relative URL.
 * Mirrors the server-side `isSafeRelativeUrl` in src/oidc/oidc-auth.ts plus a
 * loop guard for the admin login route.
 */
export function isSafeRedirect(url: unknown): url is string {
  if (typeof url !== 'string' || !url) {
    return false
  }
  if (!url.startsWith('/') || url.startsWith('//')) {
    return false
  }
  if (url.includes('\\')) {
    return false
  }
  for (let i = 0; i < url.length; i++) {
    if (url.charCodeAt(i) < 32) {
      return false
    }
  }
  if (ADMIN_LOGIN_LOOP_RE.test(url)) {
    return false
  }
  return true
}

/**
 * Append a `redirect` query parameter to a URL, URL-encoding the value.
 * Returns the URL unchanged when `redirect` is null.
 */
export function appendRedirectParam(
  url: string,
  redirect: string | null
): string {
  if (!redirect) {
    return url
  }
  const hashIndex = url.indexOf('#')
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex)
  const fragment = hashIndex === -1 ? '' : url.slice(hashIndex)
  const separator = base.includes('?') ? '&' : '?'
  return `${base}${separator}redirect=${encodeURIComponent(redirect)}${fragment}`
}
