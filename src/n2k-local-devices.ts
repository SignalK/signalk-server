export const N2K_CLAIM_ASSOCIATE_MS = 15_000

export interface Nmea2000OutAvailablePayload {
  src?: number
  uniqueNumber?: number
  pluginId?: string
}

export interface LocalN2kDevice {
  src: number
  uniqueNumber?: number
  pluginId?: string
}

export function isN2kAddress(src: number | undefined): src is number {
  return (
    typeof src === 'number' && Number.isInteger(src) && src >= 0 && src < 254
  )
}

export function parseNmea2000OutAvailablePayload(
  arg: unknown
): Nmea2000OutAvailablePayload {
  if (arg === null || typeof arg !== 'object' || Array.isArray(arg)) {
    return {}
  }
  const raw = arg as Record<string, unknown>
  const src = typeof raw.src === 'number' ? raw.src : undefined
  const uniqueNumber =
    typeof raw.uniqueNumber === 'number' ? raw.uniqueNumber : undefined
  const pluginId = typeof raw.pluginId === 'string' ? raw.pluginId : undefined
  return { src, uniqueNumber, pluginId }
}

export function recordLocalN2kDevice(
  devices: Map<number, LocalN2kDevice>,
  payload: Nmea2000OutAvailablePayload
): LocalN2kDevice | undefined {
  if (!isN2kAddress(payload.src)) return undefined
  if (payload.pluginId) {
    const existing = findLocalDeviceByPluginId(devices, payload.pluginId)
    if (existing && existing.src !== payload.src) {
      devices.delete(existing.src)
    }
  }
  const prev = devices.get(payload.src)
  const next: LocalN2kDevice = {
    src: payload.src,
    uniqueNumber: payload.uniqueNumber ?? prev?.uniqueNumber,
    pluginId: payload.pluginId ?? prev?.pluginId
  }
  devices.set(payload.src, next)
  return next
}

export function findLocalDeviceByPluginId(
  devices: Map<number, LocalN2kDevice>,
  pluginId: string
): LocalN2kDevice | undefined {
  for (const local of devices.values()) {
    if (local.pluginId === pluginId) return local
  }
  return undefined
}

/** Move a local mapping when the live sources tree has that uniqueNumber at another src. */
export function rebindLocalDevicesByUniqueNumber(
  devices: Map<number, LocalN2kDevice>,
  uniqueNumberToSrc: Map<number, number>
): void {
  for (const [src, local] of Array.from(devices.entries())) {
    if (typeof local.uniqueNumber !== 'number') continue
    const realSrc = uniqueNumberToSrc.get(local.uniqueNumber)
    if (!isN2kAddress(realSrc) || realSrc === src) continue
    devices.delete(src)
    devices.set(realSrc, { ...local, src: realSrc })
  }
}

/**
 * SimpleCan drops own frames after address claim, so n2k-discovery never
 * sees later TX from that src. When nmea2000OutAvailable carries a
 * pluginId but no src, bind it once to the most recently observed address
 * that is not already a local device (and not the canbus preferredAddress).
 * Repeat emits from the same plugin must not consume the rest of the bus.
 */
export function associatePluginWithRecentAddress(
  devices: Map<number, LocalN2kDevice>,
  pluginId: string,
  frameLastSeenBySrc: Map<number, number>,
  now: number,
  windowMs: number = N2K_CLAIM_ASSOCIATE_MS,
  reservedSrcs: number[] = []
): LocalN2kDevice | undefined {
  const existing = findLocalDeviceByPluginId(devices, pluginId)
  if (existing) return existing
  let bestSrc: number | undefined
  let bestSeen = -1
  for (const [src, seen] of frameLastSeenBySrc) {
    if (devices.has(src)) continue
    if (reservedSrcs.includes(src)) continue
    if (!isN2kAddress(src)) continue
    if (now - seen > windowMs) continue
    if (seen >= bestSeen) {
      bestSrc = src
      bestSeen = seen
    }
  }
  if (bestSrc === undefined) return undefined
  const next: LocalN2kDevice = { src: bestSrc, pluginId }
  devices.set(bestSrc, next)
  return next
}

export function canbusPreferredAddress(
  pipedProviders:
    | Array<{
        enabled?: boolean
        pipeElements?: Array<{
          type?: string
          options?: { preferredAddress?: number }
        }>
      }>
    | undefined
): number | undefined {
  if (!pipedProviders) return undefined
  for (const provider of pipedProviders) {
    if (provider.enabled === false) continue
    const elements = provider.pipeElements
    if (!elements) continue
    for (const element of elements) {
      if (element.type !== 'providers/canbus') continue
      const addr = element.options?.preferredAddress
      if (isN2kAddress(addr)) return addr
    }
  }
  return undefined
}

export function isLocalN2kDeviceRunning(
  local: LocalN2kDevice,
  providerStatus: Record<string, { message?: string }> | undefined
): boolean {
  if (!local.pluginId) return true
  const status = providerStatus?.[local.pluginId]
  if (!status) return true
  return status.message !== 'Stopped'
}
