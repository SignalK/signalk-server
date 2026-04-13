import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:ble:remote')

import { IRouter, Request, Response } from 'express'
import WebSocket from 'ws'
import {
  BLEAdvertisement,
  BLEGatewayAdvertisementBatch,
  BLEProvider,
  GATTSubscriptionDescriptor,
  GATTSubscriptionHandle
} from '@signalk/server-api'

// How long to keep a recently-disconnected gateway in the list
const OFFLINE_SNAPSHOT_MS = 60_000

// Ping interval for WebSocket keepalive
const PING_INTERVAL_MS = 30_000

// ---------------------------------------------------------------------------
// BLE AD type constants (Bluetooth Core Supplement, Part A)
// ---------------------------------------------------------------------------

const AD_TYPE_FLAGS = 0x01
const AD_TYPE_INCOMPLETE_16_UUID = 0x02
const AD_TYPE_COMPLETE_16_UUID = 0x03
const AD_TYPE_INCOMPLETE_32_UUID = 0x04
const AD_TYPE_COMPLETE_32_UUID = 0x05
const AD_TYPE_INCOMPLETE_128_UUID = 0x06
const AD_TYPE_COMPLETE_128_UUID = 0x07
const AD_TYPE_SERVICE_DATA_16 = 0x16
const AD_TYPE_SERVICE_DATA_32 = 0x20
const AD_TYPE_SERVICE_DATA_128 = 0x21
const AD_TYPE_TX_POWER = 0x0a
const AD_TYPE_MANUFACTURER_DATA = 0xff

interface ParsedAdv {
  manufacturerData?: Record<number, string>
  serviceData?: Record<string, string>
  serviceUuids?: string[]
  txPower?: number
  connectable?: boolean
}

/**
 * Parse raw BLE advertisement bytes (AD structures) into typed fields.
 *
 * The input is a hex string encoding the raw advertisement payload as
 * received by the ESP32 scanner.  Each AD structure is:
 *   [length: 1 byte] [type: 1 byte] [data: length-1 bytes]
 */
function parseAdvData(hex: string): ParsedAdv {
  const buf = Buffer.from(hex, 'hex')
  const result: ParsedAdv = {}
  let offset = 0

  while (offset < buf.length) {
    const len = buf[offset]
    if (len === 0 || offset + len >= buf.length) break
    const adType = buf[offset + 1]
    const data = buf.subarray(offset + 2, offset + 1 + len)

    switch (adType) {
      case AD_TYPE_FLAGS: {
        // Bit 1 of flags = LE General Discoverable, bit 2 = BR/EDR not supported
        // connectable is inferred from AD flags: devices that advertise are generally connectable
        // unless they set the non-connectable flag.  A more reliable source is the
        // advertisement PDU type (ADV_IND vs ADV_NONCONN_IND), but that is not
        // available in the raw AD payload.  We leave connectable undefined here
        // and let the caller decide based on other signals.
        break
      }

      case AD_TYPE_MANUFACTURER_DATA: {
        if (data.length >= 2) {
          const companyId = data.readUInt16LE(0)
          const payload = data.subarray(2).toString('hex')
          if (!result.manufacturerData) result.manufacturerData = {}
          result.manufacturerData[companyId] = payload
        }
        break
      }

      case AD_TYPE_SERVICE_DATA_16: {
        if (data.length >= 2) {
          const uuid = formatUuid16(data.readUInt16LE(0))
          const payload = data.subarray(2).toString('hex')
          if (!result.serviceData) result.serviceData = {}
          result.serviceData[uuid] = payload
        }
        break
      }

      case AD_TYPE_SERVICE_DATA_32: {
        if (data.length >= 4) {
          const uuid = formatUuid32(data.readUInt32LE(0))
          const payload = data.subarray(4).toString('hex')
          if (!result.serviceData) result.serviceData = {}
          result.serviceData[uuid] = payload
        }
        break
      }

      case AD_TYPE_SERVICE_DATA_128: {
        if (data.length >= 16) {
          const uuid = formatUuid128(data.subarray(0, 16))
          const payload = data.subarray(16).toString('hex')
          if (!result.serviceData) result.serviceData = {}
          result.serviceData[uuid] = payload
        }
        break
      }

      case AD_TYPE_INCOMPLETE_16_UUID:
      case AD_TYPE_COMPLETE_16_UUID: {
        if (!result.serviceUuids) result.serviceUuids = []
        for (let i = 0; i + 1 < data.length; i += 2) {
          result.serviceUuids.push(formatUuid16(data.readUInt16LE(i)))
        }
        break
      }

      case AD_TYPE_INCOMPLETE_32_UUID:
      case AD_TYPE_COMPLETE_32_UUID: {
        if (!result.serviceUuids) result.serviceUuids = []
        for (let i = 0; i + 3 < data.length; i += 4) {
          result.serviceUuids.push(formatUuid32(data.readUInt32LE(i)))
        }
        break
      }

      case AD_TYPE_INCOMPLETE_128_UUID:
      case AD_TYPE_COMPLETE_128_UUID: {
        if (!result.serviceUuids) result.serviceUuids = []
        for (let i = 0; i + 15 < data.length; i += 16) {
          result.serviceUuids.push(formatUuid128(data.subarray(i, i + 16)))
        }
        break
      }

      case AD_TYPE_TX_POWER: {
        if (data.length >= 1) {
          result.txPower = data.readInt8(0)
        }
        break
      }
    }

    offset += 1 + len
  }

  return result
}

/** Expand a 16-bit UUID to the full 128-bit Bluetooth Base UUID string. */
function formatUuid16(short: number): string {
  return `0000${short.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`
}

/** Expand a 32-bit UUID to the full 128-bit Bluetooth Base UUID string. */
function formatUuid32(val: number): string {
  return `${(val >>> 0).toString(16).padStart(8, '0')}-0000-1000-8000-00805f9b34fb`
}

/** Format a 128-bit UUID from a 16-byte little-endian buffer. */
function formatUuid128(buf: Buffer): string {
  // BLE transmits UUIDs in little-endian order; reverse to standard big-endian
  const bytes = Array.from(buf).reverse()
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionState {
  descriptor: GATTSubscriptionDescriptor
  callback: (charUuid: string, data: Buffer) => void
  connected: boolean
  connectCallbacks: Array<() => void>
  disconnectCallbacks: Array<() => void>
}

interface GatewaySnapshot {
  gatewayId: string
  ipAddress: string | null
  mac: string | null
  hostname: string | null
  firmware: string | null
  maxSlots: number
  connectedAt: number
  disconnectedAt: number
  lastUptime: number
  lastFreeHeap: number
}

// ---------------------------------------------------------------------------
// RemoteGATTSession — one per connected ESP32
// ---------------------------------------------------------------------------

class RemoteGATTSession {
  readonly gatewayId: string
  readonly ws: WebSocket
  ipAddress: string | null = null
  mac: string | null = null
  hostname: string | null = null
  firmware: string | null = null
  maxSlots = 0
  activeSlots = 0
  uptime = 0
  freeHeap = 0
  readonly connectedAt: number

  private sessions = new Map<string, SessionState>()
  private nextSessionId = 1

  constructor(gatewayId: string, ws: WebSocket) {
    this.gatewayId = gatewayId
    this.ws = ws
    this.connectedAt = Date.now()
  }

  handleHello(msg: Record<string, unknown>) {
    this.maxSlots = (msg.max_gatt_connections as number) || 0
    this.activeSlots = (msg.active_gatt_connections as number) || 0
    this.firmware = (msg.firmware as string) || null
    this.mac = (msg.mac as string) || null
    this.hostname = (msg.hostname as string) || null
    debug(
      `[${this.gatewayId}] hello: ${this.maxSlots} max slots, fw=${this.firmware}, mac=${this.mac}`
    )
  }

  handleMessage(msg: Record<string, unknown>) {
    const sessionId = msg.session_id as string
    switch (msg.type) {
      case 'gatt_connected': {
        const session = this.sessions.get(sessionId)
        if (!session) return
        session.connected = true
        for (const cb of session.connectCallbacks) {
          try {
            cb()
          } catch {
            /* ignore */
          }
        }
        debug(
          `[${this.gatewayId}] session ${sessionId} connected to ${msg.mac}`
        )
        break
      }
      case 'gatt_data': {
        const session = this.sessions.get(sessionId)
        if (!session?.callback) return
        try {
          session.callback(
            msg.uuid as string,
            Buffer.from(msg.data as string, 'hex')
          )
        } catch (e: unknown) {
          debug(
            `[${this.gatewayId}] data callback error: ${(e as Error).message}`
          )
        }
        break
      }
      case 'gatt_disconnected': {
        const session = this.sessions.get(sessionId)
        if (!session) return
        session.connected = false
        for (const cb of session.disconnectCallbacks) {
          try {
            cb()
          } catch {
            /* ignore */
          }
        }
        debug(
          `[${this.gatewayId}] session ${sessionId} disconnected: ${msg.reason}`
        )
        break
      }
      case 'gatt_error': {
        const session = this.sessions.get(sessionId)
        if (!session) return
        session.connected = false
        for (const cb of session.disconnectCallbacks) {
          try {
            cb()
          } catch {
            /* ignore */
          }
        }
        this.sessions.delete(sessionId)
        this.activeSlots = Math.max(0, this.activeSlots - 1)
        debug(`[${this.gatewayId}] session ${sessionId} error: ${msg.error}`)
        break
      }
      case 'status': {
        this.activeSlots = (msg.active_gatt_connections as number) || 0
        this.maxSlots = (msg.max_gatt_connections as number) || this.maxSlots
        this.uptime = (msg.uptime as number) || 0
        this.freeHeap = (msg.free_heap as number) || 0
        break
      }
    }
  }

  availableGATTSlots(): number {
    return Math.max(0, this.maxSlots - this.activeSlots)
  }

  async subscribeGATT(
    descriptor: GATTSubscriptionDescriptor,
    callback: (charUuid: string, data: Buffer) => void
  ): Promise<GATTSubscriptionHandle> {
    const sessionId = `s${this.nextSessionId++}`

    const cmd: Record<string, unknown> = {
      type: 'gatt_subscribe',
      session_id: sessionId,
      mac: descriptor.mac,
      service: descriptor.service
    }
    if (descriptor.notify) cmd.notify = descriptor.notify
    if (descriptor.poll) {
      cmd.poll = descriptor.poll.map((p) => ({
        uuid: p.uuid,
        interval_ms: p.intervalMs
      }))
    }
    if (descriptor.init) cmd.init = descriptor.init
    if (descriptor.periodicWrite) {
      cmd.periodic_write = descriptor.periodicWrite.map((pw) => ({
        uuid: pw.uuid,
        data: pw.data,
        interval_ms: pw.intervalMs
      }))
    }

    this.ws.send(JSON.stringify(cmd))

    const session: SessionState = {
      descriptor,
      callback,
      connected: false,
      connectCallbacks: [],
      disconnectCallbacks: []
    }
    this.sessions.set(sessionId, session)
    this.activeSlots++

    const fireDisconnect = () => {
      session.connected = false
      for (const cb of session.disconnectCallbacks) {
        try {
          cb()
        } catch {
          /* ignore */
        }
      }
    }

    const handle: GATTSubscriptionHandle & { _fireDisconnect: () => void } = {
      read: async (_charUuid: string) => {
        // Remote gateways don't currently support ad-hoc reads;
        // fall back to connectGATT for sensors that need this.
        throw new Error(
          'Ad-hoc GATT read not supported on remote gateways — use connectGATT'
        )
      },
      write: async (charUuid: string, data: Buffer, withResponse?: boolean) => {
        this.ws.send(
          JSON.stringify({
            type: 'gatt_write',
            session_id: sessionId,
            uuid: charUuid,
            data: data.toString('hex'),
            ...(withResponse !== undefined && { with_response: withResponse })
          })
        )
      },
      close: async () => {
        this.ws.send(
          JSON.stringify({ type: 'gatt_close', session_id: sessionId })
        )
        this.sessions.delete(sessionId)
        this.activeSlots = Math.max(0, this.activeSlots - 1)
      },
      get connected() {
        return session.connected
      },
      onDisconnect: (cb) => {
        session.disconnectCallbacks.push(cb)
      },
      onConnect: (cb) => {
        session.connectCallbacks.push(cb)
      },
      _fireDisconnect: fireDisconnect
    }

    debug(
      `[${this.gatewayId}] subscribeGATT session=${sessionId} mac=${descriptor.mac}`
    )
    return handle
  }

  handleDisconnect() {
    debug(
      `[${this.gatewayId}] WS disconnected, cleaning up ${this.sessions.size} sessions`
    )
    for (const session of this.sessions.values()) {
      // Skip callbacks if already fired by releaseGATTClaimsForProvider
      const wasConnected = session.connected
      session.connected = false
      if (!wasConnected) continue
      for (const cb of session.disconnectCallbacks) {
        try {
          cb()
        } catch {
          /* ignore */
        }
      }
    }
    this.sessions.clear()
    this.activeSlots = 0
  }
}

// ---------------------------------------------------------------------------
// RemoteGatewayProvider — owns all ESP32 gateway connections
// ---------------------------------------------------------------------------

interface GatewayInfo {
  gatewayId: string
  providerId: string
  online: boolean
  ipAddress: string | null
  mac: string | null
  hostname: string | null
  firmware: string | null
  connectedAt: number | null
  disconnectedAt?: number
  uptime?: number
  freeHeap?: number
  gattSlots: { total: number; available: number }
  deviceCount: number
}

type RegisterFn = (id: string, provider: BLEProvider) => void
type UnregisterFn = (id: string) => void
type ReleaseGATTClaimsFn = (providerId: string) => void

interface RemoteGatewayApp extends IRouter {
  server?: import('http').Server
  config?: { settings?: { security?: unknown } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  securityStrategy?: any
}

export class RemoteGatewayProvider {
  private sessions = new Map<string, RemoteGATTSession>()
  private snapshots = new Map<string, GatewaySnapshot>()

  // Per-gateway: MAC → Set of advertisement callbacks
  private advCallbacks = new Map<string, Set<(adv: BLEAdvertisement) => void>>()
  // Per-gateway: Set<mac> of seen devices
  private seenMacs = new Map<string, Set<string>>()
  // Per-gateway: timestamp of last HTTP POST (ms)
  private lastPostTime = new Map<string, number>()
  // Per-gateway: metadata from HTTP POST body (for HTTP-only gateways like C5)
  private httpGatewayMeta = new Map<
    string,
    {
      ipAddress: string | null
      mac: string | null
      hostname: string | null
      firmware: string | null
      uptime: number | null
      freeHeap: number | null
      firstSeen: number
    }
  >()

  constructor(
    private readonly app: RemoteGatewayApp,
    private readonly registerProvider: RegisterFn,
    private readonly unregisterProvider: UnregisterFn,
    private readonly releaseGATTClaims: ReleaseGATTClaimsFn
  ) {}

  attach(router: IRouter) {
    const GW_PATH = `/signalk/v2/api/ble`

    router.get(`${GW_PATH}/gateways`, (_req: Request, res: Response) => {
      res.json(this.getGatewayInfo())
    })

    router.post(
      `${GW_PATH}/gateway/advertisements`,
      (req: Request, res: Response) => {
        this._handleAdvertisementPost(req, res)
      }
    )

    this._attachWebSocket()
  }

  private _handleAdvertisementPost(req: Request, res: Response) {
    if (this.app.securityStrategy?.canAuthorizeWS()) {
      const authHeader = req.headers['authorization'] as string | undefined
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : undefined
      try {
        this.app.securityStrategy.authorizeWS({ token })
      } catch {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
    }

    const body = req.body as BLEGatewayAdvertisementBatch
    if (!body?.gateway_id || !Array.isArray(body.devices)) {
      res.status(400).json({ error: 'Missing gateway_id or devices array' })
      return
    }

    const gatewayId = body.gateway_id

    // Store metadata from HTTP POST for gateways without a WebSocket
    // (e.g. ESP32-C5 with limited RAM). The IP comes from the request
    // itself; firmware, mac, hostname, and uptime are optional body fields.
    if (!this.sessions.has(gatewayId)) {
      const existing = this.httpGatewayMeta.get(gatewayId)
      this.httpGatewayMeta.set(gatewayId, {
        ipAddress: req.ip ?? null,
        mac: body.mac ?? null,
        hostname: body.hostname ?? gatewayId,
        firmware: body.firmware ?? null,
        uptime: body.uptime ?? null,
        freeHeap: body.free_heap ?? null,
        firstSeen: existing?.firstSeen ?? Date.now()
      })
    }

    if (!this.sessions.has(gatewayId) && !this.seenMacs.has(gatewayId)) {
      this._registerGatewayProvider(gatewayId)
    }

    const macs = this.seenMacs.get(gatewayId) ?? new Set<string>()
    const callbacks = this.advCallbacks.get(gatewayId) ?? new Set()
    const providerId = `ble:gateway:${gatewayId}`

    for (const dev of body.devices) {
      if (!dev.mac || typeof dev.mac !== 'string') continue
      if (typeof dev.rssi !== 'number') continue
      const mac = dev.mac.toUpperCase()
      macs.add(mac)

      let manufacturerData: Record<number, string> | undefined
      let serviceData: Record<string, string> | undefined
      let serviceUuids: string[] | undefined
      let txPower: number | undefined
      let connectable: boolean | undefined

      if (dev.adv_data) {
        const parsed = parseAdvData(dev.adv_data)
        manufacturerData = parsed.manufacturerData
        serviceData = parsed.serviceData
        serviceUuids = parsed.serviceUuids
        txPower = parsed.txPower
        connectable = parsed.connectable
      }

      if (dev.manufacturer_data) {
        if (!manufacturerData) manufacturerData = {}
        for (const [id, hex] of Object.entries(dev.manufacturer_data)) {
          manufacturerData[parseInt(id)] = hex
        }
      }
      if (dev.service_data) {
        if (!serviceData) serviceData = {}
        for (const [uuid, hex] of Object.entries(dev.service_data)) {
          serviceData[uuid] = hex
        }
      }
      if (dev.service_uuids) {
        serviceUuids = dev.service_uuids
      }
      if (dev.connectable !== undefined) {
        connectable = dev.connectable
      }
      if (dev.tx_power !== undefined) {
        txPower = dev.tx_power
      }

      const adv: BLEAdvertisement = {
        mac,
        name: dev.name,
        rssi: dev.rssi,
        manufacturerData,
        serviceData,
        serviceUuids,
        txPower,
        connectable,
        providerId,
        timestamp: Date.now()
      }

      for (const cb of callbacks) {
        try {
          cb(adv)
        } catch (e: unknown) {
          debug(`adv callback error: ${(e as Error).message}`)
        }
      }
    }

    this.seenMacs.set(gatewayId, macs)
    this.lastPostTime.set(gatewayId, Date.now())
    res.json({ ok: true })
  }

  private _registerGatewayProvider(gatewayId: string) {
    debug(`Registering provider for gateway: ble:gateway:${gatewayId}`)

    if (!this.advCallbacks.has(gatewayId)) {
      this.advCallbacks.set(gatewayId, new Set())
    }
    if (!this.seenMacs.has(gatewayId)) {
      this.seenMacs.set(gatewayId, new Set())
    }

    const provider: BLEProvider = {
      name: `BLE Gateway: ${gatewayId}`,
      methods: {
        startDiscovery: async () => {},
        stopDiscovery: async () => {},
        getDevices: async () => Array.from(this.seenMacs.get(gatewayId) ?? []),
        onAdvertisement: (cb) => {
          const callbacks = this.advCallbacks.get(gatewayId)!
          callbacks.add(cb)
          return () => callbacks.delete(cb)
        },
        supportsGATT: () => {
          const session = this.sessions.get(gatewayId)
          return session ? session.maxSlots > 0 : false
        },
        totalGATTSlots: () => {
          const session = this.sessions.get(gatewayId)
          return session ? session.maxSlots : 0
        },
        availableGATTSlots: () => {
          const session = this.sessions.get(gatewayId)
          return session ? session.availableGATTSlots() : 0
        },
        subscribeGATT: async (descriptor, callback) => {
          const session = this.sessions.get(gatewayId)
          if (!session) {
            throw new Error(
              `Gateway ${gatewayId} has no active WebSocket connection`
            )
          }
          return session.subscribeGATT(descriptor, callback)
        }
      }
    }

    this.registerProvider(`ble:gateway:${gatewayId}`, provider)
  }

  private _unregisterGatewayProvider(gatewayId: string) {
    const providerId = `ble:gateway:${gatewayId}`
    this.unregisterProvider(providerId)
    // Keep advCallbacks and seenMacs so HTTP POST can still re-register
  }

  private _attachWebSocket() {
    const wsPath = `/signalk/v2/api/ble/gateway/ws`
    const wss = new WebSocket.Server({ noServer: true })

    wss.on(
      'connection',
      (ws: WebSocket, request: import('http').IncomingMessage) => {
        debug('Gateway WebSocket connected')
        const gatewayIp: string | null = request.socket?.remoteAddress ?? null

        // Extract token from URL query parameter (?token=<jwt>)
        // The firmware passes the token obtained via the standard SK HTTP
        // access-request flow as a URL query parameter, not in the hello body.
        const reqUrl = new URL(
          request.url ?? '/',
          `http://${request.headers.host ?? 'localhost'}`
        )
        const urlToken = reqUrl.searchParams.get('token') ?? undefined

        // Validate token at connection time when security is enabled
        if (this.app.securityStrategy?.canAuthorizeWS()) {
          let authOk = false
          if (urlToken) {
            try {
              this.app.securityStrategy.authorizeWS({ token: urlToken })
              authOk = true
            } catch {
              debug('Gateway WS: invalid token in URL — closing')
            }
          }
          if (!authOk) {
            // Close with 4401 so the firmware knows to re-run the auth flow
            ws.close(4401, 'Unauthorized')
            return
          }
        }

        let session: RemoteGATTSession | null = null
        let pongReceived = true
        let pingTimer: ReturnType<typeof setInterval> | null = null

        ws.on('pong', () => {
          pongReceived = true
        })

        ws.on('message', (raw: Buffer) => {
          let msg: Record<string, unknown>
          try {
            msg = JSON.parse(raw.toString())
          } catch {
            debug('Gateway WS: invalid JSON')
            return
          }

          if (msg.type === 'hello' && !session) {
            const gatewayId = msg.gateway_id as string
            if (!gatewayId) {
              debug('Gateway WS: hello missing gateway_id')
              return
            }

            // Close any stale session for same gateway or same IP
            const existing = this.sessions.get(gatewayId)
            if (existing) {
              existing.handleDisconnect()
              this.sessions.delete(gatewayId)
              try {
                existing.ws.terminate()
              } catch {
                /* ignore */
              }
            }
            // Same IP → different gateway_id (reflash with new name)
            for (const [oldId, oldSession] of this.sessions) {
              if (oldSession.ipAddress === gatewayIp && oldId !== gatewayId) {
                debug(
                  `Closing stale gateway ${oldId} (same IP as ${gatewayId})`
                )
                oldSession.handleDisconnect()
                this.sessions.delete(oldId)
                this._unregisterGatewayProvider(oldId)
                try {
                  oldSession.ws.terminate()
                } catch {
                  /* ignore */
                }
              }
            }

            session = new RemoteGATTSession(gatewayId, ws)
            if (gatewayIp) session.ipAddress = gatewayIp
            session.handleHello(msg)
            this.sessions.set(gatewayId, session)
            this.snapshots.delete(gatewayId)

            // Register provider if not yet known (WS-first, before any HTTP POST)
            if (!this.advCallbacks.has(gatewayId)) {
              this._registerGatewayProvider(gatewayId)
            }

            // Send acknowledgement — firmware will close stale GATT sessions on WS reconnect
            ws.send(
              JSON.stringify({ type: 'hello_ack', server_time: Date.now() })
            )
            debug(`Gateway ${gatewayId} registered via WebSocket`)

            // Keepalive
            pingTimer = setInterval(() => {
              if (ws.readyState !== WebSocket.OPEN) return
              if (!pongReceived) {
                debug(`No pong from ${gatewayId} — terminating`)
                ws.terminate()
                return
              }
              pongReceived = false
              ws.ping()
            }, PING_INTERVAL_MS)
          } else if (session) {
            session.handleMessage(msg)
          }
        })

        ws.on('close', () => {
          if (pingTimer) clearInterval(pingTimer)
          if (!session) return

          const { gatewayId } = session
          debug(`Gateway ${gatewayId} WebSocket closed`)

          this.snapshots.set(gatewayId, {
            gatewayId,
            ipAddress: session.ipAddress,
            mac: session.mac,
            hostname: session.hostname,
            firmware: session.firmware,
            maxSlots: session.maxSlots,
            connectedAt: session.connectedAt,
            disconnectedAt: Date.now(),
            lastUptime: session.uptime,
            lastFreeHeap: session.freeHeap
          })
          setTimeout(
            () => this.snapshots.delete(gatewayId),
            OFFLINE_SNAPSHOT_MS
          )

          // Release GATT claims held through this gateway before firing disconnect callbacks,
          // so plugins can immediately re-claim via another provider.
          this.releaseGATTClaims(`ble:gateway:${gatewayId}`)
          session.handleDisconnect()
          this.sessions.delete(gatewayId)
          // Don't unregister provider — keeps it in the providers list with 0 slots
          // so the UI shows it as offline rather than disappearing entirely
        })

        ws.on('error', (err) => {
          debug(`Gateway WS error: ${err.message}`)
        })
      }
    )

    const tryAttach = () => {
      const server = this.app.server
      if (!server) {
        setTimeout(tryAttach, 1000)
        return
      }
      server.on(
        'upgrade',
        (
          request: import('http').IncomingMessage,
          socket: import('net').Socket,
          head: Buffer
        ) => {
          const url = new URL(
            request.url ?? '/',
            `http://${request.headers.host}`
          )
          if (url.pathname === wsPath) {
            wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
              wss.emit('connection', ws, request)
            })
          }
        }
      )
      debug(`Gateway WebSocket endpoint ready at ${wsPath}`)
    }
    tryAttach()
  }

  getGatewayInfo(): GatewayInfo[] {
    const result: GatewayInfo[] = []

    for (const [gatewayId, session] of this.sessions) {
      result.push({
        gatewayId,
        providerId: `ble:gateway:${gatewayId}`,
        online: true,
        ipAddress: session.ipAddress,
        mac: session.mac,
        hostname: session.hostname,
        firmware: session.firmware,
        connectedAt: session.connectedAt,
        uptime: session.uptime,
        freeHeap: session.freeHeap,
        gattSlots: {
          total: session.maxSlots,
          available: session.availableGATTSlots()
        },
        deviceCount: this.seenMacs.get(gatewayId)?.size ?? 0
      })
    }

    for (const [gatewayId, snap] of this.snapshots) {
      if (this.sessions.has(gatewayId)) continue
      result.push({
        gatewayId,
        providerId: `ble:gateway:${gatewayId}`,
        online: false,
        ipAddress: snap.ipAddress,
        mac: snap.mac,
        hostname: snap.hostname,
        firmware: snap.firmware,
        connectedAt: snap.connectedAt,
        disconnectedAt: snap.disconnectedAt,
        uptime: snap.lastUptime,
        freeHeap: snap.lastFreeHeap,
        gattSlots: { total: snap.maxSlots, available: 0 },
        deviceCount: 0
      })
    }

    // Gateways posting via HTTP but not connected via WebSocket
    // (e.g. ESP32-C5 with no WS, or reconnecting after snapshot TTL).
    // Only shown if a POST arrived within the snapshot TTL window.
    for (const [gatewayId] of this.seenMacs) {
      if (this.sessions.has(gatewayId) || this.snapshots.has(gatewayId))
        continue
      const lastPost = this.lastPostTime.get(gatewayId) ?? 0
      if (Date.now() - lastPost > OFFLINE_SNAPSHOT_MS) {
        this.seenMacs.delete(gatewayId)
        this.lastPostTime.delete(gatewayId)
        this.httpGatewayMeta.delete(gatewayId)
        continue
      }
      const meta = this.httpGatewayMeta.get(gatewayId)
      result.push({
        gatewayId,
        providerId: `ble:gateway:${gatewayId}`,
        online: true,
        ipAddress: meta?.ipAddress ?? null,
        mac: meta?.mac ?? null,
        hostname: meta?.hostname ?? gatewayId,
        firmware: meta?.firmware ?? null,
        connectedAt: meta?.firstSeen ?? null,
        uptime: meta?.uptime ?? undefined,
        freeHeap: meta?.freeHeap ?? undefined,
        gattSlots: { total: 0, available: 0 },
        deviceCount: this.seenMacs.get(gatewayId)?.size ?? 0
      })
    }

    return result
  }
}
