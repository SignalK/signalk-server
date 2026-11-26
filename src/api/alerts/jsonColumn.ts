/**
 * Reading the JSON blob columns the alerts tables use for structured fields.
 */

/**
 * A malformed blob costs the one field it holds, not the whole record.
 * Dropping an active alarm because its detail JSON is unreadable would be
 * worse than losing the detail.
 */
export function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

/**
 * Narrow a parsed blob to the object shape its field claims to hold.
 *
 * A stored `"text"`, `5` or `true` parses fine and would otherwise be handed
 * to consumers typed as an object.
 */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
