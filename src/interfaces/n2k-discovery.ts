// N2K Device Discovery — sends ISO Request (PGN 59904) asking each device
// for Product Information (PGN 126996) which contains modelId, software
// version, etc. Runs automatically 5s after the N2K bus becomes available,
// and can be triggered manually via POST /skServer/n2kDiscoverDevices.
//
// NOTE: Requires a TCP connection to the YDWG02 gateway (ydwg02-canboatjs).
// UDP connections (ydwg02-udp-canboatjs) are receive-only in practice —
// the Node.js UDP socket sends to the gateway but the YDWG02 does not
// forward those messages onto the N2K bus.

import * as fs from 'fs'
import * as path from 'path'
import { Request, Response } from 'express'
import { createDebug } from '../debug'
import { Interface, SignalKServer } from '../types'
import { SERVERROUTESPREFIX } from '../constants'
import { writeSettingsFile } from '../config/config'
import { atomicWriteFile } from '../atomicWrite'
import {
  getAllPGNs,
  getEnumerationName,
  getEnumerationValue
} from '@canboat/ts-pgns'
import {
  buildPgnDataInstancesFromTree,
  buildPgnSourceKeysFromTree
} from '../n2k-discovery-instances'

const debug = createDebug('signalk-server:interfaces:n2k-discovery')

const REQUEST_INTERVAL_MS = 500
// 90s threshold: covers Maretron-class devices that send Heartbeat (PGN
// 126993) only every 60s, plus margin for occasional jitter. Anything
// shorter risks flapping for slow-cycle PGNs.
const ONLINE_THRESHOLD_MS = 90_000
const STATUS_TICK_MS = 5_000

// The app object at runtime is SignalKServer + IRouter + EventEmitter.
// SignalKServer doesn't include those, so pick the methods we need.
interface N2kDiscoveryApp extends SignalKServer {
  on(event: string, listener: (...args: unknown[]) => void): this
  removeListener(event: string, listener: (...args: unknown[]) => void): this
  emit(event: string, ...args: unknown[]): boolean
  use(path: string, ...handlers: unknown[]): void
  get(path: string, handler: (req: Request, res: Response) => void): void
  post(path: string, handler: (req: Request, res: Response) => void): void
  put(path: string, handler: (req: Request, res: Response) => void): void
  delete(path: string, handler: (req: Request, res: Response) => void): void
  config: {
    defaults: unknown
    configPath: string
    settings: { sourceAliases?: Record<string, string> }
  }
  deltaCache: {
    sourceDeltas: Record<string, unknown>
    removeSourceDelta(key: string): void
  }
}

interface SourceStatus {
  // sourceRef matches the wire format produced by getSourceId():
  // "label.canName" or "label.src" for N2K, "label.talker" for NMEA0183,
  // "label" alone for plugin / $source-only sources.
  sourceRef: string
  // providerId / src kept for the SourceDiscovery view which keys by them.
  providerId: string
  src: string
  online: boolean
  lastSeen: number | undefined
}

interface N2kPGN {
  src: number
  pgn: number
  fields?: Record<string, unknown>
}

// Derive temp/humidity PGN set from canboat.json — used by the
// instance-discovery endpoint to decide which frames to listen for.
const DATA_INSTANCE_PGNS = new Set<number>()

for (const def of getAllPGNs()) {
  const hasInstanceKey = def.Fields.some(
    (f) => f.Id === 'instance' && f.PartOfPrimaryKey
  )
  if (!hasInstanceKey) continue

  const hasSourceKey = def.Fields.some(
    (f) =>
      f.Id === 'source' &&
      f.PartOfPrimaryKey &&
      (f.LookupEnumeration === 'TEMPERATURE_SOURCE' ||
        f.LookupEnumeration === 'HUMIDITY_SOURCE')
  )
  if (hasSourceKey) DATA_INSTANCE_PGNS.add(def.PGN)
}

interface DataInstance {
  pgn: number
  instance: number
  sourceLabel: string
  sourceEnum?: number
  label?: string
  hardwareChannelId?: number
}

interface ChannelLabel {
  hardwareChannelId: number
  pgn?: number
  instance?: number
  label: string
}

interface DiscoverResult {
  instances: DataInstance[]
  channelLabels: ChannelLabel[]
}

const LISTEN_DURATION_MS = 6000

// Per-channel labels stored in configPath/n2k-channel-labels.json.
// Key format: "sourceRef:pgn:instance" e.g. "can0.45:130316:30"
type ChannelLabels = Record<string, string>
const LABELS_FILENAME = 'n2k-channel-labels.json'

function labelsFilePath(app: N2kDiscoveryApp): string {
  return path.join(app.config.configPath, LABELS_FILENAME)
}

function loadLabels(app: N2kDiscoveryApp): ChannelLabels {
  const filePath = labelsFilePath(app)
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}
    }
    debug('Failed to read %s: %s', filePath, (err as Error).message)
    return {}
  }
  try {
    return JSON.parse(content)
  } catch (err) {
    debug('Malformed JSON in %s: %s', filePath, (err as Error).message)
    return {}
  }
}

async function saveLabels(
  app: N2kDiscoveryApp,
  labels: ChannelLabels
): Promise<void> {
  await atomicWriteFile(labelsFilePath(app), JSON.stringify(labels, null, 2))
}

function sendISORequest(
  app: N2kDiscoveryApp,
  dst: number,
  requestedPgn = 126996
): void {
  app.emit('nmea2000JsonOut', {
    pgn: 59904,
    prio: 6,
    dst,
    fields: { pgn: requestedPgn }
  })
}

// Request PGN 126996 from each known device individually, spaced 500ms
// apart. Gateways like the YDEN-02 have limited TCP throughput — a
// broadcast request causes all devices to respond simultaneously,
// overflowing the TCP buffer and dropping most responses. Individual
// requests produce one response at a time, which fits within the
// available bandwidth.
//
// Returns the number of devices being queried so the caller can
// estimate how long the full sweep will take.
// The set of PGNs we ask every device about during discovery.
// 60928: ISO Address Claim — manufacturerCode, canName, deviceFunction
// 126996: Product Information — modelId, softwareVersionCode, modelSerialCode
// 126998: Configuration Information — installationDescription1/2, manufacturerInformation
const DISCOVERY_PGNS = [60928, 126996, 126998] as const

function requestProductInfo(
  app: N2kDiscoveryApp,
  knownAddresses: Set<number>,
  pendingTimers: Set<ReturnType<typeof setTimeout>>,
  discoveredAddresses?: Set<number>
): number {
  // Cancel any in-flight requests from a previous sweep
  for (const timer of pendingTimers) {
    clearTimeout(timer)
  }
  pendingTimers.clear()

  // Reset discovery tracking so only fresh responses are counted
  if (discoveredAddresses) {
    discoveredAddresses.clear()
  }

  const addrs = Array.from(knownAddresses)
  debug(
    'Sending ISO Requests for PGN %s to %d devices (one at a time)',
    DISCOVERY_PGNS.join(' + '),
    addrs.length
  )

  // Space each request by REQUEST_INTERVAL_MS so slower gateways like the
  // YDEN-02 do not overflow their TCP output buffer when every device
  // answers at once.
  addrs.forEach((addr, i) => {
    DISCOVERY_PGNS.forEach((pgn, j) => {
      const offset = (i * DISCOVERY_PGNS.length + j) * REQUEST_INTERVAL_MS
      const timer = setTimeout(() => {
        pendingTimers.delete(timer)
        sendISORequest(app, addr, pgn)
      }, offset)
      pendingTimers.add(timer)
    })
  })

  return addrs.length
}

module.exports = (app: N2kDiscoveryApp) => {
  let n2kOutAvailable = false
  const knownAddresses = new Set<number>()
  const discoveredAddresses = new Set<number>()
  // Timers for in-flight per-address ISO Requests inside a sweep.
  // requestProductInfo() clears this set at the start of every sweep so
  // a fresh sweep doesn't pile up on top of a previous incomplete one.
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>()
  // Timers that schedule the auto-discovery sweeps themselves
  // (5 s / 3 min / 10 min after nmea2000OutAvailable). Kept separate
  // from pendingTimers so the first sweep firing does not silently
  // cancel the later retry sweeps that were scheduled alongside it.
  const sweepTimers = new Set<ReturnType<typeof setTimeout>>()
  // One-shot follow-up requests posted by /n2kConfigDevice handlers
  // (re-request 60928 or 126998 after a configuration command) so the
  // sources tree picks up the new instance/description. Tracked here
  // so api.stop() can cancel them; kept separate from pendingTimers
  // so an in-flight sweep doesn't clear them.
  const requestTimers = new Set<ReturnType<typeof setTimeout>>()
  const schedulePendingRequest = (fn: () => void, delayMs: number) => {
    const timer = setTimeout(() => {
      requestTimers.delete(timer)
      fn()
    }, delayMs)
    requestTimers.add(timer)
  }
  // Last reported online state per "providerId.src" so we only emit on transitions.
  const onlineStates = new Map<string, boolean>()
  // Last time *any* parsed N2K frame was seen for a given bus address.
  // sourceMeta only records lastSeen when a value-bearing delta lands;
  // a device sending Address Claim, Heartbeat, Product Info etc. but
  // whose data PGNs don't map (or cycle slower than the 90s threshold)
  // would age out of sourceMeta and badge Offline despite still being
  // on the bus. Folding this map into buildSourceStatuses means
  // "online" reflects "alive on the bus", not "currently producing
  // mappable Signal K values".
  const frameLastSeenBySrc = new Map<number, number>()
  let statusTickInterval: ReturnType<typeof setInterval> | undefined
  // First tick always emits a full snapshot so admin-ui clients get
  // initial state via lastServerEvents bootstrap on connect.
  let firstStatusEmit = true
  const api = new Interface()

  // Look up the numeric bus address that currently corresponds to the
  // given sourceRef. The sources summary tree (populated by fullsignalk
  // on every N2K delta) maps `<label>[<src>].n2k.canName` — walk it once
  // to find the entry that matches the suffix. Returns undefined when
  // the suffix isn't a numeric src and no canName lookup hits.
  function resolveSrcAddress(sourceRef: string): number | undefined {
    const dotIdx = sourceRef.indexOf('.')
    if (dotIdx === -1) return undefined
    const label = sourceRef.slice(0, dotIdx)
    const suffix = sourceRef.slice(dotIdx + 1)
    // suffix may be a numeric src directly
    const numeric = Number(suffix)
    if (!Number.isNaN(numeric) && Number.isInteger(numeric)) return numeric
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sources = (app.signalk as any)?.sources
    if (!sources || typeof sources !== 'object') return undefined
    const conn = sources[label]
    if (!conn || typeof conn !== 'object') return undefined
    for (const [key, dev] of Object.entries(conn)) {
      if (key === 'type' || key === 'label') continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canName = (dev as any)?.n2k?.canName
      if (canName === suffix) {
        const asNumber = Number(key)
        if (!Number.isNaN(asNumber) && Number.isInteger(asNumber)) {
          return asNumber
        }
      }
    }
    return undefined
  }

  // Find the providerId (connection label) that owns a given N2K bus
  // address by scanning app.signalk.sources for a connection whose
  // numeric sub-key matches. Returns undefined when no connection
  // claims the address (e.g. address only seen at frame level, never
  // mapped through the N2K → SK pipeline yet).
  function findProviderIdForAddress(addr: number): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sources = (app.signalk as any)?.sources
    if (!sources || typeof sources !== 'object') return undefined
    const addrStr = String(addr)
    for (const providerId of Object.keys(sources)) {
      const conn = sources[providerId]
      if (!conn || typeof conn !== 'object') continue
      if (Object.prototype.hasOwnProperty.call(conn, addrStr)) {
        return providerId
      }
    }
    return undefined
  }

  function buildSourceStatuses(): SourceStatus[] {
    const now = Date.now()
    const statuses: SourceStatus[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceMeta = (app.signalk as any)?.sourceMeta as
      | Record<string, { lastSeen?: number }>
      | undefined
    // sourceMeta is the canonical per-source freshness map. Its keys are
    // already in `sourceRef` form (e.g. "can0.44", "0183-1.II",
    // "derived-data") matching getSourceId(). Walk it directly so we
    // cover N2K, NMEA0183 and $source-only (plugin) sources alike.
    const seenAddresses = new Set<number>()
    if (sourceMeta) {
      for (const sourceRef of Object.keys(sourceMeta)) {
        const metaLastSeen = sourceMeta[sourceRef]?.lastSeen
        // For N2K sources, also check when we last saw any parsed frame
        // for this device's bus address. Devices that emit only meta
        // PGNs (Address Claim, Product Info, Heartbeat) — or whose data
        // PGNs aren't mapped to Signal K — would otherwise age out of
        // sourceMeta and look Offline despite being on the bus.
        const srcAddr = resolveSrcAddress(sourceRef)
        if (srcAddr !== undefined) seenAddresses.add(srcAddr)
        const frameLastSeen =
          srcAddr !== undefined ? frameLastSeenBySrc.get(srcAddr) : undefined
        const lastSeen =
          metaLastSeen !== undefined && frameLastSeen !== undefined
            ? Math.max(metaLastSeen, frameLastSeen)
            : (metaLastSeen ?? frameLastSeen)
        const online =
          lastSeen !== undefined && now - lastSeen < ONLINE_THRESHOLD_MS
        const dotIdx = sourceRef.indexOf('.')
        const providerId = dotIdx === -1 ? sourceRef : sourceRef.slice(0, dotIdx)
        const src = dotIdx === -1 ? '' : sourceRef.slice(dotIdx + 1)
        statuses.push({ sourceRef, providerId, src, online, lastSeen })
      }
    }
    // Pick up devices we have seen frames for but that never landed in
    // sourceMeta (e.g. only Address Claim / Product Info, or data PGNs
    // not yet mapped to Signal K paths). Without this pass, the bus-
    // freshness tracking added above produces no externally visible
    // status for those devices.
    for (const [srcAddr, frameLastSeen] of frameLastSeenBySrc) {
      if (seenAddresses.has(srcAddr)) continue
      const providerId = findProviderIdForAddress(srcAddr)
      if (providerId === undefined) continue
      const src = String(srcAddr)
      const sourceRef = `${providerId}.${src}`
      const online = now - frameLastSeen < ONLINE_THRESHOLD_MS
      statuses.push({
        sourceRef,
        providerId,
        src,
        online,
        lastSeen: frameLastSeen
      })
    }
    return statuses
  }

  function checkSourceStatus(): void {
    const statuses = buildSourceStatuses()
    if (debug.enabled) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sourceMeta = (app.signalk as any)?.sourceMeta as
        | Record<string, { lastSeen?: number }>
        | undefined
      debug(
        'tick: %d statuses, %d sourceMeta entries, %d source providers',
        statuses.length,
        sourceMeta ? Object.keys(sourceMeta).length : 0,
        app.signalk?.sources ? Object.keys(app.signalk.sources).length : 0
      )
      if (statuses.length === 0 && sourceMeta) {
        debug('sourceMeta keys: %j', Object.keys(sourceMeta).slice(0, 10))
        debug(
          'sources keys: %j',
          app.signalk?.sources ? Object.keys(app.signalk.sources) : []
        )
      }
    }
    const transitions: SourceStatus[] = []
    const seenKeys = new Set<string>()
    for (const status of statuses) {
      const key = `${status.providerId}.${status.src}`
      seenKeys.add(key)
      const prev = onlineStates.get(key)
      if (prev !== status.online) {
        onlineStates.set(key, status.online)
        transitions.push(status)
      }
    }
    // Drop tracking for sources that no longer appear in the tree.
    for (const key of onlineStates.keys()) {
      if (!seenKeys.has(key)) {
        onlineStates.delete(key)
      }
    }
    if (transitions.length > 0 || firstStatusEmit) {
      firstStatusEmit = false
      // Emitted as serverevent (not serverAdminEvent) so it reaches every
      // admin-ui WS client even when the dummy security strategy is in
      // use (no hasAdminAccess). Source-status data is already exposed
      // via the unauthenticated /signalk/v1/api/sources tree, so this
      // doesn't widen the security surface.
      app.emit('serverevent', {
        type: 'SOURCESTATUS',
        data: statuses
      })
    }
  }

  const n2kListener = (pgn: unknown) => {
    const n2k = pgn as N2kPGN
    if (typeof n2k.src === 'number' && n2k.src >= 0 && n2k.src < 254) {
      knownAddresses.add(n2k.src)
      frameLastSeenBySrc.set(n2k.src, Date.now())
      // Track discovery responses (Address Claim + Product Info)
      if (n2k.pgn === 60928 || n2k.pgn === 126996) {
        discoveredAddresses.add(n2k.src)
      }
    }
  }

  // sourceRefChanged fires when n2k-signalk detects that a bus address
  // now belongs to a different physical device (different CAN Name on
  // the same src). Drop our frame-freshness entry for that src so the
  // departing device can age out cleanly — without this, a single
  // observation timestamp would carry across the reclaim and keep the
  // old sourceRef looking briefly Online after it should have gone
  // Offline.
  const sourceRefChangedListener = (...args: unknown[]) => {
    const payload = args[0] as { src?: number } | undefined
    if (payload && typeof payload.src === 'number') {
      frameLastSeenBySrc.delete(payload.src)
    }
  }

  const n2kOutListener = () => {
    n2kOutAvailable = true
    // Multiple sweeps because some gateways — notably Yacht Devices
    // YDEN / YDWG — silently drop discovery requests (PGN 60928 /
    // 126996 / 126998) under bus load. A 36-device bus takes ~54s per
    // sweep with 500 ms pacing, so we schedule 5 s, 3 min and 10 min
    // for drop-prone setups. Users can still trigger a manual sweep
    // from the Discovery page.
    const sweepAfter = (delayMs: number, resetTracking: boolean) => {
      const timer = setTimeout(() => {
        sweepTimers.delete(timer)
        debug(
          'Auto-requesting identity from %d N2K devices',
          knownAddresses.size
        )
        requestProductInfo(
          app,
          knownAddresses,
          pendingTimers,
          resetTracking ? discoveredAddresses : undefined
        )
      }, delayMs)
      sweepTimers.add(timer)
    }
    sweepAfter(5_000, true)
    sweepAfter(180_000, false)
    sweepAfter(600_000, false)
  }

  api.start = () => {
    app.on('N2KAnalyzerOut', n2kListener)
    app.on('nmea2000OutAvailable', n2kOutListener)
    app.on('sourceRefChanged', sourceRefChangedListener)
    statusTickInterval = setInterval(checkSourceStatus, STATUS_TICK_MS)

    app.securityStrategy.addAdminMiddleware(
      `${SERVERROUTESPREFIX}/n2kConfigDevice`
    )
    app.securityStrategy.addAdminMiddleware(
      `${SERVERROUTESPREFIX}/n2kDiscoverDevices`
    )
    app.securityStrategy.addAdminMiddleware(
      `${SERVERROUTESPREFIX}/n2kDeviceStatus`
    )
    app.securityStrategy.addAdminMiddleware(
      `${SERVERROUTESPREFIX}/n2kDiscoverInstances`
    )
    app.securityStrategy.addAdminMiddleware(
      `${SERVERROUTESPREFIX}/n2kChannelLabel`
    )

    app.post(
      `${SERVERROUTESPREFIX}/n2kDiscoverDevices`,
      (_req: Request, res: Response) => {
        if (!n2kOutAvailable) {
          res.status(503).json({
            state: 'FAILED',
            statusCode: 503,
            message: 'N2K output not available'
          })
          return
        }
        const deviceCount = requestProductInfo(
          app,
          knownAddresses,
          pendingTimers,
          discoveredAddresses
        )
        const estimatedMs =
          deviceCount * REQUEST_INTERVAL_MS * DISCOVERY_PGNS.length
        res.json({
          state: 'COMPLETED',
          statusCode: 200,
          message: `Discovery request sent to ${deviceCount} devices (~${Math.ceil(estimatedMs / 1000)}s)`
        })
      }
    )

    app.get(
      `${SERVERROUTESPREFIX}/n2kDeviceStatus`,
      (_req: Request, res: Response) => {
        // Derive currently-published instance values from the SK tree
        // rather than from a passive listener. The tree is the
        // authoritative current state — paths only exist while a
        // device is actively publishing them — so a stale instance
        // emitted briefly during boot can't haunt conflict detection.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const selfTree = (app.signalk as any)?.self
        const instanceData = buildPgnDataInstancesFromTree(selfTree)
        const sourceKeyData = buildPgnSourceKeysFromTree(selfTree)
        const sourceStatuses = buildSourceStatuses()
        res.json({
          knownAddresses: Array.from(knownAddresses),
          discoveredAddresses: Array.from(discoveredAddresses),
          n2kOutAvailable,
          pgnDataInstances: instanceData,
          pgnSourceKeys: sourceKeyData,
          sourceStatuses
        })
      }
    )

    // Listen to N2K messages from a specific device for LISTEN_DURATION_MS
    // and collect all data instances (temperature, humidity, switch channels).
    // Returns the unique {pgn, instance, sourceLabel} tuples discovered.
    app.get(
      `${SERVERROUTESPREFIX}/n2kDiscoverInstances`,
      (req: Request, res: Response) => {
        const src = Number(req.query.src)
        const sourceRef = req.query.sourceRef as string | undefined
        if (isNaN(src) || src < 0 || src > 253) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: 'src query parameter required (0-253)'
          })
          return
        }

        const localLabels = sourceRef ? loadLabels(app) : {}
        const instances: DataInstance[] = []
        const seen = new Set<string>()
        // PGN 130060 labels keyed by "instance" (dataSourceInstanceValue)
        const n2kLabels = new Map<string, string>()
        // Map instance to hardwareChannelId for write-back
        const channelIds = new Map<string, number>()
        // All PGN 130060 channel labels for the response
        const allChannelLabels: ChannelLabel[] = []

        const listener = (pgn: unknown) => {
          const n2k = pgn as N2kPGN
          if (n2k.src !== src || !n2k.fields) return

          // Collect PGN 130060 (Label) responses
          if (n2k.pgn === 130060) {
            const instVal =
              n2k.fields.dataSourceInstanceValue ??
              n2k.fields['Data Source Instance Value']
            const labelText = n2k.fields.label ?? n2k.fields.Label
            const labelPgn = n2k.fields.pgn ?? n2k.fields.PGN
            const hwCh =
              n2k.fields.hardwareChannelId ?? n2k.fields['Hardware Channel ID']
            if (
              instVal !== undefined &&
              typeof labelText === 'string' &&
              labelText
            ) {
              if (labelPgn) {
                n2kLabels.set(`${labelPgn}:${instVal}`, labelText)
              }
              // Also store by instance only for cross-PGN fallback
              n2kLabels.set(`*:${instVal}`, labelText)
              if (hwCh !== undefined) {
                channelIds.set(`${labelPgn ?? '*'}:${instVal}`, Number(hwCh))
              }
              allChannelLabels.push({
                hardwareChannelId: Number(hwCh ?? 0),
                pgn: labelPgn !== undefined ? Number(labelPgn) : undefined,
                instance: Number(instVal),
                label: labelText
              })
              debug(
                'PGN 130060 label from src %d: ch=%s PGN %s instance %s = %s',
                src,
                hwCh,
                labelPgn,
                instVal,
                labelText
              )
            }
            return
          }

          if (!DATA_INSTANCE_PGNS.has(n2k.pgn)) return

          const inst = Number(n2k.fields.instance ?? n2k.fields.Instance)
          if (isNaN(inst)) return

          let sourceLabel = ''
          let sourceEnum: number | undefined

          if (n2k.pgn === 130313) {
            // Humidity
            const srcField = n2k.fields.source ?? n2k.fields.Source
            if (typeof srcField === 'string') {
              sourceLabel = srcField
              sourceEnum = getEnumerationValue('HUMIDITY_SOURCE', srcField)
            } else if (typeof srcField === 'number') {
              sourceEnum = srcField
              sourceLabel =
                getEnumerationName('HUMIDITY_SOURCE', srcField) ||
                `Humidity Source ${srcField}`
            }
          } else {
            // Temperature PGNs (130312, 130316, 130823, etc.)
            const srcField = n2k.fields.source ?? n2k.fields.Source
            if (typeof srcField === 'string') {
              sourceLabel = srcField
              sourceEnum = getEnumerationValue('TEMPERATURE_SOURCE', srcField)
            } else if (typeof srcField === 'number') {
              sourceEnum = srcField
              sourceLabel =
                getEnumerationName('TEMPERATURE_SOURCE', srcField) ||
                `Temperature Source ${srcField}`
            }
          }

          const key = `${n2k.pgn}:${inst}:${sourceLabel}`
          if (!seen.has(key)) {
            seen.add(key)
            instances.push({
              pgn: n2k.pgn,
              instance: inst,
              sourceLabel,
              sourceEnum
            })
          }
        }

        app.on('N2KAnalyzerOut', listener)

        // Request PGN 130060 (Label) from the device
        if (n2kOutAvailable) {
          sendISORequest(app, src, 130060)
        }

        // Long-poll: we keep the N2KAnalyzerOut listener attached for
        // LISTEN_DURATION_MS while the device replies. If the client
        // disconnects before that, the listener would otherwise stay
        // attached for the full window and the timeout callback would
        // try to res.json() on a closed response, which throws. Track
        // the timer + listener and clean up on req close as well.
        let aborted = false
        const finishTimer = setTimeout(() => {
          if (aborted) return
          aborted = true
          app.removeListener('N2KAnalyzerOut', listener)
          instances.sort((a, b) => a.pgn - b.pgn || a.instance - b.instance)
          for (const inst of instances) {
            // Prefer N2K device labels (PGN 130060), fall back to local
            const deviceLabel =
              n2kLabels.get(`${inst.pgn}:${inst.instance}`) ??
              n2kLabels.get(`*:${inst.instance}`)
            if (deviceLabel) {
              inst.label = deviceLabel
            } else if (sourceRef) {
              const key = `${sourceRef}:${inst.pgn}:${inst.instance}`
              const lbl = localLabels[key]
              if (lbl) inst.label = lbl
            }
            // Attach hardware channel ID for write-back
            const hwCh =
              channelIds.get(`${inst.pgn}:${inst.instance}`) ??
              channelIds.get(`*:${inst.instance}`)
            if (hwCh !== undefined) inst.hardwareChannelId = hwCh
          }
          allChannelLabels.sort(
            (a, b) => a.hardwareChannelId - b.hardwareChannelId
          )
          if (!res.writableEnded) {
            res.json({
              instances,
              channelLabels: allChannelLabels
            } as DiscoverResult)
          }
        }, LISTEN_DURATION_MS)

        req.on('close', () => {
          if (aborted) return
          aborted = true
          clearTimeout(finishTimer)
          app.removeListener('N2KAnalyzerOut', listener)
        })
      }
    )

    // Save a per-channel label locally (fallback for devices without PGN 130060).
    // Labels from PGN 130060 (read from device) take priority over local labels.
    app.put(
      `${SERVERROUTESPREFIX}/n2kChannelLabel`,
      async (req: Request, res: Response) => {
        const { sourceRef, pgn, instance, label } = req.body as {
          sourceRef?: unknown
          pgn?: unknown
          instance?: unknown
          label?: unknown
        }
        if (
          typeof sourceRef !== 'string' ||
          !sourceRef ||
          typeof pgn !== 'number' ||
          !Number.isInteger(pgn) ||
          typeof instance !== 'number' ||
          !Number.isInteger(instance) ||
          (label !== undefined && typeof label !== 'string')
        ) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message:
              'sourceRef: string, pgn: integer, instance: integer required; label: string optional'
          })
          return
        }
        const labels = loadLabels(app)
        const key = `${sourceRef}:${pgn}:${instance}`
        if (label && label.trim()) {
          labels[key] = label.trim()
        } else {
          delete labels[key]
        }
        try {
          await saveLabels(app, labels)
        } catch (err) {
          console.error('Failed to save channel labels:', err)
          res.status(500).json({
            state: 'FAILED',
            statusCode: 500,
            message: 'Failed to write channel labels file'
          })
          return
        }
        debug('Channel label %s = %s', key, label || '(deleted)')
        res.json({ state: 'COMPLETED', statusCode: 200 })
      }
    )

    app.securityStrategy.addAdminMiddleware(
      `${SERVERROUTESPREFIX}/n2kRemoveSource`
    )

    app.securityStrategy.addAdminMiddleware(
      `${SERVERROUTESPREFIX}/resetN2kDevices`
    )

    app.post(
      `${SERVERROUTESPREFIX}/resetN2kDevices`,
      (_req: Request, res: Response) => {
        const now = Date.now()
        const sources = app.signalk?.sources
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sourceMeta = (app.signalk as any).sourceMeta as
          | Record<string, { lastSeen?: number }>
          | undefined
        const removedRefs: string[] = []

        if (sources && typeof sources === 'object') {
          for (const providerId of Object.keys(sources)) {
            const labelNode = sources[providerId]
            if (!labelNode || typeof labelNode !== 'object') continue
            if (labelNode.type && labelNode.type !== 'NMEA2000') continue
            for (const subKey of Object.keys(labelNode)) {
              if (subKey === 'label' || subKey === 'type') continue
              const sub = labelNode[subKey]
              if (!sub || typeof sub !== 'object' || !sub.n2k) continue
              const metaKey = `${providerId}.${subKey}`
              const lastSeen = sourceMeta?.[metaKey]?.lastSeen
              const stale =
                lastSeen === undefined || now - lastSeen >= ONLINE_THRESHOLD_MS
              if (!stale) continue

              const ref = `${providerId}.${subKey}`
              const cacheKeys: string[] = []
              const allRefs = new Set<string>([ref])
              for (const [key, delta] of Object.entries(
                app.deltaCache.sourceDeltas
              )) {
                if (!key.startsWith(providerId + '.')) continue
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const d = delta as any
                const src = d?.updates?.[0]?.source
                if (!src) continue
                const addr = String(src.src ?? '')
                const canName = src.canName ?? ''
                if (
                  subKey === addr ||
                  subKey === canName ||
                  key === ref ||
                  key.slice(providerId.length + 1) === subKey
                ) {
                  cacheKeys.push(key)
                  allRefs.add(key)
                  if (canName) allRefs.add(`${providerId}.${canName}`)
                  if (addr) allRefs.add(`${providerId}.${addr}`)
                }
              }
              for (const key of cacheKeys) {
                app.deltaCache.removeSourceDelta(key)
              }
              const addrNum = Number(subKey)
              if (!Number.isNaN(addrNum)) {
                knownAddresses.delete(addrNum)
                discoveredAddresses.delete(addrNum)
                // Drop the per-address last-seen so a different device
                // claiming this bus address later does not inherit a
                // stale online-since timestamp.
                frameLastSeenBySrc.delete(addrNum)
              }
              delete labelNode[subKey]
              if (sourceMeta) {
                delete sourceMeta[metaKey]
              }
              for (const r of allRefs) {
                onlineStates.delete(r)
                removedRefs.push(r)
              }
            }
          }
        }

        // Re-broadcast the fresh status set so the UI clears stale rows.
        app.emit('serverevent', {
          type: 'SOURCESTATUS',
          data: buildSourceStatuses()
        })

        debug('Reset N2K devices: removed %d stale entries', removedRefs.length)
        res.json({
          state: 'COMPLETED',
          statusCode: 200,
          message: `Cleared ${removedRefs.length} stale device entries`
        })
      }
    )

    app.delete(
      `${SERVERROUTESPREFIX}/n2kRemoveSource`,
      async (req: Request, res: Response) => {
        const sourceRef = req.query.sourceRef as string | undefined
        if (!sourceRef) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: 'sourceRef query parameter required'
          })
          return
        }

        const dotIdx = sourceRef.indexOf('.')
        if (dotIdx === -1) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: 'Invalid sourceRef format'
          })
          return
        }
        const connection = sourceRef.slice(0, dotIdx)
        const srcPart = sourceRef.slice(dotIdx + 1)

        // Find matching sourceDeltas entries — the key uses numeric address
        // (e.g. "can0.44") but the UI sourceRef may use canName
        // (e.g. "can0.c1789101e7e0b32b"). Collect all ref variants for
        // alias/label cleanup before deleting.
        const keysToRemove: string[] = []
        const addressesToRemove: number[] = []
        const allRefs = new Set<string>([sourceRef])
        for (const [key, delta] of Object.entries(
          app.deltaCache.sourceDeltas
        )) {
          if (!key.startsWith(connection + '.')) continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d = delta as any
          const src = d?.updates?.[0]?.source
          if (!src) continue
          const addr = String(src.src ?? '')
          const canName = src.canName ?? ''
          if (
            key === sourceRef ||
            srcPart === addr ||
            srcPart === canName ||
            key.slice(dotIdx + 1) === srcPart
          ) {
            keysToRemove.push(key)
            allRefs.add(key)
            if (canName) allRefs.add(`${connection}.${canName}`)
            if (addr) allRefs.add(`${connection}.${addr}`)
            if (typeof src.src === 'number') {
              addressesToRemove.push(src.src)
            } else if (!isNaN(Number(addr))) {
              addressesToRemove.push(Number(addr))
            }
          }
        }

        if (keysToRemove.length === 0) {
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `Source ${sourceRef} not found`
          })
          return
        }

        for (const key of keysToRemove) {
          app.deltaCache.removeSourceDelta(key)
        }

        // Remove from all address-keyed maps. Mirror the cleanup
        // resetN2kDevices does so a removed device cannot leave behind
        // stale online status or last-seen timestamps that a future
        // device claiming the same address would inherit.
        for (const addr of addressesToRemove) {
          knownAddresses.delete(addr)
          discoveredAddresses.delete(addr)
          frameLastSeenBySrc.delete(addr)
        }
        for (const ref of allRefs) {
          onlineStates.delete(ref)
        }

        // Prune the live Signal K tree too — without this the deleted
        // device keeps appearing in /signalk/v1/api/sources until the
        // server restarts (resetN2kDevices does the same prune).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sources = (app.signalk as any)?.sources
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sourceMeta = (app.signalk as any)?.sourceMeta
        if (sources?.[connection]) {
          const labelNode = sources[connection]
          for (const addr of addressesToRemove) {
            const subKey = String(addr)
            if (Object.prototype.hasOwnProperty.call(labelNode, subKey)) {
              delete labelNode[subKey]
            }
          }
          // Drop the connection wrapper if no devices remain so the
          // sources tree doesn't accumulate empty providers.
          const remaining = Object.keys(labelNode).filter(
            (k) => k !== 'type' && k !== 'label'
          )
          if (remaining.length === 0) {
            delete sources[connection]
          }
        }
        if (sourceMeta) {
          for (const ref of allRefs) {
            if (Object.prototype.hasOwnProperty.call(sourceMeta, ref)) {
              delete sourceMeta[ref]
            }
          }
        }

        // Clean up source aliases (in-memory; persisted below)
        const aliases = app.config.settings.sourceAliases
        let aliasChanged = false
        if (aliases) {
          for (const ref of allRefs) {
            if (ref in aliases) {
              delete aliases[ref]
              aliasChanged = true
            }
          }
        }

        // Clean up channel labels (best-effort: a write failure here
        // doesn't prevent the source-removal from completing — the
        // labels file just retains stale entries that won't match any
        // live source).
        const labels = loadLabels(app)
        const labelPrefixes = Array.from(allRefs).map((r) => r + ':')
        let labelsChanged = false
        for (const key of Object.keys(labels)) {
          if (labelPrefixes.some((p) => key.startsWith(p))) {
            delete labels[key]
            labelsChanged = true
          }
        }
        if (labelsChanged) {
          try {
            await saveLabels(app, labels)
          } catch (err) {
            debug(
              'Failed to save channel labels during source removal: %s',
              err
            )
          }
        }

        const respondOk = () => {
          debug(
            'Removed source %s (%d entries)',
            sourceRef,
            keysToRemove.length
          )
          res.json({
            state: 'COMPLETED',
            statusCode: 200,
            message: `Removed source ${sourceRef}`
          })
        }

        if (aliasChanged && aliases) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          writeSettingsFile(app as any, app.config.settings, (err: Error) => {
            if (err) {
              debug('Failed to save settings after alias cleanup: %s', err)
              res.status(500).json({
                state: 'FAILED',
                statusCode: 500,
                message: `Removed source ${sourceRef} from cache, but failed to persist alias cleanup`
              })
              return
            }
            app.emit('serverAdminEvent', {
              type: 'SOURCEALIASES',
              data: aliases
            })
            respondOk()
          })
        } else {
          respondOk()
        }
      }
    )

    // Send a PGN 126208 command to a device on the N2K bus.
    // Used by Source Discovery to change device instance or
    // installation descriptions.
    app.post(
      `${SERVERROUTESPREFIX}/n2kConfigDevice`,
      (req: Request, res: Response) => {
        if (!n2kOutAvailable) {
          res.status(503).json({
            state: 'FAILED',
            statusCode: 503,
            message: 'N2K output not available'
          })
          return
        }

        const { dst, field, value, currentValue, targetPgn } = req.body as {
          dst?: number
          field?: string
          value?: unknown
          currentValue?: number
          targetPgn?: number
        }

        if (
          typeof dst !== 'number' ||
          !knownAddresses.has(dst) ||
          typeof field !== 'string'
        ) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: 'Invalid parameters: need dst (known address) and field'
          })
          return
        }

        if (field === 'deviceInstance') {
          // PGN 126208 Command targeting PGN 60928:
          // field 3 = deviceInstanceLower (3 bits), field 4 = deviceInstanceUpper (5 bits)
          const instance = Number(value)
          if (isNaN(instance) || instance < 0 || instance > 253) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: 'deviceInstance must be 0-253'
            })
            return
          }
          const lower = instance & 0x07
          const upper = (instance >> 3) & 0x1f
          debug(
            'Sending device instance change to dst %d: %d (lower=%d, upper=%d)',
            dst,
            instance,
            lower,
            upper
          )
          app.emit('nmea2000JsonOut', {
            pgn: 126208,
            prio: 3,
            dst,
            fields: {
              'Function Code': 'Command',
              PGN: 60928,
              priority: 8,
              numberOfParameters: 2,
              list: [
                { parameter: 3, value: lower },
                { parameter: 4, value: upper }
              ]
            }
          })
          // Re-request Address Claim so sources data updates
          schedulePendingRequest(() => sendISORequest(app, dst, 60928), 1000)
        } else if (field === 'deviceInstanceLower') {
          // PGN 126208 Command targeting PGN 60928 field 3 only (data instance)
          const lower = Number(value)
          if (isNaN(lower) || lower < 0 || lower > 7) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: 'deviceInstanceLower (Data Instance) must be 0-7'
            })
            return
          }
          debug('Sending data instance change to dst %d: %d', dst, lower)
          app.emit('nmea2000JsonOut', {
            pgn: 126208,
            prio: 3,
            dst,
            fields: {
              'Function Code': 'Command',
              PGN: 60928,
              priority: 8,
              numberOfParameters: 1,
              list: [{ parameter: 3, value: lower }]
            }
          })
          // Re-request Address Claim so sources data updates
          schedulePendingRequest(() => sendISORequest(app, dst, 60928), 1000)
        } else if (
          field === 'installationDescription1' ||
          field === 'installationDescription2'
        ) {
          // PGN 126208 Write Fields targeting PGN 126998
          // Field 1 = Installation Description #1
          // Field 2 = Installation Description #2
          const fieldOrder = field === 'installationDescription1' ? 1 : 2
          const text = String(value || '')
          debug(
            'Sending installation description %d to dst %d: %s',
            fieldOrder,
            dst,
            text
          )
          app.emit('nmea2000JsonOut', {
            pgn: 126208,
            prio: 3,
            dst,
            fields: {
              'Function Code': 'Command',
              PGN: 126998,
              priority: 8,
              numberOfParameters: 1,
              list: [{ parameter: fieldOrder, value: text }]
            }
          })
          // Re-request Configuration Information so sources data updates.
          // Two requests: first after 1.5s (device needs time to process
          // the command), second at 3s as a safety net in case the first
          // response arrived before the device finished updating both fields.
          schedulePendingRequest(() => sendISORequest(app, dst, 126998), 1500)
          schedulePendingRequest(() => sendISORequest(app, dst, 126998), 3000)
        } else if (field === 'batteryInstance') {
          // PGN 126208 targeting PGN 127508 (Battery Status):
          // field order 1 = instance (8 bits, 0-252)
          const instance = Number(value)
          if (isNaN(instance) || instance < 0 || instance > 252) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: 'batteryInstance must be 0-252'
            })
            return
          }
          if (currentValue !== undefined) {
            // Write Fields (FC 5) with selection pair to target specific instance
            debug(
              'Sending battery instance change to dst %d: %d -> %d (Write Fields)',
              dst,
              currentValue,
              instance
            )
            app.emit('nmea2000JsonOut', {
              pgn: 126208,
              prio: 3,
              dst,
              fields: {
                'Function Code': 'Write Fields',
                PGN: 127508,
                uniqueId: 0,
                numberOfSelectionPairs: 1,
                numberOfParameters: 1,
                list: [{ selectionParameter: 1, selectionValue: currentValue }],
                list2: [{ parameter: 1, value: instance }]
              }
            })
          } else {
            // Command (FC 1) for simple single-instance devices
            debug(
              'Sending battery instance change to dst %d: %d',
              dst,
              instance
            )
            app.emit('nmea2000JsonOut', {
              pgn: 126208,
              prio: 3,
              dst,
              fields: {
                'Function Code': 'Command',
                PGN: 127508,
                priority: 8,
                numberOfParameters: 1,
                list: [{ parameter: 1, value: instance }]
              }
            })
          }
        } else if (field === 'dcInstance') {
          // PGN 126208 targeting PGN 127506 (DC Detailed Status):
          // field order 2 = instance (8 bits, 0-252)
          const instance = Number(value)
          if (isNaN(instance) || instance < 0 || instance > 252) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: 'dcInstance must be 0-252'
            })
            return
          }
          if (currentValue !== undefined) {
            // Write Fields (FC 5) with selection pair to target specific instance
            debug(
              'Sending DC instance change to dst %d: %d -> %d (Write Fields)',
              dst,
              currentValue,
              instance
            )
            app.emit('nmea2000JsonOut', {
              pgn: 126208,
              prio: 3,
              dst,
              fields: {
                'Function Code': 'Write Fields',
                PGN: 127506,
                uniqueId: 0,
                numberOfSelectionPairs: 1,
                numberOfParameters: 1,
                list: [{ selectionParameter: 2, selectionValue: currentValue }],
                list2: [{ parameter: 2, value: instance }]
              }
            })
          } else {
            // Command (FC 1) for simple single-instance devices
            debug('Sending DC instance change to dst %d: %d', dst, instance)
            app.emit('nmea2000JsonOut', {
              pgn: 126208,
              prio: 3,
              dst,
              fields: {
                'Function Code': 'Command',
                PGN: 127506,
                priority: 8,
                numberOfParameters: 1,
                list: [{ parameter: 2, value: instance }]
              }
            })
          }
        } else if (field === 'temperatureInstance') {
          // PGN 126208 Write Fields targeting a temperature PGN
          // (130312, 130316, or 130823): field 2 = Instance
          const pgn = targetPgn || 130312
          const instance = Number(value)
          if (isNaN(instance) || instance < 0 || instance > 252) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: 'temperatureInstance must be 0-252'
            })
            return
          }
          if (currentValue === undefined) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: 'currentValue required to target specific channel'
            })
            return
          }
          debug(
            'Sending temperature instance change to dst %d PGN %d: %d -> %d',
            dst,
            pgn,
            currentValue,
            instance
          )
          app.emit('nmea2000JsonOut', {
            pgn: 126208,
            prio: 3,
            dst,
            fields: {
              'Function Code': 'Write Fields',
              PGN: pgn,
              uniqueId: 0,
              numberOfSelectionPairs: 1,
              numberOfParameters: 1,
              list: [{ selectionParameter: 2, selectionValue: currentValue }],
              list2: [{ parameter: 2, value: instance }]
            }
          })
        } else if (field === 'temperatureSource') {
          // PGN 126208 Write Fields targeting a temperature PGN:
          // field 3 = Source (TEMPERATURE_SOURCE enum)
          const pgn = targetPgn || 130312
          const sourceType = Number(value)
          if (isNaN(sourceType) || sourceType < 0 || sourceType > 15) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: 'temperatureSource must be 0-15'
            })
            return
          }
          if (currentValue === undefined) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message:
                'currentValue (instance number) required to target specific channel'
            })
            return
          }
          debug(
            'Sending temperature source change to dst %d PGN %d instance %d: source=%d (%s)',
            dst,
            pgn,
            currentValue,
            sourceType,
            getEnumerationName('TEMPERATURE_SOURCE', sourceType) || 'unknown'
          )
          app.emit('nmea2000JsonOut', {
            pgn: 126208,
            prio: 3,
            dst,
            fields: {
              'Function Code': 'Write Fields',
              PGN: pgn,
              uniqueId: 0,
              numberOfSelectionPairs: 1,
              numberOfParameters: 1,
              list: [{ selectionParameter: 2, selectionValue: currentValue }],
              list2: [{ parameter: 3, value: sourceType }]
            }
          })
        } else if (field === 'humidityInstance') {
          // PGN 126208 Write Fields targeting PGN 130313: field 2 = Instance
          const instance = Number(value)
          if (isNaN(instance) || instance < 0 || instance > 252) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: 'humidityInstance must be 0-252'
            })
            return
          }
          if (currentValue === undefined) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: 'currentValue required to target specific channel'
            })
            return
          }
          debug(
            'Sending humidity instance change to dst %d: %d -> %d',
            dst,
            currentValue,
            instance
          )
          app.emit('nmea2000JsonOut', {
            pgn: 126208,
            prio: 3,
            dst,
            fields: {
              'Function Code': 'Write Fields',
              PGN: 130313,
              uniqueId: 0,
              numberOfSelectionPairs: 1,
              numberOfParameters: 1,
              list: [{ selectionParameter: 2, selectionValue: currentValue }],
              list2: [{ parameter: 2, value: instance }]
            }
          })
        } else if (field === 'humiditySource') {
          // PGN 126208 Write Fields targeting PGN 130313: field 3 = Source
          const sourceType = Number(value)
          if (isNaN(sourceType) || sourceType < 0 || sourceType > 1) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: 'humiditySource must be 0-1'
            })
            return
          }
          if (currentValue === undefined) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message:
                'currentValue (instance number) required to target specific channel'
            })
            return
          }
          debug(
            'Sending humidity source change to dst %d instance %d: source=%d (%s)',
            dst,
            currentValue,
            sourceType,
            getEnumerationName('HUMIDITY_SOURCE', sourceType) || 'unknown'
          )
          app.emit('nmea2000JsonOut', {
            pgn: 126208,
            prio: 3,
            dst,
            fields: {
              'Function Code': 'Write Fields',
              PGN: 130313,
              uniqueId: 0,
              numberOfSelectionPairs: 1,
              numberOfParameters: 1,
              list: [{ selectionParameter: 2, selectionValue: currentValue }],
              list2: [{ parameter: 3, value: sourceType }]
            }
          })
        } else if (field === 'switchBankInstance') {
          // PGN 126208 Command targeting PGN 127501: field 1 = Instance
          const instance = Number(value)
          if (isNaN(instance) || instance < 0 || instance > 252) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: 'switchBankInstance must be 0-252'
            })
            return
          }
          if (currentValue !== undefined) {
            debug(
              'Sending switch bank instance change to dst %d: %d -> %d',
              dst,
              currentValue,
              instance
            )
            app.emit('nmea2000JsonOut', {
              pgn: 126208,
              prio: 3,
              dst,
              fields: {
                'Function Code': 'Write Fields',
                PGN: 127501,
                uniqueId: 0,
                numberOfSelectionPairs: 1,
                numberOfParameters: 1,
                list: [{ selectionParameter: 1, selectionValue: currentValue }],
                list2: [{ parameter: 1, value: instance }]
              }
            })
          } else {
            debug(
              'Sending switch bank instance change to dst %d: %d',
              dst,
              instance
            )
            app.emit('nmea2000JsonOut', {
              pgn: 126208,
              prio: 3,
              dst,
              fields: {
                'Function Code': 'Command',
                PGN: 127501,
                priority: 8,
                numberOfParameters: 1,
                list: [{ parameter: 1, value: instance }]
              }
            })
          }
        } else {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: `Unknown field: ${field}. Supported: deviceInstance, deviceInstanceLower, installationDescription1, installationDescription2, batteryInstance, dcInstance, temperatureInstance, temperatureSource, humidityInstance, humiditySource, switchBankInstance`
          })
          return
        }

        res.json({
          state: 'COMPLETED',
          statusCode: 200,
          message: `Configuration command sent to device ${dst}`
        })
      }
    )
  }

  api.stop = () => {
    for (const timer of pendingTimers) {
      clearTimeout(timer)
    }
    pendingTimers.clear()
    for (const timer of sweepTimers) {
      clearTimeout(timer)
    }
    sweepTimers.clear()
    for (const timer of requestTimers) {
      clearTimeout(timer)
    }
    requestTimers.clear()
    if (statusTickInterval) {
      clearInterval(statusTickInterval)
      statusTickInterval = undefined
    }
    onlineStates.clear()
    frameLastSeenBySrc.clear()
    app.removeListener('N2KAnalyzerOut', n2kListener)
    app.removeListener('nmea2000OutAvailable', n2kOutListener)
    app.removeListener('sourceRefChanged', sourceRefChangedListener)
  }

  return api
}
