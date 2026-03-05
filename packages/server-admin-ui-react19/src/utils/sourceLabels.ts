/**
 * Utilities for building human-readable labels from Signal K source references.
 *
 * Source refs look like "YDEN02.44" (connection.srcAddress) for N2K devices,
 * or plain strings like "derived-data" for plugins.
 */

export interface N2kDeviceInfo {
  manufacturerCode?: string
  modelId?: string
  modelVersion?: string
  modelSerialCode?: string
  softwareVersionCode?: string
  deviceClass?: string
  deviceFunction?: number
  deviceInstance?: number
  deviceInstanceLower?: number
  deviceInstanceUpper?: number
  installationDescription1?: string
  installationDescription2?: string
  manufacturerInformation?: string
  canName?: string
  src?: string
  uniqueNumber?: number
  productCode?: number
  nmea2000Version?: number
  certificationLevel?: number | string
  loadEquivalency?: number
  systemInstance?: number
  pgns?: Record<string, string>
  unknownPGNs?: Record<string, unknown>
}

export interface SourceDevice {
  n2k?: N2kDeviceInfo
  type?: string
  [key: string]: unknown
}

export interface SourcesData {
  [connectionOrKey: string]:
    | SourceDevice
    | { type?: string; [key: string]: unknown }
}

/**
 * Parse a sourceRef like "YDEN02.44" into connection and src parts.
 * Returns null for plugin sources like "derived-data" that have no dot.
 */
export function parseSourceRef(
  sourceRef: string
): { connection: string; src: string } | null {
  const dotIdx = sourceRef.indexOf('.')
  if (dotIdx === -1) return null
  return {
    connection: sourceRef.slice(0, dotIdx),
    src: sourceRef.slice(dotIdx + 1)
  }
}

/**
 * Look up the N2K device info for a given sourceRef from the sources API data.
 *
 * The sources API keys devices by numeric address (e.g. "44"), but sourceRefs
 * may use the CAN Name (e.g. "can0.c1789101e7e0b32b"). When a direct key
 * lookup fails, we search by matching the canName field.
 */
export function getDeviceInfo(
  sourceRef: string,
  sourcesData: SourcesData
): N2kDeviceInfo | null {
  const parsed = parseSourceRef(sourceRef)
  if (!parsed) return null

  const connection = sourcesData[parsed.connection]
  if (!connection || typeof connection !== 'object') return null

  const conn = connection as Record<string, unknown>

  // Direct lookup by key (numeric address)
  const directDevice = conn[parsed.src]
  if (directDevice && typeof directDevice === 'object') {
    const d = directDevice as SourceDevice
    if (d.n2k) return d.n2k
  }

  // Fallback: search by canName (for CAN Name-based sourceRefs)
  for (const device of Object.values(conn)) {
    if (!device || typeof device !== 'object') continue
    const d = device as SourceDevice
    if (d.n2k?.canName === parsed.src) return d.n2k
  }

  return null
}

/**
 * Build a human-readable label for a source reference.
 *
 * Label format: "Manufacturer Model (sourceRef)" or "Manufacturer (sourceRef)"
 * when model is not available. Data comes from the N2K bus only (PGN 60928 for
 * manufacturer, PGN 126996 for modelId).
 */
export function buildSourceLabel(
  sourceRef: string,
  sourcesData: SourcesData | null
): string {
  if (!sourcesData) return sourceRef

  const n2k = getDeviceInfo(sourceRef, sourcesData)
  if (!n2k) return sourceRef

  const { manufacturerCode, modelId } = n2k
  const mfr = manufacturerCode || ''
  const model = modelId || ''
  if (!mfr && !model) return sourceRef

  const label = [mfr, model].filter(Boolean).join(' ')
  return `${label} (${sourceRef})`
}

export interface N2kDeviceEntry extends N2kDeviceInfo {
  sourceRef: string
  connection: string
}

/**
 * Extract a flat list of N2K devices from the sources API response.
 * Sorted by manufacturer, then model, then bus address.
 */
export function extractN2kDevices(sourcesData: SourcesData): N2kDeviceEntry[] {
  const devices: N2kDeviceEntry[] = []

  for (const [connName, connData] of Object.entries(sourcesData)) {
    if (!connData || typeof connData !== 'object') continue
    if ((connData as Record<string, unknown>).type !== 'NMEA2000') continue

    for (const [srcAddr, device] of Object.entries(connData)) {
      if (srcAddr === 'type' || srcAddr === 'label') continue
      if (!device || typeof device !== 'object') continue

      const d = device as SourceDevice
      if (!d.n2k) continue

      devices.push({
        ...d.n2k,
        sourceRef: `${connName}.${d.n2k.canName || srcAddr}`,
        connection: connName
      })
    }
  }

  return devices.sort((a, b) => {
    const mfr = String(a.manufacturerCode ?? '').localeCompare(
      String(b.manufacturerCode ?? '')
    )
    if (mfr !== 0) return mfr
    const model = String(a.modelId ?? '').localeCompare(String(b.modelId ?? ''))
    if (model !== 0) return model
    return Number(a.src || 0) - Number(b.src || 0)
  })
}

/**
 * Build a lookup map from sourceRef → display label for all known sources.
 */
export function buildSourceLabelMap(
  sourcesData: SourcesData
): Map<string, string> {
  const map = new Map<string, string>()

  for (const [connName, connData] of Object.entries(sourcesData)) {
    if (!connData || typeof connData !== 'object') continue

    for (const [key, device] of Object.entries(connData)) {
      if (key === 'type') continue
      if (!device || typeof device !== 'object') continue

      const d = device as SourceDevice
      if (d.n2k) {
        const sourceRef = `${connName}.${d.n2k.canName || key}`
        const label = buildSourceLabel(sourceRef, sourcesData)
        if (label !== sourceRef) {
          map.set(sourceRef, label)
        }
      }
    }
  }

  return map
}

export interface InstanceConflict {
  deviceA: N2kDeviceEntry
  deviceB: N2kDeviceEntry
  sharedPGNs: string[]
  deviceInstance: number
}

/**
 * NMEA 2000 protocol/management PGNs that every device sends.
 * These should NOT be counted when detecting instance conflicts because
 * they are part of the network protocol, not sensor data that instruments
 * distinguish by device instance.
 */
const PROTOCOL_PGNS = new Set([
  '59392', // ISO Acknowledgement
  '59904', // ISO Request
  '60160', // ISO Transport Protocol, Data Transfer
  '60416', // ISO Transport Protocol, Connection Management
  '60928', // ISO Address Claim
  '65240', // ISO Commanded Address
  '126208', // NMEA Request/Command/Acknowledge Group Function
  '126464', // PGN List (Transmit and Receive)
  '126993', // Heartbeat
  '126996', // Product Information
  '126998' // Configuration Information
])

/**
 * Detect N2K devices that share the same device instance and send
 * overlapping data PGNs. This can confuse instruments that rely on
 * instance numbers to distinguish data sources.
 *
 * Protocol/management PGNs (ISO Address Claim, Heartbeat, Product Info,
 * etc.) are excluded — every device sends those and they do not represent
 * real data conflicts.
 */
export function detectInstanceConflicts(
  devices: N2kDeviceEntry[]
): InstanceConflict[] {
  const conflicts: InstanceConflict[] = []

  const byInstance = new Map<number, N2kDeviceEntry[]>()
  for (const d of devices) {
    if (d.deviceInstance === undefined) continue
    const group = byInstance.get(d.deviceInstance)
    if (group) {
      group.push(d)
    } else {
      byInstance.set(d.deviceInstance, [d])
    }
  }

  for (const [instance, group] of byInstance) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]
        const aPGNs = a.pgns
          ? Object.keys(a.pgns).filter((p) => !PROTOCOL_PGNS.has(p))
          : []
        const bPGNs = new Set(
          b.pgns ? Object.keys(b.pgns).filter((p) => !PROTOCOL_PGNS.has(p)) : []
        )
        const shared = aPGNs.filter((pgn) => bPGNs.has(pgn))
        if (shared.length > 0) {
          conflicts.push({
            deviceA: a,
            deviceB: b,
            sharedPGNs: shared,
            deviceInstance: instance
          })
        }
      }
    }
  }

  return conflicts
}

/**
 * Build a stable key for an instance conflict pair.
 * Sorts the two sourceRefs so the same pair always produces the same key.
 */
export function conflictKey(sourceRefA: string, sourceRefB: string): string {
  return [sourceRefA, sourceRefB].sort().join('+')
}
