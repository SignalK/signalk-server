export const LOGIN_RATE_LIMIT_MESSAGE =
  'Too many login attempts from this IP, please try again later'

export interface LoginRateLimiter {
  check(ip: string): { allowed: boolean; retryAfterMs: number }
  dispose(): void
}

interface Entry {
  count: number
  resetTime: number
}

export function createLoginRateLimiter(
  windowMs: number,
  max: number
): LoginRateLimiter {
  const entries = new Map<string, Entry>()

  const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [ip, entry] of entries) {
      if (now >= entry.resetTime) {
        entries.delete(ip)
      }
    }
  }, windowMs)
  cleanup.unref()

  return {
    check(ip: string): { allowed: boolean; retryAfterMs: number } {
      const now = Date.now()
      let entry = entries.get(ip)

      if (!entry || now >= entry.resetTime) {
        entry = { count: 0, resetTime: now + windowMs }
        entries.set(ip, entry)
      }

      entry.count++

      if (entry.count > max) {
        return { allowed: false, retryAfterMs: entry.resetTime - now }
      }

      return { allowed: true, retryAfterMs: 0 }
    },
    dispose(): void {
      clearInterval(cleanup)
      entries.clear()
    }
  }
}
