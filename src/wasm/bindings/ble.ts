/**
 * WASM BLE Bindings
 *
 * Gives WASM plugins access to the server-managed BLE API. A WASM plugin
 * cannot await, so every host call returns immediately and its outcome
 * (connection changes, notifications, advertisements, asynchronous
 * failures) reaches the plugin as JSON events through its `ble_handler`
 * export.
 */

import Debug from 'debug'
import type {
  BLEAdvertisement,
  BLEApi,
  GATTSubscriptionDescriptor,
  GATTSubscriptionHandle
} from '@signalk/server-api'
import { derivePluginId } from '../../pluginid'
import { WasmCapabilities } from '../types'

const debug = Debug('signalk:wasm:ble')

/** The plugin lacks the `bluetooth` capability */
export const BLE_ERR_NOT_PERMITTED = -1
/** The server has no BLE API */
export const BLE_ERR_UNAVAILABLE = -2
/** The descriptor is not valid JSON or lacks `mac` or `service` */
export const BLE_ERR_INVALID_ARGUMENT = -3
/** No open subscription has this handle */
export const BLE_ERR_UNKNOWN_HANDLE = -4
/** The subscription's device is not connected */
export const BLE_ERR_NOT_CONNECTED = -5

/**
 * Events delivered to a plugin's `ble_handler` export, serialized as JSON.
 * Binary payloads are hex-encoded, matching the descriptor and
 * advertisement formats of the BLE API.
 */
export type WasmBleEvent =
  | { type: 'connected'; handle: number }
  | { type: 'disconnected'; handle: number }
  | { type: 'notify'; handle: number; uuid: string; data: string }
  | { type: 'error'; handle: number; message: string }
  | { type: 'advertisement'; advertisement: BLEAdvertisement }

type NotifyEvent = Extract<WasmBleEvent, { type: 'notify' }>

interface GattEntry {
  mac: string
  handle: GATTSubscriptionHandle | undefined
  // Providers may start notifications before subscribeGATT resolves; they
  // are held back so that `connected` always precedes them
  earlyNotifications: NotifyEvent[]
}

interface PluginBleState {
  bleApi: BLEApi
  gatt: Map<number, GattEntry>
  unsubscribeAdvertisements: (() => void) | undefined
}

const pluginStates = new Map<string, PluginBleState>()
const eventSinks = new Map<string, (event: WasmBleEvent) => void>()
let nextHandleId = 1

function stateFor(consumerId: string, bleApi: BLEApi): PluginBleState {
  let state = pluginStates.get(consumerId)
  if (!state) {
    state = { bleApi, gatt: new Map(), unsubscribeAdvertisements: undefined }
    pluginStates.set(consumerId, state)
  }
  return state
}

function emit(consumerId: string, event: WasmBleEvent): void {
  eventSinks.get(consumerId)?.(event)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isDescriptor(value: unknown): value is GATTSubscriptionDescriptor {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate['mac'] === 'string' &&
    typeof candidate['service'] === 'string'
  )
}

function releaseEntry(
  state: PluginBleState,
  entry: GattEntry,
  consumerId: string
): void {
  // A subscription still connecting has no handle yet; releasing the claim
  // makes the pending subscribeGATT call close its connection and reject
  const release = entry.handle
    ? entry.handle.close()
    : state.bleApi.releaseGATTDevice(entry.mac, consumerId)
  release.catch((error: unknown) => {
    debug(`[${consumerId}] GATT release error: ${errorMessage(error)}`)
  })
}

/**
 * Route BLE events for a plugin to the given sink, or stop routing them
 * when `sink` is undefined. The sink serializes an event only if it
 * delivers it. Accepts a package name or a plugin id.
 */
export function setBleEventSink(
  pluginId: string,
  sink: ((event: WasmBleEvent) => void) | undefined
): void {
  const consumerId = derivePluginId(pluginId)
  if (sink) {
    eventSinks.set(consumerId, sink)
  } else {
    eventSinks.delete(consumerId)
  }
}

/**
 * Close every GATT subscription and the advertisement subscription a
 * plugin holds, and stop routing events to it. Accepts a package name or
 * a plugin id.
 */
export function closeAllBleForPlugin(pluginId: string): void {
  const consumerId = derivePluginId(pluginId)
  eventSinks.delete(consumerId)
  const state = pluginStates.get(consumerId)
  if (!state) return
  pluginStates.delete(consumerId)
  for (const entry of state.gatt.values()) {
    releaseEntry(state, entry, consumerId)
  }
  state.gatt.clear()
  state.unsubscribeAdvertisements?.()
  debug(`[${consumerId}] Closed BLE subscriptions`)
}

/**
 * Create the `sk_ble_*` host bindings for a plugin. The plugin is the BLE
 * consumer under its derived plugin id, so its claims appear in the BLE
 * Manager under that id.
 */
export function createBleBindings(
  pluginId: string,
  capabilities: Pick<WasmCapabilities, 'bluetooth'>,
  app: { bleApi?: BLEApi } | undefined,
  readUtf8String: (ptr: number, len: number) => string,
  readBinaryData: (ptr: number, len: number) => Buffer
) {
  const consumerId = derivePluginId(pluginId)

  const getBleApi = (): BLEApi | number => {
    if (!capabilities.bluetooth) {
      debug(`[${consumerId}] bluetooth capability not granted`)
      return BLE_ERR_NOT_PERMITTED
    }
    return app?.bleApi ?? BLE_ERR_UNAVAILABLE
  }

  // Once the API resolves the subscription, a removed entry was released
  // through the claim, which already closed this handle
  const watchHandle = (
    state: PluginBleState,
    id: number,
    entry: GattEntry,
    handle: GATTSubscriptionHandle
  ): void => {
    if (state.gatt.get(id) !== entry) return
    entry.handle = handle
    handle.onConnect(() => {
      if (state.gatt.get(id) === entry) {
        emit(consumerId, { type: 'connected', handle: id })
      }
    })
    handle.onDisconnect(() => {
      if (state.gatt.get(id) === entry) {
        emit(consumerId, { type: 'disconnected', handle: id })
      }
    })
    const early = entry.earlyNotifications
    entry.earlyNotifications = []
    if (handle.connected) {
      emit(consumerId, { type: 'connected', handle: id })
      for (const event of early) emit(consumerId, event)
    }
  }

  return {
    /**
     * Start a GATT subscription from a JSON GATTSubscriptionDescriptor.
     * @returns a positive handle, or a negative BLE_ERR_* code
     */
    sk_ble_subscribe_gatt: (descPtr: number, descLen: number): number => {
      const bleApi = getBleApi()
      if (typeof bleApi === 'number') return bleApi

      let descriptor: unknown
      try {
        descriptor = JSON.parse(readUtf8String(descPtr, descLen))
      } catch (error) {
        debug(`[${consumerId}] Invalid GATT descriptor: ${errorMessage(error)}`)
        return BLE_ERR_INVALID_ARGUMENT
      }
      if (!isDescriptor(descriptor)) {
        return BLE_ERR_INVALID_ARGUMENT
      }

      const id = nextHandleId++
      const state = stateFor(consumerId, bleApi)
      const entry: GattEntry = {
        mac: descriptor.mac,
        handle: undefined,
        earlyNotifications: []
      }
      state.gatt.set(id, entry)

      bleApi
        .subscribeGATT(descriptor, consumerId, (uuid, data) => {
          if (state.gatt.get(id) !== entry) return
          const event: NotifyEvent = {
            type: 'notify',
            handle: id,
            uuid,
            data: data.toString('hex')
          }
          if (entry.handle) {
            emit(consumerId, event)
          } else {
            entry.earlyNotifications.push(event)
          }
        })
        .then(
          (handle) => watchHandle(state, id, entry, handle),
          (error: unknown) => {
            if (state.gatt.get(id) !== entry) return
            state.gatt.delete(id)
            emit(consumerId, {
              type: 'error',
              handle: id,
              message: errorMessage(error)
            })
          }
        )

      return id
    },

    /**
     * Write bytes to a characteristic of a subscribed device. Write
     * failures arrive as `error` events.
     * @returns 0 when the write was issued, or a negative BLE_ERR_* code
     */
    sk_ble_gatt_write: (
      handleId: number,
      uuidPtr: number,
      uuidLen: number,
      dataPtr: number,
      dataLen: number,
      withResponse: number
    ): number => {
      const state = pluginStates.get(consumerId)
      const entry = state?.gatt.get(handleId)
      if (!state || !entry) return BLE_ERR_UNKNOWN_HANDLE
      const handle = entry.handle
      if (!handle?.connected) return BLE_ERR_NOT_CONNECTED

      let uuid: string
      let data: Buffer
      try {
        uuid = readUtf8String(uuidPtr, uuidLen)
        data = readBinaryData(dataPtr, dataLen)
      } catch (error) {
        debug(`[${consumerId}] Invalid GATT write: ${errorMessage(error)}`)
        return BLE_ERR_INVALID_ARGUMENT
      }
      handle.write(uuid, data, withResponse !== 0).catch((error) => {
        if (state.gatt.get(handleId) !== entry) return
        emit(consumerId, {
          type: 'error',
          handle: handleId,
          message: errorMessage(error)
        })
      })
      return 0
    },

    /**
     * Close a GATT subscription and release its claim.
     * @returns 0, or a negative BLE_ERR_* code
     */
    sk_ble_gatt_close: (handleId: number): number => {
      const state = pluginStates.get(consumerId)
      const entry = state?.gatt.get(handleId)
      if (!state || !entry) return BLE_ERR_UNKNOWN_HANDLE
      state.gatt.delete(handleId)
      releaseEntry(state, entry, consumerId)
      return 0
    },

    /**
     * Receive every advertisement the server sees as `advertisement`
     * events. Subscribing again while subscribed has no effect.
     * @returns 0, or a negative BLE_ERR_* code
     */
    sk_ble_subscribe_advertisements: (): number => {
      const bleApi = getBleApi()
      if (typeof bleApi === 'number') return bleApi
      const state = stateFor(consumerId, bleApi)
      if (!state.unsubscribeAdvertisements) {
        state.unsubscribeAdvertisements = bleApi.onAdvertisement(
          consumerId,
          (advertisement) => {
            emit(consumerId, { type: 'advertisement', advertisement })
          }
        )
      }
      return 0
    },

    /**
     * Stop receiving advertisements.
     * @returns 0
     */
    sk_ble_unsubscribe_advertisements: (): number => {
      const state = pluginStates.get(consumerId)
      state?.unsubscribeAdvertisements?.()
      if (state) state.unsubscribeAdvertisements = undefined
      return 0
    }
  }
}
