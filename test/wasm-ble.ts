import { expect } from 'chai'
import type {
  BLEAdvertisement,
  BLEApi,
  GATTSubscriptionDescriptor,
  GATTSubscriptionHandle
} from '@signalk/server-api'
import {
  BLE_ERR_INVALID_ARGUMENT,
  BLE_ERR_NOT_CONNECTED,
  BLE_ERR_NOT_PERMITTED,
  BLE_ERR_UNAVAILABLE,
  BLE_ERR_UNKNOWN_HANDLE,
  closeAllBleForPlugin,
  createBleBindings,
  setBleEventSink,
  WasmBleEvent
} from '../src/wasm/bindings/ble'
import { createUtf8Reader } from '../src/wasm/bindings/env-imports'
import { createBinaryDataReader } from '../src/wasm/bindings/binary-stream'
import { wrapStringHandlerExport } from '../src/wasm/loaders/standard-loader'
import { wasmPlugins } from '../src/wasm/loader/plugin-registry'
import {
  startWasmPlugin,
  stopWasmPlugin
} from '../src/wasm/loader/plugin-lifecycle'
import type { WasmPlugin } from '../src/wasm/loader/types'
import type { WasmPluginInstance } from '../src/wasm/types'

const PACKAGE_NAME = '@acme/calypso-wasm'
const PLUGIN_ID = '_acme_calypso-wasm'
const MAC = 'AA:BB:CC:DD:EE:FF'
const SERVICE = '0000180d-0000-1000-8000-00805f9b34fb'
const CHAR = '00002a39-0000-1000-8000-00805f9b34fb'
const DESCRIPTOR: GATTSubscriptionDescriptor = {
  mac: MAC,
  service: SERVICE,
  notify: [CHAR]
}
const SCRATCH_OFFSET = 1024

class FakeHandle implements GATTSubscriptionHandle {
  connected = true
  closed = false
  writes: { uuid: string; data: Buffer; withResponse?: boolean }[] = []
  private connectCallbacks: (() => void)[] = []
  private disconnectCallbacks: (() => void)[] = []

  async read(): Promise<Buffer> {
    return Buffer.alloc(0)
  }
  async write(uuid: string, data: Buffer, withResponse?: boolean) {
    this.writes.push({ uuid, data, withResponse })
  }
  async close() {
    this.closed = true
  }
  onConnect(cb: () => void) {
    this.connectCallbacks.push(cb)
  }
  onDisconnect(cb: () => void) {
    this.disconnectCallbacks.push(cb)
  }
  fireDisconnect() {
    this.connected = false
    for (const cb of this.disconnectCallbacks) cb()
  }
}

interface PendingSubscription {
  descriptor: GATTSubscriptionDescriptor
  pluginId: string
  notify: (charUuid: string, data: Buffer) => void
  resolve: (handle: GATTSubscriptionHandle) => void
  reject: (error: Error) => void
}

class FakeBleApi {
  subscriptions: PendingSubscription[] = []
  released: { mac: string; pluginId: string }[] = []
  advertisementConsumer: string | undefined
  advertisementCallback: ((adv: BLEAdvertisement) => void) | undefined
  rejectWith: Error | undefined

  subscribeGATT(
    descriptor: GATTSubscriptionDescriptor,
    pluginId: string,
    notify: (charUuid: string, data: Buffer) => void
  ): Promise<GATTSubscriptionHandle> {
    return new Promise((resolve, reject) => {
      this.subscriptions.push({ descriptor, pluginId, notify, resolve, reject })
      if (this.rejectWith) reject(this.rejectWith)
    })
  }

  async releaseGATTDevice(mac: string, pluginId: string) {
    this.released.push({ mac, pluginId })
  }

  onAdvertisement(pluginId: string, cb: (adv: BLEAdvertisement) => void) {
    this.advertisementConsumer = pluginId
    this.advertisementCallback = cb
    return () => {
      this.advertisementCallback = undefined
    }
  }

  asBleApi(): BLEApi {
    return this as unknown as BLEApi
  }
}

function setup(bluetooth = true, withApi = true) {
  const memory = new WebAssembly.Memory({ initial: 1 })
  const memoryRef = { current: memory }
  const bleApi = new FakeBleApi()
  const bindings = createBleBindings(
    PACKAGE_NAME,
    { bluetooth },
    withApi ? { bleApi: bleApi.asBleApi() } : {},
    createUtf8Reader(memoryRef),
    createBinaryDataReader(memoryRef)
  )
  let offset = SCRATCH_OFFSET
  const put = (bytes: Uint8Array): [number, number] => {
    const ptr = offset
    new Uint8Array(memory.buffer).set(bytes, ptr)
    offset += bytes.length
    return [ptr, bytes.length]
  }
  const putString = (value: string) => put(new TextEncoder().encode(value))
  const events: WasmBleEvent[] = []
  setBleEventSink(PACKAGE_NAME, (event) => events.push(event))
  return { bindings, bleApi, put, putString, events }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('WASM BLE bindings', () => {
  afterEach(() => closeAllBleForPlugin(PLUGIN_ID))

  it('refuses plugins without the bluetooth capability', () => {
    const { bindings, bleApi, putString } = setup(false)
    expect(
      bindings.sk_ble_subscribe_gatt(...putString(JSON.stringify(DESCRIPTOR)))
    ).to.equal(BLE_ERR_NOT_PERMITTED)
    expect(bindings.sk_ble_subscribe_advertisements()).to.equal(
      BLE_ERR_NOT_PERMITTED
    )
    expect(bleApi.subscriptions).to.have.length(0)
    expect(bleApi.advertisementCallback).to.equal(undefined)
  })

  it('reports a server without BLE as unavailable', () => {
    const { bindings, putString } = setup(true, false)
    expect(
      bindings.sk_ble_subscribe_gatt(...putString(JSON.stringify(DESCRIPTOR)))
    ).to.equal(BLE_ERR_UNAVAILABLE)
  })

  it('rejects malformed descriptors', () => {
    const { bindings, bleApi, putString } = setup()
    expect(bindings.sk_ble_subscribe_gatt(...putString('{not json'))).to.equal(
      BLE_ERR_INVALID_ARGUMENT
    )
    expect(
      bindings.sk_ble_subscribe_gatt(...putString('{"mac":"AA"}'))
    ).to.equal(BLE_ERR_INVALID_ARGUMENT)
    expect(bleApi.subscriptions).to.have.length(0)
  })

  it('delivers connection changes and notifications as events', async () => {
    const { bindings, bleApi, putString, events } = setup()
    const handleId = bindings.sk_ble_subscribe_gatt(
      ...putString(JSON.stringify(DESCRIPTOR))
    )
    expect(handleId).to.be.greaterThan(0)

    const [sub] = bleApi.subscriptions
    expect(sub!.pluginId).to.equal(PLUGIN_ID)
    expect(sub!.descriptor).to.deep.equal(DESCRIPTOR)

    const handle = new FakeHandle()
    sub!.resolve(handle)
    await flush()
    sub!.notify(CHAR, Buffer.from([0x01, 0xab, 0xff]))
    handle.fireDisconnect()

    expect(events).to.deep.equal([
      { type: 'connected', handle: handleId },
      { type: 'notify', handle: handleId, uuid: CHAR, data: '01abff' },
      { type: 'disconnected', handle: handleId }
    ])
  })

  it('delivers notifications that precede the subscription after connected', async () => {
    const { bindings, bleApi, putString, events } = setup()
    const handleId = bindings.sk_ble_subscribe_gatt(
      ...putString(JSON.stringify(DESCRIPTOR))
    )
    const [sub] = bleApi.subscriptions
    sub!.notify(CHAR, Buffer.from([0x01]))
    expect(events).to.deep.equal([])

    sub!.resolve(new FakeHandle())
    await flush()
    expect(events).to.deep.equal([
      { type: 'connected', handle: handleId },
      { type: 'notify', handle: handleId, uuid: CHAR, data: '01' }
    ])
  })

  it('reports a failed subscription as an error event', async () => {
    const { bindings, bleApi, putString, events } = setup()
    const handleId = bindings.sk_ble_subscribe_gatt(
      ...putString(JSON.stringify(DESCRIPTOR))
    )
    bleApi.subscriptions[0]!.reject(new Error('device not visible'))
    await flush()

    expect(events).to.deep.equal([
      { type: 'error', handle: handleId, message: 'device not visible' }
    ])
    expect(bindings.sk_ble_gatt_close(handleId)).to.equal(
      BLE_ERR_UNKNOWN_HANDLE
    )
  })

  it('writes to a connected device', async () => {
    const { bindings, bleApi, put, putString } = setup()
    const handleId = bindings.sk_ble_subscribe_gatt(
      ...putString(JSON.stringify(DESCRIPTOR))
    )
    const [uuidPtr, uuidLen] = putString(CHAR)
    const [dataPtr, dataLen] = put(new Uint8Array([0x0a, 0x0b]))

    expect(
      bindings.sk_ble_gatt_write(
        handleId,
        uuidPtr,
        uuidLen,
        dataPtr,
        dataLen,
        1
      )
    ).to.equal(BLE_ERR_NOT_CONNECTED)

    const handle = new FakeHandle()
    bleApi.subscriptions[0]!.resolve(handle)
    await flush()

    expect(
      bindings.sk_ble_gatt_write(
        handleId,
        uuidPtr,
        uuidLen,
        dataPtr,
        dataLen,
        1
      )
    ).to.equal(0)
    expect(handle.writes).to.deep.equal([
      { uuid: CHAR, data: Buffer.from([0x0a, 0x0b]), withResponse: true }
    ])
    expect(
      bindings.sk_ble_gatt_write(
        handleId + 1,
        uuidPtr,
        uuidLen,
        dataPtr,
        dataLen,
        0
      )
    ).to.equal(BLE_ERR_UNKNOWN_HANDLE)
  })

  it('rejects writes from outside guest memory', async () => {
    const { bindings, bleApi, putString } = setup()
    const handleId = bindings.sk_ble_subscribe_gatt(
      ...putString(JSON.stringify(DESCRIPTOR))
    )
    bleApi.subscriptions[0]!.resolve(new FakeHandle())
    await flush()
    const [uuidPtr, uuidLen] = putString(CHAR)
    const outOfBounds = 1 << 20
    expect(
      bindings.sk_ble_gatt_write(handleId, uuidPtr, uuidLen, outOfBounds, 4, 0)
    ).to.equal(BLE_ERR_INVALID_ARGUMENT)
  })

  it('drops a write failure of a closed subscription', async () => {
    const { bindings, bleApi, put, putString, events } = setup()
    const handleId = bindings.sk_ble_subscribe_gatt(
      ...putString(JSON.stringify(DESCRIPTOR))
    )
    const handle = new FakeHandle()
    let failWrite: (error: Error) => void = () => {}
    handle.write = () =>
      new Promise<void>((_resolve, reject) => {
        failWrite = reject
      })
    bleApi.subscriptions[0]!.resolve(handle)
    await flush()
    events.length = 0

    bindings.sk_ble_gatt_write(
      handleId,
      ...putString(CHAR),
      ...put(new Uint8Array([1])),
      0
    )
    bindings.sk_ble_gatt_close(handleId)
    failWrite(new Error('link lost'))
    await flush()
    expect(events).to.deep.equal([])
  })

  it('closes a subscription and drops its later notifications', async () => {
    const { bindings, bleApi, putString, events } = setup()
    const handleId = bindings.sk_ble_subscribe_gatt(
      ...putString(JSON.stringify(DESCRIPTOR))
    )
    const handle = new FakeHandle()
    bleApi.subscriptions[0]!.resolve(handle)
    await flush()
    events.length = 0

    expect(bindings.sk_ble_gatt_close(handleId)).to.equal(0)
    bleApi.subscriptions[0]!.notify(CHAR, Buffer.from([1]))

    expect(handle.closed).to.equal(true)
    expect(events).to.deep.equal([])
    expect(bindings.sk_ble_gatt_close(handleId)).to.equal(
      BLE_ERR_UNKNOWN_HANDLE
    )
  })

  it('cancels a subscription closed while still connecting', async () => {
    const { bindings, bleApi, putString, events } = setup()
    const handleId = bindings.sk_ble_subscribe_gatt(
      ...putString(JSON.stringify(DESCRIPTOR))
    )
    expect(bindings.sk_ble_gatt_close(handleId)).to.equal(0)
    expect(bleApi.released).to.deep.equal([{ mac: MAC, pluginId: PLUGIN_ID }])

    // The BLE API closes a released claim's connection itself
    const lateHandle = new FakeHandle()
    bleApi.subscriptions[0]!.resolve(lateHandle)
    await flush()
    expect(lateHandle.closed).to.equal(false)
    expect(events).to.deep.equal([])
  })

  it('delivers advertisements until unsubscribed', () => {
    const { bindings, bleApi, events } = setup()
    expect(bindings.sk_ble_subscribe_advertisements()).to.equal(0)
    expect(bleApi.advertisementConsumer).to.equal(PLUGIN_ID)

    const adv: BLEAdvertisement = {
      mac: MAC,
      rssi: -70,
      providerId: 'local',
      timestamp: 1
    }
    bleApi.advertisementCallback!(adv)
    expect(events).to.deep.equal([
      { type: 'advertisement', advertisement: adv }
    ])

    expect(bindings.sk_ble_unsubscribe_advertisements()).to.equal(0)
    expect(bleApi.advertisementCallback).to.equal(undefined)
  })

  it('releases everything a plugin holds on cleanup', async () => {
    const { bindings, bleApi, putString, events } = setup()
    bindings.sk_ble_subscribe_gatt(...putString(JSON.stringify(DESCRIPTOR)))
    bindings.sk_ble_subscribe_gatt(
      ...putString(JSON.stringify({ ...DESCRIPTOR, mac: '11:22:33:44:55:66' }))
    )
    bindings.sk_ble_subscribe_advertisements()
    const handle = new FakeHandle()
    bleApi.subscriptions[0]!.resolve(handle)
    await flush()
    events.length = 0

    closeAllBleForPlugin(PLUGIN_ID)

    expect(handle.closed).to.equal(true)
    expect(bleApi.released).to.deep.equal([
      { mac: '11:22:33:44:55:66', pluginId: PLUGIN_ID }
    ])
    expect(bleApi.advertisementCallback).to.equal(undefined)
    bleApi.subscriptions[0]!.notify(CHAR, Buffer.from([1]))
    expect(events).to.deep.equal([])
  })
})

describe('WASM string handler exports', () => {
  it('passes a UTF-8 buffer to Rust library plugins', () => {
    const memory = new WebAssembly.Memory({ initial: 1 })
    const received: string[] = []
    const freed: number[][] = []
    const rawExports = {
      memory,
      allocate: () => SCRATCH_OFFSET,
      deallocate: (ptr: number, len: number) => freed.push([ptr, len]),
      ble_handler: (ptr: number, len: number) =>
        received.push(
          new TextDecoder().decode(new Uint8Array(memory.buffer, ptr, len))
        )
    }
    const handler = wrapStringHandlerExport(
      rawExports,
      'ble_handler',
      false,
      true
    )
    handler!('{"type":"notify","data":"ä"}')
    expect(received).to.deep.equal(['{"type":"notify","data":"ä"}'])
    expect(freed).to.deep.equal([[SCRATCH_OFFSET, 29]])
  })

  it('passes a managed string to AssemblyScript plugins', () => {
    const received: number[] = []
    const rawExports = {
      __newString: (value: string) => value.length,
      ble_handler: (ptr: number) => received.push(ptr)
    }
    wrapStringHandlerExport(rawExports, 'ble_handler', true, false)!('abc')
    expect(received).to.deep.equal([3])
  })

  it('is absent when the plugin lacks the export', () => {
    expect(wrapStringHandlerExport({}, 'ble_handler', false, true)).to.equal(
      undefined
    )
  })
})

describe('WASM BLE plugin lifecycle', () => {
  afterEach(() => {
    closeAllBleForPlugin(PLUGIN_ID)
    wasmPlugins.delete(PLUGIN_ID)
  })

  function registerPlugin(bleApi: FakeBleApi, stop: () => number = () => 0) {
    const memory = new WebAssembly.Memory({ initial: 1 })
    const memoryRef = { current: memory }
    const bindings = createBleBindings(
      PACKAGE_NAME,
      { bluetooth: true },
      { bleApi: bleApi.asBleApi() },
      createUtf8Reader(memoryRef),
      createBinaryDataReader(memoryRef)
    )
    const descriptorBytes = new TextEncoder().encode(JSON.stringify(DESCRIPTOR))
    new Uint8Array(memory.buffer).set(descriptorBytes, SCRATCH_OFFSET)

    const received: WasmBleEvent[] = []
    const instance = {
      exports: {
        id: () => PLUGIN_ID,
        name: () => 'Calypso',
        schema: () => '{}',
        start: () =>
          bindings.sk_ble_subscribe_gatt(
            SCRATCH_OFFSET,
            descriptorBytes.length
          ) > 0
            ? 0
            : 1,
        stop,
        ble_handler: (json: string) => received.push(JSON.parse(json))
      }
    } as unknown as WasmPluginInstance
    const plugin = {
      id: PLUGIN_ID,
      packageName: PACKAGE_NAME,
      status: 'stopped',
      configuration: {},
      instance
    } as unknown as WasmPlugin
    wasmPlugins.set(PLUGIN_ID, plugin)
    return { plugin, received }
  }

  it('routes events to ble_handler while running and cleans up on stop', async () => {
    const bleApi = new FakeBleApi()
    const { plugin, received } = registerPlugin(bleApi)

    await startWasmPlugin({}, PLUGIN_ID)
    expect(plugin.status).to.equal('running')

    const handle = new FakeHandle()
    bleApi.subscriptions[0]!.resolve(handle)
    await flush()
    bleApi.subscriptions[0]!.notify(CHAR, Buffer.from([0x42]))
    expect(received).to.have.length(2)
    expect(received[1]).to.include({ type: 'notify', data: '42' })

    await stopWasmPlugin(PLUGIN_ID)
    expect(handle.closed).to.equal(true)
    bleApi.subscriptions[0]!.notify(CHAR, Buffer.from([0x43]))
    expect(received).to.have.length(2)
  })

  it('delivers events raised during start once start returns', async () => {
    const bleApi = new FakeBleApi()
    bleApi.rejectWith = new Error('device not visible')
    const { received } = registerPlugin(bleApi)

    await startWasmPlugin({}, PLUGIN_ID)

    expect(received).to.have.length(1)
    expect(received[0]).to.include({
      type: 'error',
      message: 'device not visible'
    })
  })

  it('releases BLE subscriptions when stop() throws', async () => {
    const bleApi = new FakeBleApi()
    registerPlugin(bleApi, () => {
      throw new Error('stop failed')
    })
    await startWasmPlugin({}, PLUGIN_ID)
    const handle = new FakeHandle()
    bleApi.subscriptions[0]!.resolve(handle)
    await flush()

    let stopError: unknown
    try {
      await stopWasmPlugin(PLUGIN_ID)
    } catch (error) {
      stopError = error
    }
    expect(stopError).to.be.instanceOf(Error)
    expect(handle.closed).to.equal(true)
  })
})
