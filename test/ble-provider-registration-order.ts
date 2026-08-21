import { expect } from 'chai'
import { startServer, SERVER_START_TIMEOUT } from './ts-servertestutilities'
import { BLEAdvertisement, BLEProvider } from '@signalk/server-api'

const MAC = 'AA:BB:CC:DD:EE:FF'

// A minimal BLEProvider double that stands in for LocalBLEProvider. It lets
// the test control exactly when register() happens relative to
// startDiscovery()'s first (synchronous) advertisement, without touching
// BlueZ/DBus - the same shape BLEApi's own initOneLocalProvider() builds
// around a real LocalBLEProvider (see src/api/ble/index.ts). This does not
// exercise initOneLocalProvider() itself - that method is private, requires
// a real LocalBLEProvider (Linux + BlueZ/DBus), and the codebase has no
// mocking library to substitute one - so it can't catch a regression that
// reorders register()/startDiscovery() at that call site. It locks in the
// invariant those two calls exist to protect: a device reported during the
// registering provider's own first discovery pass, before any subscriber
// exists, must still reach deviceTable.
const fakeProvider = (providerId: string): BLEProvider => {
  let listener: ((adv: BLEAdvertisement) => void) | undefined
  return {
    name: `Fake (${providerId})`,
    methods: {
      // Mirrors LocalBLEProvider: the first startDiscovery() pass
      // synchronously re-emits already-known devices.
      startDiscovery: async () => {
        listener?.({
          providerId,
          mac: MAC,
          rssi: -50,
          timestamp: Date.now(),
          addressType: 'random',
          connectable: true
        })
      },
      stopDiscovery: async () => {},
      getDevices: async () => [],
      onAdvertisement: (callback) => {
        listener = callback
        return () => {
          listener = undefined
        }
      },
      supportsGATT: () => false,
      availableGATTSlots: () => 0,
      subscribeGATT: async () => {
        throw new Error('not implemented')
      }
    }
  }
}

describe('BLE provider registration order', () => {
  let server: Awaited<ReturnType<typeof startServer>>['server']
  let get: Awaited<ReturnType<typeof startServer>>['get']
  let stop: Awaited<ReturnType<typeof startServer>>['stop']

  before(async function () {
    this.timeout(SERVER_START_TIMEOUT)
    ;({ server, get, stop } = await startServer())
  })

  after(async () => {
    await stop()
  })

  it('keeps a device seen during the first discovery pass reachable before any subscriber exists', async () => {
    const providerId = 'test:register-order'
    const provider = fakeProvider(providerId)

    try {
      // Mirrors initOneLocalProvider()'s ordering: register() first
      // (wiring up onAdvertisement -> _handleAdvertisement), then
      // startDiscovery() - whose first pass can emit advertisements for
      // already-known devices synchronously, before any plugin has called
      // subscribeGATT/attached an onAdvertisement listener of its own.
      server.app.bleApi.register(providerId, provider)
      await provider.methods.startDiscovery()

      const devices = await get('/vessels/self/ble/devices').then((r) =>
        r.json()
      )
      const device = devices.find((d: { mac: string }) => d.mac === MAC)
      expect(device, 'device seen before any subscriber must reach deviceTable')
        .to.exist
      expect(device.seenBy).to.have.length(1)
      expect(device.seenBy[0].providerId).to.equal(providerId)
    } finally {
      server.app.bleApi.unRegister(providerId)
    }
  })
})
