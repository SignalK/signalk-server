import { expect } from 'chai'
import { EventEmitter } from 'node:events'
import { BLEAdvertisement } from '@signalk/server-api'
import { LocalBLEProvider } from '../src/api/ble/localProvider'

// node-ble's Adapter.waitDevice(uuid, timeout, discoveryInterval) takes the
// timeout in milliseconds and only looks for the device once per interval,
// so any timeout shorter than one interval expires before the first look.
const NODE_BLE_POLL_INTERVAL_MS = 1000
// Slack on top of one poll interval, so the attach has settled before asserting
const SETTLE_MARGIN_MS = 250
const MAX_GATT_SLOTS = 3

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

class FakeHelper extends EventEmitter {
  async _prepare() {
    // node-ble resolves the object's properties here; nothing to do for a fake
  }
  async callMethod(_name: string) {
    // Connect / StopDiscovery / StartDiscovery all succeed silently
  }
}

class FakeDevice extends EventEmitter {
  helper = new FakeHelper()
  _propsProxy = {
    GetAll: async () => ({ Name: 'Sensor', RSSI: -64 })
  }
  async gatt() {
    return {}
  }
  async disconnect() {}
}

/** The private watcher entry point the discovery test drives directly. */
type DeviceWatcher = { startDeviceWatcher(): Promise<void> }

/** Reproduces node-ble's waitDevice() race between poll and timeout. */
class FakeAdapter {
  helper = new FakeHelper()

  private macs: string[]

  constructor(macs: string[] = []) {
    this.macs = macs
  }

  async devices() {
    return this.macs
  }

  waitDevice(_mac: string, timeout: number): Promise<FakeDevice> {
    return new Promise((resolve, reject) => {
      const poll = setTimeout(() => {
        clearTimeout(expiry)
        resolve(new FakeDevice())
      }, NODE_BLE_POLL_INTERVAL_MS)
      const expiry = setTimeout(() => {
        clearTimeout(poll)
        reject(new Error('operation timed out'))
      }, timeout)
    })
  }
}

const providerWithAdapter = (adapter: FakeAdapter, scanning = false) => {
  const provider = new LocalBLEProvider('hci0', MAX_GATT_SLOTS)
  Object.assign(provider, { adapter, adapterReady: true, scanning })
  return provider
}

describe('LocalBLEProvider', () => {
  it('emits an advertisement for a device BlueZ already knows about', async () => {
    const adapter = new FakeAdapter(['AA:BB:CC:DD:EE:FF'])
    const provider = providerWithAdapter(adapter, true)

    const seen: BLEAdvertisement[] = []
    provider.onAdvertisement((adv) => seen.push(adv))

    await (provider as unknown as DeviceWatcher).startDeviceWatcher()
    await delay(NODE_BLE_POLL_INTERVAL_MS + SETTLE_MARGIN_MS)
    provider.shutdown()

    expect(seen).to.have.lengthOf(1)
    expect(seen[0].mac).to.equal('AA:BB:CC:DD:EE:FF')
    expect(seen[0].rssi).to.equal(-64)
    expect(seen[0].name).to.equal('Sensor')
  })

  it('establishes a GATT connection and claims a slot', async () => {
    const adapter = new FakeAdapter()
    const provider = providerWithAdapter(adapter)

    const connection = await provider.connectGATT('aa:bb:cc:dd:ee:ff')
    expect(connection).to.not.equal(undefined)
    expect(provider.availableGATTSlots()).to.equal(MAX_GATT_SLOTS - 1)

    provider.shutdown()
  })
})
