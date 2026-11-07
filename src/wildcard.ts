/**
 * Compiles a pattern in which `*` matches any run of characters (including
 * none) and every other character matches itself.
 *
 * Patterns arrive from unauthenticated WebSocket subscriptions, so matching
 * must not backtrack: a regex built from chained `*`s takes exponential time
 * in the number of wildcards. Matching here is a greedy scan, linear in the
 * pattern times the value length.
 */
export function wildcardMatcher(pattern: string): (value: string) => boolean {
  const parts = pattern.split('*')
  if (parts.length === 1) {
    return (value) => value === pattern
  }
  const head = parts[0]
  const tail = parts[parts.length - 1]
  const middle = parts.slice(1, -1).filter((part) => part !== '')
  const minLength = head.length + tail.length

  return (value) => {
    if (
      value.length < minLength ||
      !value.startsWith(head) ||
      !value.endsWith(tail)
    ) {
      return false
    }
    const end = value.length - tail.length
    let position = head.length
    for (const part of middle) {
      const index = value.indexOf(part, position)
      if (index === -1 || index + part.length > end) {
        return false
      }
      position = index + part.length
    }
    return true
  }
}
