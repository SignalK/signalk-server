import { EventEmitter } from 'events'
import { createDebug } from './debug'

const debug = createDebug('signalk-server:deviceTracker')

const HTTP_ACTIVITY_TIMEOUT_MS = 5 * 60 * 1000

export interface DeviceRuntimeState {
  clientId: string
  isConnected: boolean
  connectionCount: number
  lastSeen: string
  lastIp?: string
  pluginData?: Record<string, Record<string, unknown>>
}

export interface DeviceStateEvent {
  clientId: string
  connected: boolean
  ip?: string
  connectionType?: 'websocket' | 'http'
}

export class DeviceTracker extends EventEmitter {
  private devices = new Map<string, DeviceRuntimeState>()
  private httpTimer: NodeJS.Timeout | undefined

  constructor(private emitAdminEvent: (event: unknown) => void) {
    super()
    this.httpTimer = setInterval(
      () => this.pruneHttpDevices(),
      HTTP_ACTIVITY_TIMEOUT_MS
    )
  }

  onConnect(clientId: string, ip?: string): void {
    const state = this.getOrCreate(clientId)
    state.connectionCount++
    state.isConnected = true
    state.lastSeen = new Date().toISOString()
    if (ip) {
      state.lastIp = ip
    }
    debug(
      'device connected: %s (connections: %d)',
      clientId,
      state.connectionCount
    )
    this.emitChange({
      clientId,
      connected: true,
      ip,
      connectionType: 'websocket'
    })
  }

  onDisconnect(clientId: string): void {
    const state = this.devices.get(clientId)
    if (!state) return
    state.connectionCount = Math.max(0, state.connectionCount - 1)
    state.isConnected = state.connectionCount > 0
    state.lastSeen = new Date().toISOString()
    debug(
      'device disconnected: %s (connections: %d)',
      clientId,
      state.connectionCount
    )
    if (!state.isConnected) {
      this.emitChange({
        clientId,
        connected: false,
        connectionType: 'websocket'
      })
    }
  }

  onActivity(clientId: string, ip?: string): void {
    const state = this.getOrCreate(clientId)
    state.lastSeen = new Date().toISOString()
    if (ip) {
      state.lastIp = ip
    }
    if (!state.isConnected) {
      state.isConnected = true
      this.emitChange({ clientId, connected: true, ip, connectionType: 'http' })
    }
  }

  onDeviceRemoved(clientId: string): void {
    this.devices.delete(clientId)
  }

  getState(clientId: string): DeviceRuntimeState | undefined {
    return this.devices.get(clientId)
  }

  getAllStates(): Map<string, DeviceRuntimeState> {
    return this.devices
  }

  setPluginData(
    pluginId: string,
    clientId: string,
    metadata: Record<string, unknown>
  ): void {
    const state = this.getOrCreate(clientId)
    if (!state.pluginData) {
      state.pluginData = {}
    }
    state.pluginData[pluginId] = metadata
    this.emitAdminEvent({
      type: 'DEVICE_STATUS_CHANGE',
      data: { clientId }
    })
  }

  getPluginData(
    pluginId: string,
    clientId: string
  ): Record<string, unknown> | undefined {
    return this.devices.get(clientId)?.pluginData?.[pluginId]
  }

  destroy(): void {
    if (this.httpTimer) {
      clearInterval(this.httpTimer)
      this.httpTimer = undefined
    }
  }

  private getOrCreate(clientId: string): DeviceRuntimeState {
    let state = this.devices.get(clientId)
    if (!state) {
      state = {
        clientId,
        isConnected: false,
        connectionCount: 0,
        lastSeen: new Date().toISOString()
      }
      this.devices.set(clientId, state)
    }
    return state
  }

  private emitChange(event: DeviceStateEvent): void {
    this.emit('deviceStateChange', event)
    this.emitAdminEvent({
      type: 'DEVICE_STATUS_CHANGE',
      data: event
    })
  }

  private pruneHttpDevices(): void {
    const cutoff = Date.now() - HTTP_ACTIVITY_TIMEOUT_MS
    for (const [, state] of this.devices) {
      if (
        state.isConnected &&
        state.connectionCount === 0 &&
        new Date(state.lastSeen).getTime() < cutoff
      ) {
        state.isConnected = false
        debug('device http timeout: %s', state.clientId)
        this.emitChange({
          clientId: state.clientId,
          connected: false,
          connectionType: 'http'
        })
      }
    }
  }
}
