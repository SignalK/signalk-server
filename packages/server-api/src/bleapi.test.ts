import { expect } from 'chai'
import { isBLEProvider } from './bleapi'

const validMethods = {
  startDiscovery: async () => {},
  stopDiscovery: async () => {},
  getDevices: async () => [],
  onAdvertisement: () => () => {},
  supportsGATT: () => true,
  availableGATTSlots: () => 1,
  subscribeGATT: async () => ({}) as never
}

describe('isBLEProvider', () => {
  it('accepts a fully valid provider', () => {
    expect(isBLEProvider({ name: 'p', methods: validMethods })).to.equal(true)
  })

  it('rejects non-objects and near misses', () => {
    expect(isBLEProvider(null)).to.equal(false)
    expect(isBLEProvider(undefined)).to.equal(false)
    expect(isBLEProvider('provider')).to.equal(false)
    expect(isBLEProvider({})).to.equal(false)
    expect(isBLEProvider({ name: 'p' })).to.equal(false)
    expect(isBLEProvider({ name: 42, methods: validMethods })).to.equal(false)
  })

  const requiredMethods = [
    'startDiscovery',
    'stopDiscovery',
    'getDevices',
    'onAdvertisement',
    'supportsGATT',
    'availableGATTSlots',
    'subscribeGATT'
  ] as const

  requiredMethods.forEach((method) => {
    it(`rejects a provider missing ${method}`, () => {
      const methods: Record<string, unknown> = { ...validMethods }
      delete methods[method]
      expect(isBLEProvider({ name: 'p', methods })).to.equal(false)
    })
  })

  it('accepts optional methods being absent', () => {
    // totalGATTSlots and connectGATT are optional in BLEProviderMethods
    expect(
      isBLEProvider({
        name: 'p',
        methods: { ...validMethods, totalGATTSlots: undefined }
      })
    ).to.equal(true)
  })
})
