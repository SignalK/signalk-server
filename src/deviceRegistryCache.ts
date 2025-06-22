/*
 * Device Registry Cache Manager
 * Maintains an in-memory cache of device registry data with event-driven updates
 */

import { EventEmitter } from 'events'
import { createDebug } from './debug'

const debug = createDebug('signalk-server:device-registry-cache')

export interface Device {
  clientId: string
  permissions: string
  description?: string
  config?: Record<string, unknown>
}

interface CacheEventEmitter extends EventEmitter {
  on(event: 'updated', listener: () => void): this
  emit(event: 'updated'): boolean
}

export class DeviceRegistryCache {
  private devices: Map<string, Device> = new Map()
  private events: CacheEventEmitter = new EventEmitter()
  
  constructor() {
    debug('Device registry cache initialized')
  }

  /**
   * Initialize cache with device data
   */
  initialize(devices: Device[]): void {
    this.devices.clear()
    devices.forEach(device => {
      this.devices.set(device.clientId, device)
    })
    debug(`Cache initialized with ${this.devices.size} devices`)
    this.events.emit('updated')
  }

  /**
   * Update cache with new device data
   */
  update(devices: Device[]): void {
    const previousSize = this.devices.size
    this.initialize(devices)
    if (previousSize !== this.devices.size) {
      debug(`Cache updated: ${previousSize} -> ${this.devices.size} devices`)
    }
  }

  /**
   * Get device by client ID
   */
  getDevice(clientId: string): Device | undefined {
    return this.devices.get(clientId)
  }

  /**
   * Get all devices
   */
  getAllDevices(): Device[] {
    return Array.from(this.devices.values())
  }

  /**
   * Add or update a single device
   */
  setDevice(device: Device): void {
    const isNew = !this.devices.has(device.clientId)
    this.devices.set(device.clientId, device)
    debug(`Device ${isNew ? 'added' : 'updated'}: ${device.clientId}`)
    this.events.emit('updated')
  }

  /**
   * Remove a device
   */
  removeDevice(clientId: string): boolean {
    const removed = this.devices.delete(clientId)
    if (removed) {
      debug(`Device removed: ${clientId}`)
      this.events.emit('updated')
    }
    return removed
  }

  /**
   * Subscribe to cache updates
   */
  onUpdate(listener: () => void): () => void {
    this.events.on('updated', listener)
    return () => {
      this.events.removeListener('updated', listener)
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { deviceCount: number; cacheSize: number } {
    return {
      deviceCount: this.devices.size,
      cacheSize: JSON.stringify(Array.from(this.devices.values())).length
    }
  }
}

// Singleton instance
export const deviceRegistryCache = new DeviceRegistryCache()