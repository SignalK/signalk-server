import { describe, expect, it } from 'vitest'
import { offersCreateDevice } from './ydwgCreateDevice'

describe('offersCreateDevice', () => {
  it('offers createDevice on the canboatjs YDWG connections only', () => {
    expect(offersCreateDevice('ydwg02-canboatjs')).toBe(true)
    expect(offersCreateDevice('ydwg02-udp-canboatjs')).toBe(true)
    expect(offersCreateDevice('ydwg02-usb-canboatjs')).toBe(true)
    expect(offersCreateDevice('ydwg02-wasm')).toBe(false)
    expect(offersCreateDevice('ngt-1-canboatjs')).toBe(false)
  })
})
