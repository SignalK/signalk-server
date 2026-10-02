import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import {
  BLEAdvertisement,
  BLEGattConnection,
  BLEProvider
} from '@signalk/server-api'
import type { BLEApi } from '../src/api/ble'
import { freeport, SERVER_START_TIMEOUT } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Server = require('../dist/')

/**
 * Stopping a plugin through the server has to release the GATT claims it
 * still holds, the path a plugin restart after a configuration change takes.
 */

const CONFIG_DIR = path.join(__dirname, 'plugin-test-config')
const PLUGIN_ID = 'testplugin'
const PLUGIN_CONFIG_FILE = path.join(
  CONFIG_DIR,
  'plugin-config-data',
  `${PLUGIN_ID}.json`
)
const MAC = 'AA:BB:CC:DD:EE:FF'
const PROVIDER_ID = 'test-gateway'
const GATT_SLOTS = 3
const RSSI = -60
// The configuration POST answers before the plugin has stopped
const RELEASE_TIMEOUT_MS = 5000
const POLL_INTERVAL_MS = 50

interface ServerHandle {
  app: { bleApi: BLEApi; plugins: { id: string; started?: boolean }[] }
  start(): Promise<unknown>
  stop(): Promise<unknown>
}

describe('BLE GATT claims of a plugin the server stops', () => {
  let server: ServerHandle | undefined
  let port: number
  let previousConfigDir: string | undefined
  let previousPluginConfig: string | undefined

  before(async function () {
    this.timeout(SERVER_START_TIMEOUT)
    previousConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR
    process.env.SIGNALK_NODE_CONFIG_DIR = CONFIG_DIR
    previousPluginConfig = fs.existsSync(PLUGIN_CONFIG_FILE)
      ? fs.readFileSync(PLUGIN_CONFIG_FILE, 'utf8')
      : undefined
    fs.mkdirSync(path.dirname(PLUGIN_CONFIG_FILE), { recursive: true })
    fs.writeFileSync(
      PLUGIN_CONFIG_FILE,
      JSON.stringify({ enabled: true, configuration: {} })
    )
    port = await freeport()
    server = new Server({ config: { settings: { port } } }) as ServerHandle
    await server.start()
  })

  after(async () => {
    try {
      await server?.stop()
    } finally {
      if (previousConfigDir === undefined) {
        delete process.env.SIGNALK_NODE_CONFIG_DIR
      } else {
        process.env.SIGNALK_NODE_CONFIG_DIR = previousConfigDir
      }
      if (previousPluginConfig === undefined) {
        fs.rmSync(PLUGIN_CONFIG_FILE, { force: true })
      } else {
        fs.writeFileSync(PLUGIN_CONFIG_FILE, previousPluginConfig)
      }
    }
  })

  it('closes a connection a running plugin left open when it is disabled', async () => {
    const { bleApi, plugins } = server!.app
    expect(plugins.find((p) => p.id === PLUGIN_ID)?.started).to.equal(true)
    let closes = 0
    const connection: BLEGattConnection = {
      read: async () => Buffer.alloc(0),
      write: async () => undefined,
      startNotifications: async () => undefined,
      stopNotifications: async () => undefined,
      discoverServices: async () => [],
      disconnect: async () => {
        closes++
      },
      get connected() {
        return closes === 0
      },
      onDisconnect: () => undefined
    }
    let advertise: (adv: BLEAdvertisement) => void = () => undefined
    const provider: BLEProvider = {
      name: 'Test gateway',
      methods: {
        startDiscovery: async () => undefined,
        stopDiscovery: async () => undefined,
        getDevices: async () => [MAC],
        onAdvertisement: (callback) => {
          advertise = callback
          return () => undefined
        },
        supportsGATT: () => true,
        availableGATTSlots: () => GATT_SLOTS,
        subscribeGATT: async () => {
          throw new Error('not used')
        },
        connectGATT: async () => connection
      }
    }
    bleApi.register(PROVIDER_ID, provider)
    advertise({
      mac: MAC,
      rssi: RSSI,
      providerId: PROVIDER_ID,
      timestamp: Date.now(),
      connectable: true
    })
    await bleApi.connectGATT(MAC, PLUGIN_ID)

    const res = await fetch(
      `http://localhost:${port}/skServer/plugins/${PLUGIN_ID}/config`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false, configuration: {} })
      }
    )
    expect(res.status).to.equal(200)

    const deadline = Date.now() + RELEASE_TIMEOUT_MS
    while (closes === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
    expect(closes).to.equal(1)
    expect(bleApi.getGATTClaims().size).to.equal(0)
    bleApi.unRegister(PROVIDER_ID)
  })
})
