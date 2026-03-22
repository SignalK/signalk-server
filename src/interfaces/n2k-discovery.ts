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
import {
  getAllPGNs,
  getEnumerationName,
  getEnumerationValue
} from '@canboat/ts-pgns'

const debug = createDebug('signalk-server:interfaces:n2k-discovery')

const REQUEST_INTERVAL_MS = 500

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

interface N2kPGN {
  src: number
  pgn: number
  fields?: Record<string, unknown>
}

// Derive PGN sets from canboat.json metadata at module load time.
// DATA_INSTANCE_PGNS: temp/humidity PGNs where the unique key is instance+source
// INSTANCE_FIELD_PGNS: all PGNs with a data-instance field (PartOfPrimaryKey)
const DATA_INSTANCE_PGNS = new Set<number>()
const INSTANCE_FIELD_PGNS = new Set<number>()

for (const def of getAllPGNs()) {
  const hasInstanceKey = def.Fields.some(
    (f) => f.Id === 'instance' && f.PartOfPrimaryKey
  )
  if (!hasInstanceKey) continue
  INSTANCE_FIELD_PGNS.add(def.PGN)

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
  try {
    return JSON.parse(fs.readFileSync(labelsFilePath(app), 'utf-8'))
  } catch {
    return {}
  }
}

function saveLabels(app: N2kDiscoveryApp, labels: ChannelLabels): void {
  fs.writeFileSync(labelsFilePath(app), JSON.stringify(labels, null, 2))
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
    'Sending ISO Requests for PGN 60928 + 126996 to %d devices (one at a time)',
    addrs.length
  )

  addrs.forEach((addr, i) => {
    // Request Address Claim (60928) first, then Product Information (126996)
    const timer1 = setTimeout(
      () => {
        pendingTimers.delete(timer1)
        sendISORequest(app, addr, 60928)
      },
      i * REQUEST_INTERVAL_MS * 2
    )
    pendingTimers.add(timer1)

    const timer2 = setTimeout(
      () => {
        pendingTimers.delete(timer2)
        sendISORequest(app, addr)
      },
      i * REQUEST_INTERVAL_MS * 2 + REQUEST_INTERVAL_MS
    )
    pendingTimers.add(timer2)
  })

  return addrs.length
}

module.exports = (app: N2kDiscoveryApp) => {
  let n2kOutAvailable = false
  const knownAddresses = new Set<number>()
  const discoveredAddresses = new Set<number>()
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>()
  // Passive tracking: src -> pgn -> Set<dataInstance>
  const pgnDataInstances = new Map<number, Map<number, Set<number>>>()
  // Compound keys for temp/humidity PGNs: src -> pgn -> Set<"instance:source">
  const pgnSourceKeys = new Map<number, Map<number, Set<string>>>()
  const api = new Interface()

  const n2kListener = (pgn: unknown) => {
    const n2k = pgn as N2kPGN
    if (typeof n2k.src === 'number' && n2k.src > 0 && n2k.src < 254) {
      knownAddresses.add(n2k.src)
      // Track discovery responses (Address Claim + Product Info)
      if (n2k.pgn === 60928 || n2k.pgn === 126996) {
        discoveredAddresses.add(n2k.src)
      }
      // Track data instances per PGN per device
      if (INSTANCE_FIELD_PGNS.has(n2k.pgn) && n2k.fields) {
        const inst = Number(
          (n2k.fields as Record<string, unknown>).instance ??
            (n2k.fields as Record<string, unknown>).Instance
        )
        if (!isNaN(inst)) {
          let deviceMap = pgnDataInstances.get(n2k.src)
          if (!deviceMap) {
            deviceMap = new Map()
            pgnDataInstances.set(n2k.src, deviceMap)
          }
          let instances = deviceMap.get(n2k.pgn)
          if (!instances) {
            instances = new Set()
            deviceMap.set(n2k.pgn, instances)
          }
          instances.add(inst)
          // For temp/humidity PGNs, also track instance:source compound keys
          if (DATA_INSTANCE_PGNS.has(n2k.pgn)) {
            const src =
              (n2k.fields as Record<string, unknown>).source ??
              (n2k.fields as Record<string, unknown>).Source
            if (src !== undefined) {
              let srcDeviceMap = pgnSourceKeys.get(n2k.src)
              if (!srcDeviceMap) {
                srcDeviceMap = new Map()
                pgnSourceKeys.set(n2k.src, srcDeviceMap)
              }
              let keys = srcDeviceMap.get(n2k.pgn)
              if (!keys) {
                keys = new Set()
                srcDeviceMap.set(n2k.pgn, keys)
              }
              keys.add(`${inst}:${src}`)
            }
          }
        }
      }
    }
  }

  const n2kOutListener = () => {
    n2kOutAvailable = true
    // Auto-discover after 5s delay for bus to settle and
    // knownAddresses to populate from incoming traffic
    const timer = setTimeout(() => {
      pendingTimers.delete(timer)
      debug('Auto-requesting product info from all N2K devices')
      requestProductInfo(
        app,
        knownAddresses,
        pendingTimers,
        discoveredAddresses
      )
    }, 5000)
    pendingTimers.add(timer)
  }

  api.start = () => {
    app.on('N2KAnalyzerOut', n2kListener)
    app.on('nmea2000OutAvailable', n2kOutListener)

    app.securityStrategy.addAdminMiddleware(
      `${SERVERROUTESPREFIX}/n2kConfigDevice`
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
        const estimatedMs = deviceCount * REQUEST_INTERVAL_MS * 2
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
        const instanceData: Record<string, Record<string, number[]>> = {}
        for (const [src, pgns] of pgnDataInstances) {
          const pgnMap: Record<string, number[]> = {}
          for (const [pgn, insts] of pgns) {
            pgnMap[String(pgn)] = Array.from(insts).sort((a, b) => a - b)
          }
          instanceData[String(src)] = pgnMap
        }
        const sourceKeyData: Record<string, Record<string, string[]>> = {}
        for (const [src, pgns] of pgnSourceKeys) {
          const pgnMap: Record<string, string[]> = {}
          for (const [pgn, keys] of pgns) {
            pgnMap[String(pgn)] = Array.from(keys).sort()
          }
          sourceKeyData[String(src)] = pgnMap
        }
        res.json({
          knownAddresses: Array.from(knownAddresses),
          discoveredAddresses: Array.from(discoveredAddresses),
          n2kOutAvailable,
          pgnDataInstances: instanceData,
          pgnSourceKeys: sourceKeyData
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
        if (isNaN(src) || src < 1 || src > 253) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: 'src query parameter required (1-253)'
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

        const discoverTimer = setTimeout(() => {
          pendingTimers.delete(discoverTimer)
          app.removeListener('N2KAnalyzerOut', listener)
          // Sort by PGN then instance
          instances.sort((a, b) => a.pgn - b.pgn || a.instance - b.instance)
          // Attach labels and hardware channel IDs
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
          res.json({
            instances,
            channelLabels: allChannelLabels
          } as DiscoverResult)
        }, LISTEN_DURATION_MS)
        pendingTimers.add(discoverTimer)
      }
    )

    app.securityStrategy.addAdminMiddleware(
      `${SERVERROUTESPREFIX}/n2kChannelLabel`
    )

    // Save a per-channel label locally (fallback for devices without PGN 130060).
    // Labels from PGN 130060 (read from device) take priority over local labels.
    app.put(
      `${SERVERROUTESPREFIX}/n2kChannelLabel`,
      (req: Request, res: Response) => {
        const { sourceRef, pgn, instance, label } = req.body as {
          sourceRef?: string
          pgn?: number
          instance?: number
          label?: string
        }
        if (!sourceRef || pgn === undefined || instance === undefined) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: 'sourceRef, pgn, and instance are required'
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
        saveLabels(app, labels)
        debug('Channel label %s = %s', key, label || '(deleted)')
        res.json({ state: 'COMPLETED', statusCode: 200 })
      }
    )

    app.securityStrategy.addAdminMiddleware(
      `${SERVERROUTESPREFIX}/n2kRemoveSource`
    )

    app.delete(
      `${SERVERROUTESPREFIX}/n2kRemoveSource`,
      (req: Request, res: Response) => {
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

        // Remove from knownAddresses and discoveredAddresses
        for (const addr of addressesToRemove) {
          knownAddresses.delete(addr)
          discoveredAddresses.delete(addr)
        }

        // Clean up source aliases
        const aliases = app.config.settings.sourceAliases
        if (aliases) {
          let aliasChanged = false
          for (const ref of allRefs) {
            if (ref in aliases) {
              delete aliases[ref]
              aliasChanged = true
            }
          }
          if (aliasChanged) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            writeSettingsFile(app as any, app.config.settings, (err: Error) => {
              if (err) {
                debug('Failed to save settings after alias cleanup: %s', err)
              }
            })
            app.emit('serverAdminEvent', {
              type: 'SOURCEALIASES',
              data: aliases
            })
          }
        }

        // Clean up channel labels
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
          saveLabels(app, labels)
        }

        debug('Removed source %s (%d entries)', sourceRef, keysToRemove.length)
        res.json({
          state: 'COMPLETED',
          statusCode: 200,
          message: `Removed source ${sourceRef}`
        })
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
          setTimeout(() => sendISORequest(app, dst, 60928), 1000)
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
          setTimeout(() => sendISORequest(app, dst, 60928), 1000)
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
          setTimeout(() => sendISORequest(app, dst, 126998), 1500)
          setTimeout(() => sendISORequest(app, dst, 126998), 3000)
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
    app.removeListener('N2KAnalyzerOut', n2kListener)
    app.removeListener('nmea2000OutAvailable', n2kOutListener)
  }

  return api
}
