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
  pgnInstances?: Record<string, number[]>
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
  const { primary, secondary } = buildSourceLabelParts(sourceRef, sourcesData)
  return secondary ? `${primary} (${secondary})` : primary
}

/**
 * Same data as buildSourceLabel but split into two parts so the UI can
 * render the human name on one line and the raw sourceRef on a second.
 * On portrait phones the combined string truncates with ellipsis, hiding
 * the bit that distinguishes two physical instances of the same model.
 */
export function buildSourceLabelParts(
  sourceRef: string,
  sourcesData: SourcesData | null
): { primary: string; secondary: string | null } {
  if (!sourcesData) return { primary: sourceRef, secondary: null }

  const n2k = getDeviceInfo(sourceRef, sourcesData)
  if (!n2k) return { primary: sourceRef, secondary: null }

  const { manufacturerCode, modelId } = n2k
  const mfr = manufacturerCode || ''
  const model = modelId || ''
  if (!mfr && !model) return { primary: sourceRef, secondary: null }

  return {
    primary: [mfr, model].filter(Boolean).join(' '),
    secondary: sourceRef
  }
}

/**
 * Translate a numeric-form `<label>.<src>` ref (e.g. `can0.4`) to the
 * canonical `<label>.<canName>` form (e.g. `can0.c050a0…`). Returns the
 * raw ref unchanged when no canName is known — that lets call-sites
 * compare against server-emitted canonical refs (livePreferredSources)
 * without breaking on cold boot or when the source isn't an N2K device.
 *
 * Mirrors `buildSrcToCanonicalMap` on the server (src/deltacache.ts).
 */
export function canonicaliseSourceRef(
  sourceRef: string,
  sourcesData: SourcesData | null
): string {
  if (!sourcesData) return sourceRef
  const parsed = parseSourceRef(sourceRef)
  if (!parsed) return sourceRef
  const conn = sourcesData[parsed.connection] as
    | Record<string, unknown>
    | undefined
  if (!conn || typeof conn !== 'object') return sourceRef
  const dev = conn[parsed.src] as SourceDevice | undefined
  if (!dev || typeof dev !== 'object') return sourceRef
  const canName = dev.n2k?.canName
  if (typeof canName !== 'string' || canName.length === 0) return sourceRef
  // Already canonical — sourceRef looked up directly under canName key.
  if (parsed.src === canName) return sourceRef
  return `${parsed.connection}.${canName}`
}

/**
 * True if the source is a Signal K plugin emitting deltas directly into
 * the server, not a device on a bus. Detected structurally by the
 * absence of a "${connection}.${address}" form — plugin sourceRefs are
 * plain strings like "derived-data" or "signalk-to-nmea2000".
 *
 * The user usually wants to rank these explicitly: a derived-data
 * fallback should sit below the real sensor; a plugin acting as
 * authoritative should sit on top.
 */
export function isPluginSource(sourceRef: string): boolean {
  return sourceRef.length > 0 && sourceRef.indexOf('.') === -1
}

export interface N2kDeviceEntry extends N2kDeviceInfo {
  sourceRef: string
  connection: string
  /**
   * The actual key under `sources[connection]` for this device — always
   * the numeric N2K address as a string, regardless of useCanName.
   * Used to match server-side per-source state (e.g. SOURCESTATUS).
   */
  srcAddr: string
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
        connection: connName,
        srcAddr
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
      if (key === 'type' || key === 'label') continue
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
 * Manufacturer-proprietary PGN ranges. The same PGN number can carry
 * entirely different payload semantics for different manufacturers
 * (bytes 0-1 are the Manufacturer Code, byte 2 is the Industry Code,
 * the rest is manufacturer-defined), so shared proprietary PGNs across
 * devices are not a reliable signal of a real conflict.
 */
export function isProprietaryPGN(pgn: string | number): boolean {
  const n = typeof pgn === 'number' ? pgn : Number(pgn)
  if (!Number.isFinite(n)) return false
  return (
    n === 61184 ||
    (n >= 65280 && n <= 65535) ||
    n === 126720 ||
    (n >= 130816 && n <= 131071)
  )
}

/**
 * Temperature/humidity PGNs where the unique key is instance + source,
 * not just instance. Two devices sending the same PGN with the same
 * instance but different source types are NOT in conflict.
 */
const COMPOUND_KEY_PGNS = new Set([
  '130312', // Temperature
  '130313', // Humidity
  '130316' // Temperature Extended Range
  // Note: Maretron proprietary temperature (130823) is also compound-keyed,
  // but it's filtered out earlier as a proprietary PGN, so listing it here
  // would be unreachable.
])

/**
 * Detect N2K devices that share the same device instance and send
 * overlapping data PGNs. This can confuse instruments that rely on
 * instance numbers to distinguish data sources.
 *
 * Protocol/management PGNs (ISO Address Claim, Heartbeat, Product Info,
 * etc.) are excluded — every device sends those and they do not represent
 * real data conflicts. Manufacturer-proprietary PGNs are also excluded:
 * the same PGN number can carry different semantics for different
 * manufacturers, so sharing one is not a reliable conflict signal.
 *
 * When actual data instance information is available (from the sources API
 * pgnInstances or n2k-discovery pgnDataInstances), PGNs where both devices
 * use non-overlapping instances are also excluded — they are not in conflict.
 *
 * For temperature/humidity PGNs (COMPOUND_KEY_PGNS), the unique key is
 * instance + source. When pgnSourceKeys data is available, these PGNs are
 * compared using "instance:source" compound keys instead of instance alone.
 */
export function detectInstanceConflicts(
  devices: N2kDeviceEntry[],
  pgnDataInstances?: Record<string, Record<string, number[]>>,
  pgnSourceKeys?: Record<string, Record<string, string[]>>
): InstanceConflict[] {
  const conflicts: InstanceConflict[] = []

  // Group by connection + deviceInstance to avoid false positives across buses
  const byConnInstance = new Map<string, N2kDeviceEntry[]>()
  for (const d of devices) {
    if (d.deviceInstance === undefined) continue
    const groupKey = `${d.connection}\0${d.deviceInstance}`
    const group = byConnInstance.get(groupKey)
    if (group) {
      group.push(d)
    } else {
      byConnInstance.set(groupKey, [d])
    }
  }

  for (const [key, group] of byConnInstance) {
    if (group.length < 2) continue
    const instance = Number(key.split('\0')[1])
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]
        const keep = (p: string) =>
          !PROTOCOL_PGNS.has(p) && !isProprietaryPGN(p)
        const aPGNs = a.pgns ? Object.keys(a.pgns).filter(keep) : []
        const bPGNs = new Set(b.pgns ? Object.keys(b.pgns).filter(keep) : [])
        const shared = aPGNs.filter((pgn) => {
          if (!bPGNs.has(pgn)) return false

          // Temperature / humidity PGNs are keyed by the full SK leaf
          // path (which encodes the source-type enum and any instance
          // index), not by the bare instance number — see
          // buildPgnSourceKeysFromTree. The SK tree is authoritative
          // for "currently publishing"; if we have a path-keys map at
          // all, trust it. Two devices conflict only when their
          // currently-published paths overlap. A device temporarily
          // missing from the map (e.g. between PGN emissions) is no
          // longer a conflict signal — the alternative (falling back
          // to the bare instance) re-introduces the very false
          // positive these compound keys exist to suppress.
          if (COMPOUND_KEY_PGNS.has(pgn)) {
            if (!pgnSourceKeys) return true
            const aKeys = pgnSourceKeys[a.sourceRef]?.[pgn]
            const bKeys = pgnSourceKeys[b.sourceRef]?.[pgn]
            if (!aKeys || aKeys.length === 0) return false
            if (!bKeys || bKeys.length === 0) return false
            const aSet = new Set(aKeys)
            return bKeys.some((k) => aSet.has(k))
          }

          // Check actual data instance overlap.
          // Priority: sources API (pgnInstances) > n2k-discovery (pgnDataInstances)
          const aInst =
            a.pgnInstances?.[pgn] ?? pgnDataInstances?.[a.sourceRef]?.[pgn]
          const bInst =
            b.pgnInstances?.[pgn] ?? pgnDataInstances?.[b.sourceRef]?.[pgn]

          if (aInst && aInst.length > 0 && bInst && bInst.length > 0) {
            // Both have instance data — only conflict if instances overlap
            const aSet = new Set(aInst)
            return bInst.some((i) => aSet.has(i))
          }

          // One or both missing instance data — flag conservatively
          return true
        })
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
