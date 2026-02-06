import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type MockSocket = {
  handlers: Record<string, (buffer: Buffer) => void>
  on: (event: string, cb: (buffer: Buffer) => void) => void
  bind: (port: number, cb?: () => void) => void
  addMembership: (_ip: string) => void
  close: () => void
  boundPort?: number
}

type MockBrowser = {
  handlers: Record<string, () => void>
  on: (event: string, cb: () => void) => void
  discover: () => void
  stop: () => void
}

const loadDiscovery = (mocks: {
  dgram: { createSocket: () => MockSocket }
  mdns: {
    tcp: (name: string) => { name: string }
    excludeInterface: (_ip: string) => void
    createBrowser: (_service: { name: string }) => MockBrowser
  }
  canboatjs: { discover?: (_app: unknown) => void }
  os: { networkInterfaces: () => Record<string, unknown> }
}) => {
  const discoveryPath = require.resolve('../../src/discovery')
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

  mockModule('dgram', mocks.dgram)
  mockModule('mdns-js', mocks.mdns)
  mockModule('@canboat/canboatjs', mocks.canboatjs)
  mockModule('os', mocks.os)

  delete require.cache[discoveryPath]
  const discovery = require(discoveryPath)

  return {
    discovery,
    restore: () => {
      delete require.cache[discoveryPath]
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

describe('discovery', () => {
  let originalSetTimeout: typeof setTimeout

  beforeEach(() => {
    originalSetTimeout = global.setTimeout
    global.setTimeout = ((fn: () => void) => {
      // Defer timeouts so we can control when they fire.
      return originalSetTimeout(fn, 0)
    }) as typeof setTimeout
  })

  afterEach(() => {
    global.setTimeout = originalSetTimeout
  })

  it('discovers WLN10 via UDP broadcast', () => {
    const sockets: MockSocket[] = []
    const dgram = {
      createSocket: () => {
        const socket: MockSocket = {
          handlers: {},
          on: (event, cb) => {
            socket.handlers[event] = cb
          },
          bind: (port, cb) => {
            socket.boundPort = port
            if (cb) {
              cb()
            }
          },
          addMembership: () => {},
          close: () => {}
        }
        socket.handlers = {}
        sockets.push(socket)
        return socket
      }
    }

    const browsers: MockBrowser[] = []
    const mdns = {
      tcp: (name: string) => ({ name }),
      excludeInterface: () => {},
      createBrowser: () => {
        const browser: MockBrowser = {
          handlers: {},
          on: (event, cb) => {
            browser.handlers[event] = cb
          },
          discover: () => {},
          stop: () => {}
        }
        browsers.push(browser)
        return browser
      }
    }

    const events: Array<{ event: string; payload: unknown }> = []
    const app = {
      config: {
        settings: {
          pipedProviders: []
        }
      },
      emit: (event: string, payload: unknown) => {
        events.push({ event, payload })
      }
    }

    const { discovery, restore } = loadDiscovery({
      dgram,
      mdns,
      canboatjs: {},
      os: { networkInterfaces: () => ({}) }
    })
    try {
      discovery.runDiscovery(app)

      const wlnSocket = sockets.find((socket) => socket.boundPort === 2000)
      expect(wlnSocket).to.not.equal(undefined)
      wlnSocket?.handlers.message(Buffer.from('$GPGGA,1234'))

      const discovered = events.find((event) => event.event === 'discovered')
      expect(discovered).to.not.equal(undefined)
      expect((discovered?.payload as { id: string }).id).to.equal('WLN10')
    } finally {
      restore()
    }
  })

  it('discovers GoFree TCP service via UDP broadcast', () => {
    const sockets: MockSocket[] = []
    const dgram = {
      createSocket: () => {
        const socket: MockSocket = {
          handlers: {},
          on: (event, cb) => {
            socket.handlers[event] = cb
          },
          bind: (port, cb) => {
            socket.boundPort = port
            if (cb) {
              cb()
            }
          },
          addMembership: () => {},
          close: () => {}
        }
        socket.handlers = {}
        sockets.push(socket)
        return socket
      }
    }

    const mdns = {
      tcp: (name: string) => ({ name }),
      excludeInterface: () => {},
      createBrowser: () => ({
        handlers: {},
        on: () => {},
        discover: () => {},
        stop: () => {}
      })
    }

    const events: Array<{ event: string; payload: unknown }> = []
    const app = {
      config: {
        settings: {
          pipedProviders: []
        }
      },
      emit: (event: string, payload: unknown) => {
        events.push({ event, payload })
      }
    }

    const { discovery, restore } = loadDiscovery({
      dgram,
      mdns,
      canboatjs: {},
      os: { networkInterfaces: () => ({}) }
    })
    try {
      discovery.runDiscovery(app)

      const gofreeSocket = sockets.find((socket) => socket.boundPort === 2052)
      expect(gofreeSocket).to.not.equal(undefined)

      const message = {
        SerialNumber: '12345',
        Name: 'GoFree',
        IP: '10.1.1.1',
        Services: [
          {
            Service: 'nmea-0183',
            Port: 10110
          }
        ]
      }

      gofreeSocket?.handlers.message(Buffer.from(JSON.stringify(message)))

      const discovered = events.find((event) => event.event === 'discovered')
      expect(discovered).to.not.equal(undefined)
      expect((discovered?.payload as { id: string }).id).to.equal(
        'GoFree (12345)'
      )
    } finally {
      restore()
    }
  })

  it('discovers SignalK ws services via mdns', () => {
    const sockets: MockSocket[] = []
    const dgram = {
      createSocket: () => {
        const socket: MockSocket = {
          handlers: {},
          on: (event, cb) => {
            socket.handlers[event] = cb
          },
          bind: () => {},
          addMembership: () => {},
          close: () => {}
        }
        socket.handlers = {}
        sockets.push(socket)
        return socket
      }
    }

    const browsers: MockBrowser[] = []
    const mdns = {
      tcp: (name: string) => ({ name }),
      excludeInterface: () => {},
      createBrowser: () => {
        const browser: MockBrowser = {
          handlers: {},
          on: (event, cb) => {
            browser.handlers[event] = cb
          },
          discover: () => {},
          stop: () => {}
        }
        browsers.push(browser)
        return browser
      }
    }

    const events: Array<{ event: string; payload: unknown }> = []
    const app = {
      config: {
        settings: {
          pipedProviders: []
        }
      },
      emit: (event: string, payload: unknown) => {
        events.push({ event, payload })
      }
    }

    const { discovery, restore } = loadDiscovery({
      dgram,
      mdns,
      canboatjs: {},
      os: { networkInterfaces: () => ({}) }
    })
    try {
      discovery.runDiscovery(app)

      const wsBrowser = browsers[0]
      wsBrowser.handlers.ready?.()
      wsBrowser.handlers.update?.({
        addresses: ['10.2.2.2'],
        host: 'signalk.local',
        port: 3000,
        type: [{ name: 'signalk-ws' }]
      })

      const discovered = events.find((event) => event.event === 'discovered')
      expect(discovered).to.not.equal(undefined)
      expect((discovered?.payload as { id: string }).id).to.equal(
        'ws-signalk.local:3000'
      )
    } finally {
      restore()
    }
  })
})
