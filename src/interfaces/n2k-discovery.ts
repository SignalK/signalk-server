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
  config: { defaults: unknown; configPath: string }
}

interface N2kPGN {
  src: number
  pgn: number
  fields?: Record<string, unknown>
}

// PGNs that carry per-channel data instances.
// PGN 127501 (Switch Bank) is excluded — its bank instance is the same as
// the device instance (deviceInstanceLower) already shown in the table.
// The individual indicators (channels) within a bank are not configurable.
const DATA_INSTANCE_PGNS = new Set([
  130312, // Temperature
  130313, // Humidity
  130316, // Temperature Extended Range
  130823 // Maretron proprietary temperature
])

// NMEA 2000 TEMPERATURE_SOURCE enum labels
const TEMPERATURE_SOURCE: Record<number, string> = {
  0: 'Sea Temperature',
  1: 'Outside Temperature',
  2: 'Inside Temperature',
  3: 'Engine Room Temperature',
  4: 'Main Cabin Temperature',
  5: 'Live Well Temperature',
  6: 'Bait Well Temperature',
  7: 'Refrigeration Temperature',
  8: 'Heating System Temperature',
  9: 'Dew Point Temperature',
  10: 'Apparent Wind Chill Temperature',
  11: 'Theoretical Wind Chill Temperature',
  12: 'Heat Index Temperature',
  13: 'Freezer Temperature',
  14: 'Exhaust Gas Temperature',
  15: 'Shaft Seal Temperature'
}

const HUMIDITY_SOURCE: Record<number, string> = {
  0: 'Inside',
  1: 'Outside'
}

// Reverse lookups: string label → enum number
const TEMPERATURE_SOURCE_BY_NAME = new Map<string, number>(
  Object.entries(TEMPERATURE_SOURCE).map(([k, v]) => [v, Number(k)])
)
const HUMIDITY_SOURCE_BY_NAME = new Map<string, number>(
  Object.entries(HUMIDITY_SOURCE).map(([k, v]) => [v, Number(k)])
)

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
  pendingTimers: Set<ReturnType<typeof setTimeout>>
): number {
  // Cancel any in-flight requests from a previous sweep
  for (const timer of pendingTimers) {
    clearTimeout(timer)
  }
  pendingTimers.clear()

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
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>()
  const api = new Interface()

  const n2kListener = (pgn: unknown) => {
    const n2k = pgn as N2kPGN
    if (typeof n2k.src === 'number' && n2k.src > 0 && n2k.src < 254) {
      knownAddresses.add(n2k.src)
    }
  }

  const n2kOutListener = () => {
    n2kOutAvailable = true
    // Auto-discover after 5s delay for bus to settle and
    // knownAddresses to populate from incoming traffic
    const timer = setTimeout(() => {
      pendingTimers.delete(timer)
      debug('Auto-requesting product info from all N2K devices')
      requestProductInfo(app, knownAddresses, pendingTimers)
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
          pendingTimers
        )
        const estimatedMs = deviceCount * REQUEST_INTERVAL_MS * 2
        res.json({
          state: 'COMPLETED',
          statusCode: 200,
          message: `Discovery request sent to ${deviceCount} devices (~${Math.ceil(estimatedMs / 1000)}s)`
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
              sourceEnum = HUMIDITY_SOURCE_BY_NAME.get(srcField)
            } else if (typeof srcField === 'number') {
              sourceEnum = srcField
              sourceLabel =
                HUMIDITY_SOURCE[srcField] || `Humidity Source ${srcField}`
            }
          } else {
            // Temperature PGNs (130312, 130316, 130823)
            const srcField = n2k.fields.source ?? n2k.fields.Source
            if (typeof srcField === 'string') {
              sourceLabel = srcField
              sourceEnum = TEMPERATURE_SOURCE_BY_NAME.get(srcField)
            } else if (typeof srcField === 'number') {
              sourceEnum = srcField
              sourceLabel =
                TEMPERATURE_SOURCE[srcField] || `Temperature Source ${srcField}`
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

        setTimeout(() => {
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
      }
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
            TEMPERATURE_SOURCE[sourceType] || 'unknown'
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
            HUMIDITY_SOURCE[sourceType] || 'unknown'
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
