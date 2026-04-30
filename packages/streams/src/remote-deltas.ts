/*
 * Helpers for incoming remote Signal K deltas. Kept separate from
 * mdns-ws.ts so the logic can be unit-tested without pulling in the
 * untyped @signalk/client / @signalk/signalk-schema dependencies.
 */

export interface RemoteSource {
  label?: string
  type?: string
  canName?: string
  src?: string | number
  talker?: string
  [key: string]: unknown
}

export interface RemoteUpdate {
  $source?: string
  source?: RemoteSource
  [key: string]: unknown
}

/**
 * Decide whether a remote delta update already identifies its source
 * well enough for the local server to reuse that identity. Used to
 * decide whether we need to stamp a fallback $source.
 *
 * The goal is transport-agnostic device identity: a Maretron seen via
 * local YDEN02 and the same Maretron seen via a remote Signal K server
 * should resolve to the same CAN Name. If the remote preserves a
 * canName / src / talker / label in its source object, or ships a
 * $source string directly, we keep that intact.
 */
export function hasIdentifiableSource(update: RemoteUpdate): boolean {
  if (typeof update.$source === 'string' && update.$source.length > 0) {
    return true
  }
  const source = update.source
  if (!source) return false
  return (
    typeof source.canName === 'string' ||
    source.src !== undefined ||
    typeof source.talker === 'string' ||
    (typeof source.label === 'string' && source.label.length > 0)
  )
}

/**
 * Stamp a fallback $source on each remote update that lacks identity,
 * leaving identified updates untouched.
 */
export function stampRemoteUpdates(
  updates: RemoteUpdate[],
  fallbackSourceRef: string
): void {
  for (const update of updates) {
    if (hasIdentifiableSource(update)) continue
    update.$source = fallbackSourceRef
  }
}
