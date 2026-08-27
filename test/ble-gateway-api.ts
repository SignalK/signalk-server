import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'

// AD structure: [length][type][data...], hex-encoded
const ad = (type: number, dataHex: string) => {
  const len = dataHex.length / 2 + 1
  return (
    len.toString(16).padStart(2, '0') +
    type.toString(16).padStart(2, '0') +
    dataHex
  )
}

const utf8Hex = (s: string) => Buffer.from(s, 'utf8').toString('hex')

const MAC = 'AA:BB:CC:DD:EE:FF'

describe('BLE gateway HTTP API', function () {
  let post: Awaited<ReturnType<typeof startServer>>['post']
  let get: Awaited<ReturnType<typeof startServer>>['get']
  let stop: Awaited<ReturnType<typeof startServer>>['stop']

  before(async function () {
    // Server boot can be slow on loaded dev machines
    this.timeout(60000)
    ;({ post, get, stop } = await startServer())
  })

  after(async () => {
    await stop()
  })

  it('merges a posted advertisement batch into the device table', async () => {
    const postRes = await post('/ble/gateway/advertisements', {
      gateway_id: 'test-gw',
      devices: [
        {
          mac: MAC,
          rssi: -61,
          // Manufacturer data in the advertisement...
          adv_data: ad(0xff, '9904' + 'deadbeef'),
          // ...name only in the scan response, as real sensors do
          scan_rsp_data: ad(0x09, utf8Hex('RuuviTag')),
          address_type: 'random',
          connectable: true
        }
      ]
    })
    expect(postRes.status).to.equal(200)

    const devices = await get('/vessels/self/ble/devices').then((r) => r.json())
    expect(devices).to.have.length(1)
    const device = devices[0]
    expect(device.mac).to.equal(MAC)
    expect(device.name).to.equal('RuuviTag')
    expect(device.addressType).to.equal('random')
    expect(device.rssi).to.equal(-61)
    expect(device.connectable).to.equal(true)
    expect(device.seenBy).to.have.length(1)
    expect(device.seenBy[0].providerId).to.equal('ble:gateway:test-gw')

    const gateways = await get('/ble/gateways').then((r) => r.json())
    expect(gateways).to.have.length(1)
    expect(gateways[0].gatewayId).to.equal('test-gw')
    expect(gateways[0].online).to.equal(true)
    expect(gateways[0].deviceCount).to.equal(1)
  })

  it('rejects a batch with an invalid device MAC', async () => {
    const res = await post('/ble/gateway/advertisements', {
      gateway_id: 'test-gw',
      devices: [{ mac: 'not-a-mac', rssi: -60 }]
    })
    expect(res.status).to.equal(400)
  })

  it('rejects an unknown address_type', async () => {
    const res = await post('/ble/gateway/advertisements', {
      gateway_id: 'test-gw',
      devices: [{ mac: MAC, rssi: -60, address_type: 'static' }]
    })
    expect(res.status).to.equal(400)
  })
})
