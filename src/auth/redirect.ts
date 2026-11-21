/**
 * Accepts only same-origin relative paths so a `redirect` query parameter
 * cannot be turned into an open redirect: must start with a single `/`, no
 * backslashes, no control characters.
 */
export function isSafeRelativeUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url) {
    return false
  }
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) {
    return false
  }
  for (let i = 0; i < url.length; i++) {
    if (url.charCodeAt(i) < 32) {
      return false
    }
  }
  return true
}

export function safeRelativeUrlOr(url: unknown, fallback: string): string {
  return isSafeRelativeUrl(url) ? url : fallback
}

const LOGIN_PAGE = '/admin/#/login'

/**
 * Login page URL carrying an error message from a failed provider login.
 */
export function loginErrorUrl(message: string): string {
  return `${LOGIN_PAGE}?authError=true&message=${encodeURIComponent(message)}`
}
