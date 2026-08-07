/*
 * Human-readable names for source references.
 *
 * WebSocket device sources appear as `ws.<clientId>` (see the source-ref
 * construction in src/interfaces/ws.ts). A device's human-readable name is
 * the `description` it supplied when requesting access, stored in the
 * security config. Exposing that mapping lets every UI surface show e.g.
 * "sensesp-engines" instead of "ws.3d3e48a1-1185-2fe3-c494-1c1a9ee6f41f".
 *
 * The resulting map is served read-only to all authenticated clients via
 * GET /sourceNames, so non-admin users see the names too, while changes
 * remain on the admin-only device and alias endpoints.
 */

interface NamedDevice {
  clientId: string
  description?: string
}

const WS_SOURCE_PREFIX = 'ws.'

/**
 * Reconstruct the `$source` ref a device authenticates as. Mirrors
 * src/interfaces/ws.ts: the principal identifier (the device clientId)
 * has dots replaced with underscores so it stays a single label suffix.
 */
export function wsSourceRef(clientId: string): string {
  return WS_SOURCE_PREFIX + clientId.replace(/\./g, '_')
}

/**
 * Merge auto-derived WebSocket device descriptions with admin-set manual
 * aliases. Manual aliases win so an explicit override always takes effect.
 */
export function buildSourceNames(
  devices: NamedDevice[],
  aliases: Record<string, string>
): Record<string, string> {
  const names: Record<string, string> = {}
  for (const device of devices) {
    if (device.description) {
      names[wsSourceRef(device.clientId)] = device.description
    }
  }
  for (const sourceRef of Object.keys(aliases)) {
    names[sourceRef] = aliases[sourceRef]
  }
  return names
}
