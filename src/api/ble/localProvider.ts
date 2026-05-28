/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Local BLE Provider — wraps BlueZ via @naugehyde/node-ble as a standard
 * BLE provider.  Registered automatically by BLEApi when the
 * `localBluetoothManaged` setting is enabled (default: true on Linux).
 */

import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:ble:local')

import {
  BLEAdvertisement,
  BLEProviderMethods,
  BLEGattConnection,
  BLEGattService,
  GATTSubscriptionDescriptor,
  GATTSubscriptionHandle
} from '@signalk/server-api'

// ---------------------------------------------------------------------------
// Connection serializer (port of bt-sensors AutoQueue concept)
// ---------------------------------------------------------------------------

class ConnectionQueue {
  private pending = false
  private queue: Array<{
    action: () => Promise<any>
    resolve: (v: any) => void
    reject: (e: any) => void
  }> = []

  enqueue<T>(action: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ action, resolve, reject })
      this.dequeue()
    })
  }

  private async dequeue() {
    if (this.pending || this.queue.length === 0) return
    this.pending = true
    const item = this.queue.shift()!
    try {
      const result = await item.action()
      item.resolve(result)
    } catch (e) {
      item.reject(e)
    } finally {
      this.pending = false
      this.dequeue()
    }
  }
}

// ---------------------------------------------------------------------------
// Local GATT Session
// ---------------------------------------------------------------------------

interface LocalGATTSession {
  descriptor: GATTSubscriptionDescriptor
  callback: (charUuid: string, data: Buffer) => void
  device: any
  gattServer: any
  connected: boolean
  closed: boolean
  pollTimers: ReturnType<typeof setInterval>[]
  periodicWriteTimers: ReturnType<typeof setInterval>[]
  connectCallbacks: Array<() => void>
  disconnectCallbacks: Array<() => void>
  reconnectTimer?: ReturnType<typeof setTimeout>
  removeDisconnectListener?: () => void
}

// ---------------------------------------------------------------------------
// LocalBLEProvider
// ---------------------------------------------------------------------------

export class LocalBLEProvider {
  private adapter: any
  private bluetooth: any
  private destroy: (() => void) | null = null
  private advCallbacks: Set<(adv: BLEAdvertisement) => void> = new Set()
  private sessions: Map<string, LocalGATTSession> = new Map() // MAC → session
  private maxGATTSlots: number
  private connectQueue = new ConnectionQueue()
  private deviceListeners: Map<string, () => void> = new Map() // MAC → cleanup
  private lastRssi: Map<string, number> = new Map() // MAC → last known RSSI
  private rawConnections = 0
  private scanning = false
  private adapterReady = false

  readonly providerId: string

  constructor(
    private adapterName: string = 'hci0',
    maxSlots: number = 3,
    providerId?: string
  ) {
    this.providerId = providerId ?? `_localBLE:${adapterName}`
    this.maxGATTSlots = maxSlots
  }

  async init(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createBluetooth } = require('@naugehyde/node-ble')
      const bt = createBluetooth()
      this.bluetooth = bt.bluetooth
      this.destroy = bt.destroy
      this.adapter = await this.bluetooth.getAdapter(this.adapterName)

      const powered = await this.adapter.isPowered()
      if (!powered) {
        debug(
          `Adapter ${this.adapterName} not powered — local provider unavailable`
        )
        throw new Error(`Adapter ${this.adapterName} not powered`)
      }

      this.adapterReady = true
      debug(`Local BLE provider initialized on ${this.adapterName}`)
    } catch (e: any) {
      debug(`Failed to initialize local BLE: ${e.message}`)
      throw e
    }
  }

  shutdown() {
    this.scanning = false
    for (const [mac, session] of this.sessions) {
      this.closeSession(session)
      this.sessions.delete(mac)
    }
    for (const cleanup of this.deviceListeners.values()) {
      cleanup()
    }
    this.deviceListeners.clear()
    if (this.destroy) {
      try {
        this.destroy()
      } catch (_e) {
        // ignore
      }
    }
  }

  // -------------------------------------------------------------------------
  // BLEProviderMethods implementation
  // -------------------------------------------------------------------------

  getMethods(): BLEProviderMethods {
    return {
      pluginId: this.providerId,
      startDiscovery: () => this.startDiscovery(),
      stopDiscovery: () => this.stopDiscovery(),
      getDevices: () => this.getDevices(),
      onAdvertisement: (cb) => this.onAdvertisement(cb),
      supportsGATT: () => this.supportsGATT(),
      totalGATTSlots: () => this.maxGATTSlots,
      availableGATTSlots: () => this.availableGATTSlots(),
      subscribeGATT: (desc, cb) => this.subscribeGATT(desc, cb),
      connectGATT: (mac) => this.connectGATT(mac)
    }
  }

  async startDiscovery(): Promise<void> {
    if (!this.adapterReady || this.scanning) return
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Variant } = require('@jellybrick/dbus-next')
    await this.adapter.helper.callMethod('SetDiscoveryFilter', {
      Transport: new Variant('s', 'le'),
      DuplicateData: new Variant('b', true)
    })
    await this.adapter.helper.callMethod('StartDiscovery')
    this.scanning = true
    debug('Discovery started')

    // Set up adapter-level InterfacesAdded listener for new devices
    this.startDeviceWatcher()
  }

  async stopDiscovery(): Promise<void> {
    if (!this.scanning) return
    try {
      await this.adapter.helper.callMethod('StopDiscovery')
    } catch (e: any) {
      debug(`Error stopping discovery: ${e.message}`)
    }
    this.scanning = false
    for (const cleanup of this.deviceListeners.values()) {
      cleanup()
    }
    this.deviceListeners.clear()
    debug('Discovery stopped')
  }

  async getDevices(): Promise<string[]> {
    if (!this.adapterReady) return []
    try {
      return await this.adapter.devices()
    } catch (_e) {
      return []
    }
  }

  onAdvertisement(callback: (adv: BLEAdvertisement) => void): () => void {
    this.advCallbacks.add(callback)
    return () => {
      this.advCallbacks.delete(callback)
    }
  }

  supportsGATT(): boolean {
    return this.adapterReady
  }

  availableGATTSlots(): number {
    return Math.max(
      0,
      this.maxGATTSlots - this.sessions.size - this.rawConnections
    )
  }

  // -------------------------------------------------------------------------
  // Advertisement watching
  // -------------------------------------------------------------------------

  private async startDeviceWatcher() {
    // Poll adapter.devices() periodically and attach property listeners
    // to new devices. This is the same pattern bt-sensors uses.
    const watchDevices = async () => {
      if (!this.scanning) return
      try {
        const macs = await this.adapter.devices()
        for (const mac of macs) {
          if (!this.deviceListeners.has(mac)) {
            this.attachDeviceListener(mac)
          }
        }
      } catch (_e) {
        // adapter gone, ignore
      }
    }

    // Initial scan + periodic check for new devices
    await watchDevices()
    const interval = setInterval(watchDevices, 5000)

    const origCleanup = this.deviceListeners.get('__watcher__')
    if (origCleanup) origCleanup()
    this.deviceListeners.set('__watcher__', () => clearInterval(interval))
  }

  private async attachDeviceListener(mac: string) {
    // Reserve the slot before the await chain so concurrent watchDevices()
    // iterations don't both kick off an attach for the same MAC.
    this.deviceListeners.set(mac, () => {})
    try {
      const device = await this.adapter.waitDevice(mac, 1)
      await device.helper._prepare()
      this.emitDeviceAdvertisement(device, mac)

      const handler = (props: any) => {
        this.emitDeviceAdvertisement(device, mac, props)
      }
      device.helper.on('PropertiesChanged', handler)

      this.deviceListeners.set(mac, () => {
        device.helper.removeListener('PropertiesChanged', handler)
      })
    } catch (_e) {
      this.deviceListeners.delete(mac)
    }
  }

  private async emitDeviceAdvertisement(
    device: any,
    mac: string,
    changedProps?: any
  ) {
    if (this.advCallbacks.size === 0) return

    try {
      let name: string | undefined
      let rssi = -127
      let manufacturerData: Record<number, string> | undefined
      let serviceData: Record<string, string> | undefined
      let serviceUuids: string[] | undefined

      if (changedProps) {
        if (changedProps.Name) {
          name = this.unwrapVariant(changedProps.Name)
        }
        if (changedProps.RSSI !== undefined) {
          rssi = this.unwrapVariant(changedProps.RSSI)
          this.lastRssi.set(mac, rssi)
        } else {
          rssi = this.lastRssi.get(mac) ?? -127
        }
        if (changedProps.ManufacturerData) {
          manufacturerData = this.convertManufacturerData(
            this.unwrapVariant(changedProps.ManufacturerData)
          )
        }
        if (changedProps.ServiceData) {
          serviceData = this.convertServiceData(
            this.unwrapVariant(changedProps.ServiceData)
          )
        }
        if (changedProps.UUIDs) {
          serviceUuids = this.unwrapVariant(changedProps.UUIDs)
        }
      } else {
        // Initial full read
        try {
          const allProps = await device._propsProxy.GetAll('org.bluez.Device1')
          name = this.unwrapVariant(allProps?.Name)
          rssi = this.unwrapVariant(allProps?.RSSI) ?? -127
          if (rssi !== -127) this.lastRssi.set(mac, rssi)
          if (allProps?.ManufacturerData) {
            manufacturerData = this.convertManufacturerData(
              this.unwrapVariant(allProps.ManufacturerData)
            )
          }
          if (allProps?.ServiceData) {
            serviceData = this.convertServiceData(
              this.unwrapVariant(allProps.ServiceData)
            )
          }
          if (allProps?.UUIDs) {
            serviceUuids = this.unwrapVariant(allProps.UUIDs)
          }
        } catch (_e) {
          return // Can't read props, skip
        }
      }

      if (rssi === -127 && !manufacturerData && !serviceData) return

      const adv: BLEAdvertisement = {
        mac: mac.toUpperCase(),
        name,
        rssi,
        manufacturerData,
        serviceData,
        serviceUuids,
        providerId: this.providerId,
        timestamp: Date.now(),
        connectable: true // local adapter devices are generally connectable
      }

      for (const cb of this.advCallbacks) {
        try {
          cb(adv)
        } catch (e: any) {
          debug(`Advertisement callback error: ${e.message}`)
        }
      }
    } catch (_e) {}
  }

  // -------------------------------------------------------------------------
  // GATT subscribeGATT — declarative lifecycle
  // -------------------------------------------------------------------------

  async subscribeGATT(
    descriptor: GATTSubscriptionDescriptor,
    callback: (charUuid: string, data: Buffer) => void
  ): Promise<GATTSubscriptionHandle> {
    const mac = descriptor.mac.toUpperCase()

    if (this.sessions.has(mac)) {
      throw new Error(`Local provider already has GATT session for ${mac}`)
    }

    const session: LocalGATTSession = {
      descriptor,
      callback,
      device: null,
      gattServer: null,
      connected: false,
      closed: false,
      pollTimers: [],
      periodicWriteTimers: [],
      connectCallbacks: [],
      disconnectCallbacks: []
    }

    this.sessions.set(mac, session)

    try {
      await this.executeGATTLifecycle(session)
    } catch (e: any) {
      this.closeSession(session)
      this.sessions.delete(mac)
      throw e
    }

    const handle: GATTSubscriptionHandle = {
      read: async (charUuid: string) => {
        if (!session.gattServer || !session.connected) {
          throw new Error('GATT not connected')
        }
        const service = await session.gattServer.getPrimaryService(
          descriptor.service
        )
        const char = await service.getCharacteristic(charUuid)
        return await char.readValue()
      },
      write: async (charUuid: string, data: Buffer, withResponse?: boolean) => {
        if (!session.gattServer || !session.connected) {
          throw new Error('GATT not connected')
        }
        const service = await session.gattServer.getPrimaryService(
          descriptor.service
        )
        const char = await service.getCharacteristic(charUuid)
        if (withResponse === false) {
          await char.writeValueWithoutResponse(data)
        } else {
          await char.writeValue(data)
        }
      },
      close: async () => {
        session.closed = true
        this.closeSession(session)
        this.sessions.delete(mac)
      },
      get connected() {
        return session.connected
      },
      onDisconnect: (cb: () => void) => {
        session.disconnectCallbacks.push(cb)
      },
      onConnect: (cb: () => void) => {
        session.connectCallbacks.push(cb)
      }
    }

    return handle
  }

  private async executeGATTLifecycle(session: LocalGATTSession) {
    const mac = session.descriptor.mac.toUpperCase()
    const descriptor = session.descriptor

    await this.connectQueue.enqueue(async () => {
      if (session.closed) return

      debug(`GATT connecting to ${mac}`)

      // 1. Find device
      const device = await this.adapter.waitDevice(mac, 30)
      session.device = device

      // 2. Connect
      await device.helper.callMethod('Connect')
      session.connected = true
      debug(`GATT connected to ${mac}`)

      // 3. Restart scanning (BlueZ suspends during GATT connections)
      try {
        await this.adapter.helper.callMethod('StopDiscovery')
        await this.adapter.helper.callMethod('StartDiscovery')
      } catch (_e) {
        // Ignorable
      }
    })

    if (session.closed) return

    // 4. Discover service
    const gattServer = await session.device.gatt()
    session.gattServer = gattServer
    const service = await gattServer.getPrimaryService(descriptor.service)

    // 5. Execute init writes
    if (descriptor.init) {
      for (const initWrite of descriptor.init) {
        const char = await service.getCharacteristic(initWrite.uuid)
        if (initWrite.withResponse === false) {
          await char.writeValueWithoutResponse(
            Buffer.from(initWrite.data, 'hex')
          )
        } else {
          await char.writeValue(Buffer.from(initWrite.data, 'hex'))
        }
      }
    }

    // 6. Subscribe to notification characteristics
    if (descriptor.notify) {
      for (const charUuid of descriptor.notify) {
        const char = await service.getCharacteristic(charUuid)
        await char.startNotifications()
        char.on('valuechanged', (buffer: Buffer) => {
          session.callback(charUuid, buffer)
        })
      }
    }

    // 7. Set up poll intervals
    if (descriptor.poll) {
      for (const pollEntry of descriptor.poll) {
        const timer = setInterval(async () => {
          if (!session.connected || session.closed) return
          try {
            const char = await service.getCharacteristic(pollEntry.uuid)
            if (pollEntry.writeBeforeRead) {
              await char.writeValue(
                Buffer.from(pollEntry.writeBeforeRead, 'hex')
              )
            }
            const value = await char.readValue()
            session.callback(pollEntry.uuid, value)
          } catch (e: any) {
            debug(`Poll error for ${pollEntry.uuid}: ${e.message}`)
          }
        }, pollEntry.intervalMs)
        session.pollTimers.push(timer)
      }
    }

    // 8. Set up periodic writes
    if (descriptor.periodicWrite) {
      for (const pw of descriptor.periodicWrite) {
        const timer = setInterval(async () => {
          if (!session.connected || session.closed) return
          try {
            const char = await service.getCharacteristic(pw.uuid)
            if (pw.withResponse === false) {
              await char.writeValueWithoutResponse(Buffer.from(pw.data, 'hex'))
            } else {
              await char.writeValue(Buffer.from(pw.data, 'hex'))
            }
          } catch (e: any) {
            debug(`Periodic write error for ${pw.uuid}: ${e.message}`)
          }
        }, pw.intervalMs)
        session.periodicWriteTimers.push(timer)
      }
    }

    // Bind the disconnect handler to *this* device instance.  On reconnect
    // adapter.waitDevice() may return a different object, so we always
    // re-attach and clear the previous device's listener to prevent leaks.
    const onDisconnect = () => {
      if (session.closed) return
      session.connected = false
      debug(`GATT disconnected from ${mac}`)
      for (const cb of session.disconnectCallbacks) {
        try {
          cb()
        } catch (_e) {
          // ignore callback errors
        }
      }
      this.clearSessionTimers(session)
      const attemptReconnect = (attempt: number) => {
        const delay = Math.min(5000 * Math.pow(2, attempt - 1), 60000)
        session.reconnectTimer = setTimeout(async () => {
          if (session.closed) return
          debug(`GATT reconnecting to ${mac} (attempt ${attempt})`)
          try {
            // executeGATTLifecycle fires connectCallbacks itself on success
            await this.executeGATTLifecycle(session)
          } catch (e: any) {
            debug(`GATT reconnect failed for ${mac}: ${e.message}`)
            if (!session.closed) {
              const nextDelay = Math.min(5000 * Math.pow(2, attempt), 60000)
              debug(`GATT retry ${mac} in ${nextDelay / 1000}s`)
              attemptReconnect(attempt + 1)
            }
          }
        }, delay)
      }
      attemptReconnect(1)
    }
    if (session.removeDisconnectListener) {
      session.removeDisconnectListener()
    }
    session.device.on('disconnect', onDisconnect)
    session.removeDisconnectListener = () => {
      try {
        session.device?.removeListener?.('disconnect', onDisconnect)
      } catch (_e) {
        // ignore
      }
    }

    for (const cb of session.connectCallbacks) {
      try {
        cb()
      } catch (_e) {
        // ignore
      }
    }
  }

  private clearSessionTimers(session: LocalGATTSession) {
    for (const timer of session.pollTimers) {
      clearInterval(timer)
    }
    session.pollTimers = []
    for (const timer of session.periodicWriteTimers) {
      clearInterval(timer)
    }
    session.periodicWriteTimers = []
  }

  private closeSession(session: LocalGATTSession) {
    session.closed = true
    this.clearSessionTimers(session)
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer)
    }
    if (session.removeDisconnectListener) {
      session.removeDisconnectListener()
      session.removeDisconnectListener = undefined
    }
    if (session.device && session.connected) {
      try {
        // device.disconnect() may return a promise that rejects asynchronously
        Promise.resolve(session.device.disconnect()).catch((e: any) => {
          debug(`device.disconnect() failed: ${e?.message ?? e}`)
        })
      } catch (e: any) {
        debug(`device.disconnect() threw: ${e?.message ?? e}`)
      }
    }
    session.connected = false
  }

  // -------------------------------------------------------------------------
  // connectGATT — raw escape hatch
  // -------------------------------------------------------------------------

  async connectGATT(mac: string): Promise<BLEGattConnection> {
    mac = mac.toUpperCase()

    // Reserve slot before async connect to prevent concurrent oversubscription
    this.rawConnections++
    const releaseSlot = () => {
      this.rawConnections = Math.max(0, this.rawConnections - 1)
    }

    let device: any
    try {
      device = await this.connectQueue.enqueue(async () => {
        const dev = await this.adapter.waitDevice(mac, 30)
        await dev.helper.callMethod('Connect')
        try {
          await this.adapter.helper.callMethod('StopDiscovery')
          await this.adapter.helper.callMethod('StartDiscovery')
        } catch (_e) {
          // Ignorable
        }
        return dev
      })
    } catch (e) {
      releaseSlot()
      throw e
    }

    let gattServer: any
    try {
      gattServer = await device.gatt()
    } catch (e) {
      releaseSlot()
      try {
        await device.disconnect()
      } catch (_e) {
        // ignore
      }
      throw e
    }
    let connected = true
    const disconnectCallbacks: Array<() => void> = []

    try {
      device.on('disconnect', () => {
        if (connected) {
          connected = false
          releaseSlot()
        }
        for (const cb of disconnectCallbacks) {
          try {
            cb()
          } catch (_e) {
            // ignore
          }
        }
      })
    } catch (e) {
      connected = false
      releaseSlot()
      try {
        await device.disconnect()
      } catch (_e) {
        // ignore
      }
      throw e
    }

    const conn: BLEGattConnection = {
      async read(serviceUuid: string, charUuid: string): Promise<Buffer> {
        const service = await gattServer.getPrimaryService(serviceUuid)
        const char = await service.getCharacteristic(charUuid)
        return char.readValue()
      },

      async write(
        serviceUuid: string,
        charUuid: string,
        data: Buffer,
        withResponse?: boolean
      ): Promise<void> {
        const service = await gattServer.getPrimaryService(serviceUuid)
        const char = await service.getCharacteristic(charUuid)
        if (withResponse === false) {
          await char.writeValueWithoutResponse(data)
        } else {
          await char.writeValue(data)
        }
      },

      async startNotifications(
        serviceUuid: string,
        charUuid: string,
        callback: (data: Buffer) => void
      ): Promise<void> {
        const service = await gattServer.getPrimaryService(serviceUuid)
        const char = await service.getCharacteristic(charUuid)
        await char.startNotifications()
        char.on('valuechanged', callback)
      },

      async stopNotifications(
        serviceUuid: string,
        charUuid: string
      ): Promise<void> {
        const service = await gattServer.getPrimaryService(serviceUuid)
        const char = await service.getCharacteristic(charUuid)
        try {
          if (await char.isNotifying()) {
            await char.stopNotifications()
          }
        } catch (_e) {
          // ignore
        }
        char.removeAllListeners('valuechanged')
      },

      async discoverServices(): Promise<BLEGattService[]> {
        const serviceUuids = await gattServer.services()
        const result: BLEGattService[] = []
        for (const uuid of serviceUuids) {
          const service = await gattServer.getPrimaryService(uuid)
          const charUuids = await service.characteristics()
          const chars = []
          for (const charUuid of charUuids) {
            const char = await service.getCharacteristic(charUuid)
            const flags = await char.getFlags()
            chars.push({ uuid: charUuid, properties: flags })
          }
          result.push({ uuid, characteristics: chars })
        }
        return result
      },

      async disconnect(): Promise<void> {
        try {
          await device.disconnect()
        } catch (_e) {
          // ignore
        }
        if (connected) {
          connected = false
          releaseSlot()
        }
      },

      get connected() {
        return connected
      },

      onDisconnect(callback: () => void) {
        disconnectCallbacks.push(callback)
      }
    }

    return conn
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private unwrapVariant(v: any): any {
    if (v === undefined || v === null) return v
    if (v && typeof v === 'object' && 'value' in v) return v.value
    return v
  }

  private convertManufacturerData(
    md: Record<number, any> | undefined
  ): Record<number, string> | undefined {
    if (!md) return undefined
    const result: Record<number, string> = {}
    for (const [id, val] of Object.entries(md)) {
      const buf = this.unwrapVariant(val)
      if (Buffer.isBuffer(buf)) {
        result[Number(id)] = buf.toString('hex')
      } else if (typeof buf === 'string') {
        result[Number(id)] = buf
      }
    }
    return Object.keys(result).length > 0 ? result : undefined
  }

  private convertServiceData(
    sd: Record<string, any> | undefined
  ): Record<string, string> | undefined {
    if (!sd) return undefined
    const result: Record<string, string> = {}
    for (const [uuid, val] of Object.entries(sd)) {
      const buf = this.unwrapVariant(val)
      if (Buffer.isBuffer(buf)) {
        result[uuid] = buf.toString('hex')
      } else if (typeof buf === 'string') {
        result[uuid] = buf
      }
    }
    return Object.keys(result).length > 0 ? result : undefined
  }
}
