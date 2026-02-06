import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type MockAdvertisement = {
  type: { name?: string }
  port: number
  options: Record<string, unknown>
  started: boolean
  stopped: boolean
  handlers: Record<string, (err: Error) => void>
  on: (event: string, cb: (err: Error) => void) => void
  start: () => void
  stop: () => void
}

type MockMdns = {
  tcp: (name: string) => { name: string }
  Advertisement: new (
    type: { name?: string },
    port: number,
    options: Record<string, unknown>
  ) => MockAdvertisement
}

const loadMdns = (mocks: {
  mdns: MockMdns
  dnssd2: Record<string, unknown>
  os: { hostname: () => string }
  ports: { getExternalPort: (_app: unknown) => number }
}) => {
  const mdnsPath = require.resolve('../../src/mdns')
  const entries: Array<{ id: string; previous?: NodeModule }> = []

  const mockModule = (id: string, exports: unknown) => {
    const resolved = require.resolve(id)
    entries.push({ id: resolved, previous: require.cache[resolved] })
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports
    } as NodeModule
  }

  const tryMockModule = (id: string, exports: unknown) => {
    try {
      mockModule(id, exports)
      return true
    } catch {
      return false
    }
  }

  tryMockModule('mdns', mocks.mdns)
  mockModule('dnssd2', mocks.dnssd2)
  mockModule('os', mocks.os)
  mockModule('../../src/ports', mocks.ports)

  delete require.cache[mdnsPath]
  const mdnsResponder = require(mdnsPath)

  return {
    mdnsResponder,
    restore: () => {
      delete require.cache[mdnsPath]
      entries.forEach(({ id, previous }) => {
        if (previous) {
          require.cache[id] = previous
        } else {
          delete require.cache[id]
        }
      })
    }
  }
}

describe('mdns', () => {
  it('returns early when mdns is disabled', () => {
    const ads: MockAdvertisement[] = []
    const mdns: MockMdns = {
      tcp: (name) => ({ name }),
      Advertisement: class Advertisement {
        type: { name?: string }
        port: number
        options: Record<string, unknown>
        started = false
        stopped = false
        handlers: Record<string, (err: Error) => void> = {}

        constructor(type, port, options) {
          this.type = type
          this.port = port
          this.options = options
          ads.push(this)
        }

        on(event: string, cb: (err: Error) => void) {
          this.handlers[event] = cb
        }

        start() {
          this.started = true
        }

        stop() {
          this.stopped = true
        }
      }
    }

    const { mdnsResponder, restore } = loadMdns({
      mdns,
      dnssd2: mdns,
      os: { hostname: () => 'host' },
      ports: { getExternalPort: () => 3000 }
    })

    try {
      const app = {
        selfId: 'self',
        config: {
          settings: { mdns: false, ssl: false },
          name: 'SignalK',
          version: '1.0.0',
          vesselName: 'Vessel',
          vesselMMSI: '123',
          vesselUUID: 'uuid',
          getExternalHostname: () => 'host'
        },
        interfaces: {}
      }

      const responder = mdnsResponder(app)
      expect(responder).to.equal(undefined)
      expect(ads).to.have.length(0)
    } finally {
      restore()
    }
  })

  it('advertises http and custom tcp services', () => {
    const ads: MockAdvertisement[] = []
    const mdns: MockMdns = {
      tcp: (name) => ({ name }),
      Advertisement: class Advertisement {
        type: { name?: string }
        port: number
        options: Record<string, unknown>
        started = false
        stopped = false
        handlers: Record<string, (err: Error) => void> = {}

        constructor(type, port, options) {
          this.type = type
          this.port = port
          this.options = options
          ads.push(this)
        }

        on(event: string, cb: (err: Error) => void) {
          this.handlers[event] = cb
        }

        start() {
          this.started = true
        }

        stop() {
          this.stopped = true
        }
      }
    }

    const { mdnsResponder, restore } = loadMdns({
      mdns,
      dnssd2: mdns,
      os: { hostname: () => 'internal-host' },
      ports: { getExternalPort: () => 3000 }
    })

    try {
      const app = {
        selfId: 'self',
        config: {
          settings: { mdns: true, ssl: false },
          name: 'SignalK',
          version: '1.0.0',
          vesselName: 'Vessel',
          vesselMMSI: '123',
          vesselUUID: 'uuid',
          getExternalHostname: () => 'external-host'
        },
        interfaces: {
          nmea: {
            mdns: {
              type: 'tcp',
              name: '_nmea-0183',
              port: 10110
            }
          },
          invalidType: {
            mdns: {
              type: 'udp',
              name: '_bad',
              port: 1111
            }
          },
          invalidName: {
            mdns: {
              type: 'tcp',
              name: 'badname',
              port: 1112
            }
          }
        }
      }

      const responder = mdnsResponder(app)
      expect(responder).to.exist
      expect(ads).to.have.length(2)
      expect(ads[0].started).to.equal(true)
      expect(ads[1].started).to.equal(true)

      const ports = ads.map((ad) => ad.port).sort()
      expect(ports).to.deep.equal([10110, 3000])

      const names = ads.map((ad) => ad.type.name).sort()
      expect(names).to.deep.equal(['_nmea-0183', 'http'])

      const options = ads[0].options
      expect(options.txtRecord).to.have.property('swname', 'SignalK')
      expect(options.txtRecord).to.have.property('swvers', '1.0.0')
      expect(options.txtRecord).to.have.property('roles', 'master, main')
      expect(options.txtRecord).to.have.property('self', 'self')
      expect(options.host).to.equal('external-host')

      responder.stop()
      expect(ads.every((ad) => ad.stopped)).to.equal(true)
    } finally {
      restore()
    }
  })
})
