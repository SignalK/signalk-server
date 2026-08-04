import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStore } from '../index'
import { BLE_API_PATH, BLE_GATEWAY_API_PATH } from './bleSlice'

interface FetchCall {
  url: string
  init?: RequestInit
}

const VALID_SETTINGS = {
  localBluetoothManaged: true,
  localAdapters: [],
  localMaxGATTSlots: 3,
  localBLESupported: true,
  activeAdapters: ['_localBLE:hci0'],
  adapterErrors: {}
}

const VALID_DEVICE = {
  mac: 'AA:BB:CC:DD:EE:FF',
  rssi: -60,
  lastSeen: 1700000000000,
  connectable: true,
  seenBy: [{ providerId: 'p1', rssi: -60, lastSeen: 1700000000000 }]
}

function mockFetch(
  responses: Record<string, { status: number; body?: unknown }>
): FetchCall[] {
  const calls: FetchCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      const match = responses[url] ?? { status: 404 }
      return {
        ok: match.status >= 200 && match.status < 300,
        status: match.status,
        statusText: `status ${match.status}`,
        json: async () => match.body
      }
    })
  )
  return calls
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('bleSlice', () => {
  beforeEach(() => {
    useStore.setState({
      bleDevices: [],
      bleConsumers: [],
      bleGateways: [],
      bleSettings: null,
      bleWsConnected: false,
      bleAdvCount: 0,
      bleSettingsSaving: false,
      bleSettingsSaveError: null
    })
  })

  afterEach(() => {
    useStore.getState().stopBleManagerPolling()
    vi.unstubAllGlobals()
  })

  describe('fetchBleSettings', () => {
    it('stores a valid settings payload', async () => {
      mockFetch({
        [`${BLE_API_PATH}/settings`]: { status: 200, body: VALID_SETTINGS }
      })

      await useStore.getState().fetchBleSettings()

      expect(useStore.getState().bleSettings).toEqual(VALID_SETTINGS)
    })

    it('ignores a malformed settings payload', async () => {
      mockFetch({
        [`${BLE_API_PATH}/settings`]: {
          status: 200,
          body: { localBluetoothManaged: 'yes' }
        }
      })

      await useStore.getState().fetchBleSettings()

      expect(useStore.getState().bleSettings).toBeNull()
    })

    it('keeps previous state on a failed request', async () => {
      useStore.setState({ bleSettings: VALID_SETTINGS })
      mockFetch({ [`${BLE_API_PATH}/settings`]: { status: 500 } })

      await useStore.getState().fetchBleSettings()

      expect(useStore.getState().bleSettings).toEqual(VALID_SETTINGS)
    })
  })

  describe('setBleSettingsLocal', () => {
    it('merges edits into loaded settings', () => {
      useStore.setState({ bleSettings: VALID_SETTINGS })

      useStore.getState().setBleSettingsLocal({ localMaxGATTSlots: 5 })

      expect(useStore.getState().bleSettings?.localMaxGATTSlots).toBe(5)
      expect(useStore.getState().bleSettings?.localBluetoothManaged).toBe(true)
    })

    it('is a no-op before settings have loaded', () => {
      useStore.getState().setBleSettingsLocal({ localMaxGATTSlots: 5 })

      expect(useStore.getState().bleSettings).toBeNull()
    })
  })

  describe('saveBleSettings', () => {
    it('PUTs only the persistable fields', async () => {
      useStore.setState({ bleSettings: VALID_SETTINGS })
      const calls = mockFetch({
        [`${BLE_API_PATH}/settings`]: { status: 200, body: {} }
      })

      await useStore.getState().saveBleSettings()

      const put = calls.find((c) => c.init?.method === 'PUT')
      expect(put).toBeDefined()
      expect(JSON.parse(put!.init!.body as string)).toEqual({
        localBluetoothManaged: true,
        localMaxGATTSlots: 3
      })
      expect(useStore.getState().bleSettingsSaving).toBe(false)
      expect(useStore.getState().bleSettingsSaveError).toBeNull()
    })

    it('surfaces the server error message on a rejected save', async () => {
      useStore.setState({ bleSettings: VALID_SETTINGS })
      mockFetch({
        [`${BLE_API_PATH}/settings`]: {
          status: 400,
          body: { message: 'localMaxGATTSlots out of range' }
        }
      })

      await useStore.getState().saveBleSettings()

      expect(useStore.getState().bleSettingsSaveError).toBe(
        'localMaxGATTSlots out of range'
      )
      expect(useStore.getState().bleSettingsSaving).toBe(false)
    })

    it('surfaces network failures and can be dismissed', async () => {
      useStore.setState({ bleSettings: VALID_SETTINGS })
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('connection refused')
        })
      )

      await useStore.getState().saveBleSettings()

      expect(useStore.getState().bleSettingsSaveError).toContain(
        'connection refused'
      )

      useStore.getState().clearBleSettingsSaveError()
      expect(useStore.getState().bleSettingsSaveError).toBeNull()
    })
  })

  describe('startBleManagerPolling', () => {
    it('loads all four endpoints and stores valid payloads', async () => {
      mockFetch({
        [`${BLE_API_PATH}/devices`]: { status: 200, body: [VALID_DEVICE] },
        [`${BLE_API_PATH}/consumers`]: {
          status: 200,
          body: [
            {
              pluginId: 'my-plugin',
              advertisementSubscriber: true,
              gattClaims: []
            }
          ]
        },
        [`${BLE_GATEWAY_API_PATH}/gateways`]: { status: 200, body: [] },
        [`${BLE_API_PATH}/settings`]: { status: 200, body: VALID_SETTINGS }
      })

      useStore.getState().startBleManagerPolling()
      await flush()

      const s = useStore.getState()
      expect(s.bleDevices).toEqual([VALID_DEVICE])
      expect(s.bleConsumers[0]?.pluginId).toBe('my-plugin')
      expect(s.bleSettings).toEqual(VALID_SETTINGS)
    })

    it('aborts an in-flight cycle when polling stops, so stalled requests cannot land later', async () => {
      const signals: AbortSignal[] = []
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init?: RequestInit) => {
          if (init?.signal) signals.push(init.signal)
          // Stalled request: never resolves within the test
          return new Promise(() => {})
        })
      )

      useStore.getState().startBleManagerPolling()
      expect(signals).toHaveLength(4)
      expect(signals.every((s) => !s.aborted)).toBe(true)

      useStore.getState().stopBleManagerPolling()
      expect(signals.every((s) => s.aborted)).toBe(true)
    })

    it('rejects malformed list payloads, keeping previous state', async () => {
      useStore.setState({ bleDevices: [VALID_DEVICE] })
      mockFetch({
        [`${BLE_API_PATH}/devices`]: {
          status: 200,
          body: [{ mac: 42, rssi: 'loud' }]
        },
        [`${BLE_API_PATH}/consumers`]: { status: 200, body: {} },
        [`${BLE_GATEWAY_API_PATH}/gateways`]: { status: 200, body: 'nope' },
        [`${BLE_API_PATH}/settings`]: { status: 404 }
      })

      useStore.getState().startBleManagerPolling()
      await flush()

      const s = useStore.getState()
      expect(s.bleDevices).toEqual([VALID_DEVICE])
      expect(s.bleConsumers).toEqual([])
      expect(s.bleGateways).toEqual([])
    })
  })
})
