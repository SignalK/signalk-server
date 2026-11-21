const UNSAFE_IDENTIFIER_CHARS = /[/\\\0]/

// Usernames and device client ids name per-principal storage directories,
// so they must be usable as a single path segment.
export function isSafeIdentifier(identifier: unknown): identifier is string {
  return (
    typeof identifier === 'string' &&
    identifier.length > 0 &&
    identifier !== '.' &&
    identifier !== '..' &&
    !UNSAFE_IDENTIFIER_CHARS.test(identifier)
  )
}
