// localStorage access can throw in restricted-storage contexts (Safari
// private mode, browsers with site data blocked), so every read and
// write is wrapped and degrades to the caller's fallback.

export function readString<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T
): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage?.getItem(key)
    if (raw && (allowed as readonly string[]).includes(raw)) return raw as T
    return fallback
  } catch {
    return fallback
  }
}

export function writeString(key: string, value: string): void {
  try {
    window.localStorage?.setItem(key, value)
  } catch {
    // localStorage unavailable (private mode); silently ignore.
  }
}

// Returns undefined for missing keys, invalid JSON, and unavailable
// storage alike — callers validate the shape before trusting the value.
export function readJson(key: string): unknown {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage?.getItem(key)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage unavailable (private mode); silently ignore.
  }
}
