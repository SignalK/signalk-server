import { describe, expect, it } from 'vitest'
import { logsN2kSource, offersCreateDevice } from './providerSourceTypes'

describe('offersCreateDevice', () => {
  it('offers createDevice on the canboatjs YDWG connections only', () => {
    expect(offersCreateDevice('ydwg02-canboatjs')).toBe(true)
    expect(offersCreateDevice('ydwg02-udp-canboatjs')).toBe(true)
    expect(offersCreateDevice('ydwg02-usb-canboatjs')).toBe(true)
    expect(offersCreateDevice('ydwg02-wasm')).toBe(false)
    expect(offersCreateDevice('ngt-1-canboatjs')).toBe(false)
  })
})

describe('logsN2kSource', () => {
  it('refuses logging for the wasm binary-framing sources only', () => {
    expect(logsN2kSource('ngt-1-wasm')).toBe(false)
    expect(logsN2kSource('maretron-ipg-wasm')).toBe(false)
    expect(logsN2kSource('w2k-1-n2k-actisense-wasm')).toBe(false)
    expect(logsN2kSource('canbus-wasm')).toBe(true)
    expect(logsN2kSource('ngt-1-canboatjs')).toBe(true)
  })
})
