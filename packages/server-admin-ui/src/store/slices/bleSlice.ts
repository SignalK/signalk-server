import type { StateCreator } from 'zustand'
import Type, { type Static, type TSchema } from 'typebox'
import { Check } from 'typebox/value'

export const BLE_API_PATH = '/signalk/v2/api/vessels/self/ble'
export const BLE_GATEWAY_API_PATH = '/signalk/v2/api/ble'

export const BLE_POLL_INTERVAL_MS = 5000
export const BLE_WS_RECONNECT_DELAY_MS = 5000
export const BLE_ADV_COUNT_REFRESH_MS = 1000

// ---------------------------------------------------------------------------
// Payload schemas — the fields this UI consumes, validated before any
// server response enters store state. Extra fields are allowed so the
// server can grow the payloads without breaking older admin UIs.
// ---------------------------------------------------------------------------

const OptionalNullable = <T extends TSchema>(schema: T) =>
  Type.Optional(Type.Union([schema, Type.Null()]))

export const BleDeviceSchema = Type.Object({
  mac: Type.String(),
  name: Type.Optional(Type.String()),
  rssi: Type.Number(),
  lastSeen: Type.Number(),
  connectable: Type.Boolean(),
  seenBy: Type.Array(
    Type.Object({
      providerId: Type.String(),
      rssi: Type.Number(),
      lastSeen: Type.Number()
    })
  ),
  gattClaimedBy: OptionalNullable(Type.String())
})

export const BleDeviceListSchema = Type.Array(BleDeviceSchema)

export const BleConsumerSchema = Type.Object({
  pluginId: Type.String(),
  advertisementSubscriber: Type.Boolean(),
  gattClaims: Type.Array(Type.String())
})

export const BleConsumerListSchema = Type.Array(BleConsumerSchema)

export const BleGatewaySchema = Type.Object({
  gatewayId: Type.String(),
  online: Type.Boolean(),
  ipAddress: OptionalNullable(Type.String()),
  firmware: OptionalNullable(Type.String()),
  connectedAt: OptionalNullable(Type.Number()),
  disconnectedAt: OptionalNullable(Type.Number()),
  uptime: OptionalNullable(Type.Number()),
  freeHeap: OptionalNullable(Type.Number()),
  gattSlots: Type.Object({
    total: Type.Number(),
    available: Type.Number()
  }),
  deviceCount: Type.Number()
})

export const BleGatewayListSchema = Type.Array(BleGatewaySchema)

export const BleSettingsSchema = Type.Object({
  localBluetoothManaged: Type.Boolean(),
  localAdapters: Type.Array(Type.String()),
  localMaxGATTSlots: Type.Number(),
  localBLESupported: Type.Boolean(),
  activeAdapters: Type.Array(Type.String()),
  adapterErrors: Type.Record(Type.String(), Type.String())
})

export type BleDevice = Static<typeof BleDeviceSchema>
export type BleConsumer = Static<typeof BleConsumerSchema>
export type BleGateway = Static<typeof BleGatewaySchema>
export type BleSettings = Static<typeof BleSettingsSchema>

export interface BleSliceState {
  bleDevices: BleDevice[]
  bleConsumers: BleConsumer[]
  bleGateways: BleGateway[]
  bleSettings: BleSettings | null
  bleWsConnected: boolean
  bleAdvCount: number
  bleSettingsSaving: boolean
  bleSettingsSaveError: string | null
}

export interface BleSliceActions {
  /** Load settings once (Server Settings page). */
  fetchBleSettings: () => Promise<void>
  /** Local form edit; does not persist until saveBleSettings. */
  setBleSettingsLocal: (updates: Partial<BleSettings>) => void
  saveBleSettings: () => Promise<void>
  clearBleSettingsSaveError: () => void
  /** Poll devices/consumers/gateways/settings while BLE Manager is open. */
  startBleManagerPolling: () => void
  stopBleManagerPolling: () => void
  /** Live advertisement counter via the /advertisements WebSocket. */
  connectBleAdvertisements: () => void
  closeBleAdvertisements: () => void
}

export type BleSlice = BleSliceState & BleSliceActions

// Timers, the WebSocket, and the raw advertisement counter live outside
// Zustand state: they are not renderable data and the counter ticks far
// too often to funnel through set() per advertisement.
let pollTimer: ReturnType<typeof setInterval> | null = null
let pollAbort: AbortController | null = null
let advWs: WebSocket | null = null
let advReconnectTimer: ReturnType<typeof setTimeout> | null = null
let advCountTimer: ReturnType<typeof setInterval> | null = null
let advCounter = 0
let advDisposed = true

async function fetchValidated<T extends TSchema>(
  url: string,
  schema: T,
  onValid: (data: Static<T>) => void,
  signal?: AbortSignal
): Promise<void> {
  try {
    const res = await fetch(url, { credentials: 'include', signal })
    if (!res.ok) return
    const data: unknown = await res.json()
    // Malformed payloads are ignored, keeping the previous state.
    if (Check(schema, data)) {
      onValid(data)
    }
  } catch {
    // ignore — aborted or failed; the poll retries, and the BLE API
    // may not be available at all
  }
}

const initialBleState: BleSliceState = {
  bleDevices: [],
  bleConsumers: [],
  bleGateways: [],
  bleSettings: null,
  bleWsConnected: false,
  bleAdvCount: 0,
  bleSettingsSaving: false,
  bleSettingsSaveError: null
}

export const createBleSlice: StateCreator<BleSlice, [], [], BleSlice> = (
  set,
  get
) => {
  const pollAll = () => {
    // Abort the previous cycle first: a stalled or slow response must
    // not land after a newer one and overwrite fresher state
    pollAbort?.abort()
    const controller = new AbortController()
    pollAbort = controller
    const signal = controller.signal
    fetchValidated(
      `${BLE_API_PATH}/devices`,
      BleDeviceListSchema,
      (devices) => set({ bleDevices: devices }),
      signal
    )
    fetchValidated(
      `${BLE_API_PATH}/consumers`,
      BleConsumerListSchema,
      (consumers) => set({ bleConsumers: consumers }),
      signal
    )
    fetchValidated(
      `${BLE_GATEWAY_API_PATH}/gateways`,
      BleGatewayListSchema,
      (gateways) => set({ bleGateways: gateways }),
      signal
    )
    fetchValidated(
      `${BLE_API_PATH}/settings`,
      BleSettingsSchema,
      (settings) => set({ bleSettings: settings }),
      signal
    )
  }

  return {
    ...initialBleState,

    fetchBleSettings: async () => {
      await fetchValidated(
        `${BLE_API_PATH}/settings`,
        BleSettingsSchema,
        (settings) => set({ bleSettings: settings })
      )
    },

    setBleSettingsLocal: (updates) => {
      set((state) =>
        state.bleSettings
          ? { bleSettings: { ...state.bleSettings, ...updates } }
          : state
      )
    },

    saveBleSettings: async () => {
      const settings = get().bleSettings
      if (!settings) return
      set({ bleSettingsSaving: true, bleSettingsSaveError: null })
      try {
        const res = await fetch(`${BLE_API_PATH}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            localBluetoothManaged: settings.localBluetoothManaged,
            localMaxGATTSlots: settings.localMaxGATTSlots
          }),
          credentials: 'include'
        })
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ message: res.statusText }))
          set({
            bleSettingsSaveError:
              (err as { message?: string }).message ||
              'Failed to save BLE settings'
          })
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        set({ bleSettingsSaveError: `Failed to save BLE settings: ${message}` })
      } finally {
        set({ bleSettingsSaving: false })
      }
    },

    clearBleSettingsSaveError: () => {
      set({ bleSettingsSaveError: null })
    },

    startBleManagerPolling: () => {
      if (pollTimer) return
      pollAll()
      pollTimer = setInterval(pollAll, BLE_POLL_INTERVAL_MS)
    },

    stopBleManagerPolling: () => {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      pollAbort?.abort()
      pollAbort = null
    },

    connectBleAdvertisements: () => {
      if (advWs || !advDisposed) return
      advDisposed = false
      advCounter = 0
      set({ bleAdvCount: 0 })

      const connect = () => {
        if (advDisposed) return
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const socket = new WebSocket(
          `${proto}://${window.location.host}${BLE_API_PATH}/advertisements`
        )
        advWs = socket
        socket.onopen = () => {
          if (advWs !== socket) return
          set({ bleWsConnected: true })
        }
        socket.onclose = () => {
          if (advWs !== socket) return
          set({ bleWsConnected: false })
          if (!advDisposed) {
            advReconnectTimer = setTimeout(connect, BLE_WS_RECONNECT_DELAY_MS)
          }
        }
        socket.onerror = () => {
          if (advWs !== socket) return
          socket.close()
        }
        socket.onmessage = () => {
          advCounter += 1
        }
      }
      connect()

      advCountTimer = setInterval(() => {
        if (get().bleAdvCount !== advCounter) {
          set({ bleAdvCount: advCounter })
        }
      }, BLE_ADV_COUNT_REFRESH_MS)
    },

    closeBleAdvertisements: () => {
      advDisposed = true
      if (advReconnectTimer) {
        clearTimeout(advReconnectTimer)
        advReconnectTimer = null
      }
      if (advCountTimer) {
        clearInterval(advCountTimer)
        advCountTimer = null
      }
      advWs?.close()
      advWs = null
      set({ bleWsConnected: false })
    }
  }
}
