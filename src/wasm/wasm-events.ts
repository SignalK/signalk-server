/**
 * WASM Plugin Server Event Management
 *
 * PropertyValues events are excluded because they contain function references.
 */

import Debug from 'debug'

const debug = Debug('signalk:wasm:events')

export interface ServerEvent {
  type: string
  from?: string
  data: unknown
  timestamp: number
}

export type EventCallback = (event: ServerEvent) => void

export interface EventSubscription {
  pluginId: string
  eventTypes: string[]
  callback: EventCallback
}

/**
 * Server events (uppercase) - delivered via serverevent wrapper
 */
const WASM_ALLOWED_SERVER_EVENTS = new Set([
  'SERVERSTATISTICS',
  'VESSEL_INFO',
  'DEBUG_SETTINGS',
  'SERVERMESSAGE',
  'PROVIDERSTATUS',
  'SOURCEPRIORITIES'
])

/**
 * Generic events (lowercase) - NMEA data streams and parser events
 */
const WASM_ALLOWED_GENERIC_EVENTS = new Set([
  'nmea0183', // Raw NMEA 0183 sentences from hardware
  'nmea0183out', // Derived NMEA 0183 from plugins
  'nmea2000JsonOut', // NMEA 2000 JSON PGN data
  'nmea2000out', // Raw NMEA 2000 data
  'nmea2000OutAvailable', // Signal that N2K output is ready
  'canboatjs:error', // Parser error events
  'canboatjs:warning', // Parser warning events
  'canboatjs:unparsed:data' // Unparsed data from canboatjs
])

/**
 * Combined set of all allowed event types for WASM plugins
 */
const WASM_ALLOWED_EVENT_TYPES = new Set([
  ...WASM_ALLOWED_SERVER_EVENTS,
  ...WASM_ALLOWED_GENERIC_EVENTS
])

export const PLUGIN_EVENT_PREFIX = 'PLUGIN_'

export class WasmEventManager {
  private subscriptions: Map<string, EventSubscription[]> = new Map()
  private buffers: Map<string, ServerEvent[]> = new Map()
  private buffering: Set<string> = new Set()

  isAllowed(eventType: string): boolean {
    return (
      WASM_ALLOWED_EVENT_TYPES.has(eventType) ||
      eventType.startsWith(PLUGIN_EVENT_PREFIX)
    )
  }

  getAllowedEventTypes(): string[] {
    return Array.from(WASM_ALLOWED_EVENT_TYPES)
  }

  getAllowedServerEvents(): string[] {
    return Array.from(WASM_ALLOWED_SERVER_EVENTS)
  }

  getAllowedGenericEvents(): string[] {
    return Array.from(WASM_ALLOWED_GENERIC_EVENTS)
  }

  isServerEvent(eventType: string): boolean {
    return WASM_ALLOWED_SERVER_EVENTS.has(eventType)
  }

  isGenericEvent(eventType: string): boolean {
    return WASM_ALLOWED_GENERIC_EVENTS.has(eventType)
  }

  register(
    pluginId: string,
    eventTypes: string[],
    callback: EventCallback
  ): void {
    if (!this.subscriptions.has(pluginId)) {
      this.subscriptions.set(pluginId, [])
    }

    const allowedTypes =
      eventTypes.length === 0
        ? this.getAllowedEventTypes()
        : eventTypes.filter((t) => this.isAllowed(t))

    this.subscriptions.get(pluginId)!.push({
      pluginId,
      eventTypes: allowedTypes,
      callback
    })
    debug(
      `Registered event subscription for ${pluginId}: ${allowedTypes.join(', ') || 'all'}`
    )
  }

  unregister(pluginId: string): void {
    const count = this.subscriptions.get(pluginId)?.length || 0
    this.subscriptions.delete(pluginId)
    debug(`Unregistered ${count} event subscriptions for ${pluginId}`)
  }

  getSubscriptions(pluginId: string): EventSubscription[] {
    return this.subscriptions.get(pluginId) || []
  }

  routeEvent(event: ServerEvent): void {
    if (this.subscriptions.size === 0) {
      debug(`No subscriptions, skipping event ${event.type}`)
      return
    }

    if (!this.isAllowed(event.type)) {
      debug(`Event type ${event.type} not allowed for WASM plugins`)
      return
    }

    debug(`Routing event ${event.type} to ${this.subscriptions.size} plugin(s)`)

    const eventWithTimestamp: ServerEvent = {
      ...event,
      timestamp: event.timestamp || Date.now()
    }

    for (const [pluginId, subs] of this.subscriptions) {
      if (this.buffering.has(pluginId)) {
        this.bufferEvent(pluginId, eventWithTimestamp)
        continue
      }

      for (const sub of subs) {
        if (
          sub.eventTypes.length === 0 ||
          sub.eventTypes.includes(event.type)
        ) {
          try {
            sub.callback(eventWithTimestamp)
          } catch (error) {
            debug(`Error in event callback for ${pluginId}:`, error)
          }
          break
        }
      }
    }
  }

  startBuffering(pluginId: string): void {
    debug(`Started buffering events for ${pluginId}`)
    this.buffering.add(pluginId)
    this.buffers.set(pluginId, [])
  }

  stopBuffering(pluginId: string): ServerEvent[] {
    debug(`Stopped buffering events for ${pluginId}`)
    this.buffering.delete(pluginId)

    const buffered = this.buffers.get(pluginId) || []
    this.buffers.delete(pluginId)

    debug(`Returning ${buffered.length} buffered events for ${pluginId}`)
    return buffered
  }

  private bufferEvent(pluginId: string, event: ServerEvent): void {
    if (!this.buffers.has(pluginId)) {
      this.buffers.set(pluginId, [])
    }

    const buffer = this.buffers.get(pluginId)!
    buffer.push(event)

    const MAX_BUFFER_SIZE = 100
    if (buffer.length > MAX_BUFFER_SIZE) {
      buffer.shift()
      debug(`Event buffer overflow for ${pluginId}, dropped oldest event`)
    }
  }

  replayBuffered(pluginId: string, callback: EventCallback): void {
    const buffered = this.buffers.get(pluginId) || []
    debug(`Replaying ${buffered.length} buffered events to ${pluginId}`)

    for (const event of buffered) {
      try {
        callback(event)
      } catch (error) {
        debug(`Error replaying event to ${pluginId}:`, error)
      }
    }

    this.buffers.delete(pluginId)
  }

  getStats(): {
    totalSubscriptions: number
    activePlugins: number
    bufferingPlugins: number
    bufferedEvents: number
  } {
    let totalSubscriptions = 0
    for (const subs of this.subscriptions.values()) {
      totalSubscriptions += subs.length
    }

    let bufferedEvents = 0
    for (const buffer of this.buffers.values()) {
      bufferedEvents += buffer.length
    }

    return {
      totalSubscriptions,
      activePlugins: this.subscriptions.size,
      bufferingPlugins: this.buffering.size,
      bufferedEvents
    }
  }

  clear(): void {
    this.subscriptions.clear()
    this.buffers.clear()
    this.buffering.clear()
    debug('Cleared all event subscriptions and buffers')
  }
}

let eventManager: WasmEventManager | null = null

export function getEventManager(): WasmEventManager {
  if (!eventManager) {
    eventManager = new WasmEventManager()
  }
  return eventManager
}

export function initializeEventManager(): WasmEventManager {
  if (eventManager) {
    debug('Event manager already initialized')
    return eventManager
  }

  eventManager = new WasmEventManager()
  debug('Event manager initialized')
  return eventManager
}

export function resetEventManager(): void {
  debug('Resetting event manager singleton')
  eventManager = null
}
