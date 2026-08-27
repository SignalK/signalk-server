import { expect } from 'chai'
import { parseAdvData } from '../src/api/ble/remoteProvider'

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

describe('parseAdvData', () => {
  it('parses manufacturer data with the company id stripped', () => {
    // Company 0x0499 (Ruuvi, little-endian 9904) + payload
    const parsed = parseAdvData(ad(0xff, '9904' + 'deadbeef'))
    expect(parsed.manufacturerData).to.deep.equal({ 0x0499: 'deadbeef' })
  })

  it('parses 16-bit service data with an expanded UUID', () => {
    // Service 0x181A (Environmental Sensing, little-endian 1a18)
    const parsed = parseAdvData(ad(0x16, '1a18' + 'cafe'))
    expect(parsed.serviceData).to.deep.equal({
      '0000181a-0000-1000-8000-00805f9b34fb': 'cafe'
    })
  })

  it('parses the complete local name, preferring it over a shortened one', () => {
    const shortened = ad(0x08, utf8Hex('Ruu'))
    const complete = ad(0x09, utf8Hex('RuuviTag'))
    expect(parseAdvData(shortened).name).to.equal('Ruu')
    expect(parseAdvData(shortened + complete).name).to.equal('RuuviTag')
    expect(parseAdvData(complete + shortened).name).to.equal('RuuviTag')
  })

  it('parses tx power as a signed byte', () => {
    expect(parseAdvData(ad(0x0a, 'fc')).txPower).to.equal(-4)
  })

  it('stops at a truncated structure without throwing', () => {
    // Length byte claims 10 bytes but the payload ends early
    const parsed = parseAdvData('0aff9904')
    expect(parsed.manufacturerData).to.equal(undefined)
  })
})
