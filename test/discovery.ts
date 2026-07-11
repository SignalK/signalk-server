import { expect } from 'chai'
import { EventEmitter } from 'node:events'

type LoadFn = (
  request: string,
  parent: NodeModule | null,
  isMain: boolean
) => unknown

type App = {
  config: {
    settings: {
      pipedProviders: unknown[]
    }
  }
  emit: (event: string, payload: unknown) => void
}

type DiscoveryModule = {
  runDiscovery: (app: App) => void
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('node:module') as typeof import('node:module') & {
  _load: LoadFn
}

const discoveryModulePath = require.resolve('../dist/discovery.js')

class FakeBrowser extends EventEmitter {
  static instances: FakeBrowser[] = []

  readonly serviceType: string
  stopCallCount = 0

  constructor(serviceType: string) {
    super()
    this.serviceType = serviceType
    FakeBrowser.instances.push(this)
  }

  start() {
    return this
  }

  stop() {
    this.stopCallCount += 1
    return this
  }

  fail(error: Error) {
    this.stop()
    this.emit('error', error)
  }
}

class FakeSocket {
  on(_event: string, _handler: (...args: unknown[]) => void) {
    return this
  }

  bind(...args: unknown[]) {
    const callback = args.find(
      (arg): arg is () => void => typeof arg === 'function'
    )

    callback?.()
    return this
  }

  addMembership(_address: string) {}

  close() {}
}

describe('runDiscovery', () => {
  const originalLoad = Module._load
  const originalSetTimeout = global.setTimeout

  afterEach(() => {
    Module._load = originalLoad
    global.setTimeout = originalSetTimeout
    FakeBrowser.instances = []
    delete require.cache[discoveryModulePath]
  })

  it('does not stop a browser twice after an internal error stop', () => {
    const scheduledCallbacks: Array<() => void> = []

    const makeFakeTimeoutHandle = (): ReturnType<typeof setTimeout> => {
      const handle = originalSetTimeout(() => {}, 0)
      clearTimeout(handle)
      return handle
    }

    global.setTimeout = ((...args: unknown[]) => {
      const callback = args[0]

      if (typeof callback === 'function') {
        scheduledCallbacks.push(callback as () => void)
      }

      return makeFakeTimeoutHandle()
    }) as unknown as typeof setTimeout

    Module._load = ((request, parent, isMain) => {
      if (request === '@astronautlabs/mdns') {
        return { Browser: FakeBrowser }
      }

      if (request === '@canboat/canboatjs') {
        return {}
      }

      if (request === 'dgram') {
        return {
          createSocket: () => new FakeSocket()
        }
      }

      if (request === 'os') {
        return {
          networkInterfaces: () => ({})
        }
      }

      if (request === './mdnsPatch') {
        return {
          patchAstronautLabsMdns: () => {}
        }
      }

      return originalLoad(request, parent, isMain)
    }) as LoadFn

    delete require.cache[discoveryModulePath]

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runDiscovery } = require('../dist/discovery.js') as DiscoveryModule

    const app: App = {
      config: {
        settings: {
          pipedProviders: []
        }
      },
      emit: () => {}
    }

    runDiscovery(app)

    expect(FakeBrowser.instances).to.have.length(2)

    const wsBrowser = FakeBrowser.instances.find(
      (browser) => browser.serviceType === '_signalk-ws._tcp'
    )
    const wssBrowser = FakeBrowser.instances.find(
      (browser) => browser.serviceType === '_signalk-wss._tcp'
    )

    expect(wsBrowser).to.not.equal(undefined)
    expect(wssBrowser).to.not.equal(undefined)

    wsBrowser?.fail(new Error('synthetic browser failure'))

    scheduledCallbacks.forEach((callback) => {
      callback()
    })

    expect(wsBrowser?.stopCallCount).to.equal(1)
    expect(wssBrowser?.stopCallCount).to.equal(1)
  })

  type DiscoveredPayload = {
    id: string
    pipeElements: Array<{
      options: {
        subOptions: { type: string; host: string; port: number }
      }
    }>
  }

  function runDiscoveryWith(interfaces: Record<string, unknown[]>): {
    wsBrowser: FakeBrowser
    discovered: DiscoveredPayload[]
  } {
    Module._load = ((request, parent, isMain) => {
      if (request === '@astronautlabs/mdns') return { Browser: FakeBrowser }
      if (request === '@canboat/canboatjs') return {}
      if (request === 'dgram') return { createSocket: () => new FakeSocket() }
      if (request === 'os') return { networkInterfaces: () => interfaces }
      if (request === './mdnsPatch') return { patchAstronautLabsMdns: () => {} }
      return originalLoad(request, parent, isMain)
    }) as LoadFn

    global.setTimeout = ((..._args: unknown[]) => {
      const handle = originalSetTimeout(() => {}, 0)
      clearTimeout(handle)
      return handle
    }) as unknown as typeof setTimeout

    delete require.cache[discoveryModulePath]

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runDiscovery } = require('../dist/discovery.js') as DiscoveryModule
    const discovered: DiscoveredPayload[] = []
    const app: App = {
      config: { settings: { pipedProviders: [] } },
      emit: (event, payload) => {
        if (event === 'discovered')
          discovered.push(payload as DiscoveredPayload)
      }
    }
    runDiscovery(app)
    const wsBrowser = FakeBrowser.instances.find(
      (b) => b.serviceType === '_signalk-ws._tcp'
    )
    expect(wsBrowser).to.not.equal(undefined)
    return { wsBrowser: wsBrowser as FakeBrowser, discovered }
  }

  const serviceUp = (browser: FakeBrowser, addresses: string[]) => {
    browser.emit('serviceUp', {
      addresses,
      host: 'remote.local',
      port: 3000,
      type: { name: 'signalk-ws' }
    })
  }

  describe('isOwnAddress filter', () => {
    it('suppresses an advertisement whose address matches a local IPv4', () => {
      const { wsBrowser, discovered } = runDiscoveryWith({
        eth0: [{ family: 'IPv4', internal: false, address: '192.168.1.50' }]
      })
      serviceUp(wsBrowser, ['192.168.1.50'])
      expect(discovered).to.have.length(0)
    })

    it('suppresses an advertisement on IPv4 loopback', () => {
      const { wsBrowser, discovered } = runDiscoveryWith({
        lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }]
      })
      serviceUp(wsBrowser, ['127.0.0.1'])
      expect(discovered).to.have.length(0)
    })

    it('suppresses an advertisement on IPv6 loopback', () => {
      const { wsBrowser, discovered } = runDiscoveryWith({
        lo: [{ family: 'IPv6', internal: true, address: '::1' }]
      })
      serviceUp(wsBrowser, ['::1'])
      expect(discovered).to.have.length(0)
    })

    it('suppresses an advertisement on link-local IPv6 with zone id', () => {
      const { wsBrowser, discovered } = runDiscoveryWith({
        eth0: [{ family: 'IPv6', internal: false, address: 'fe80::1' }]
      })
      serviceUp(wsBrowser, ['fe80::1%eth0'])
      expect(discovered).to.have.length(0)
    })

    it('suppresses when any address in the list is local', () => {
      const { wsBrowser, discovered } = runDiscoveryWith({
        eth0: [{ family: 'IPv4', internal: false, address: '192.168.1.50' }]
      })
      serviceUp(wsBrowser, ['10.0.0.5', '192.168.1.50'])
      expect(discovered).to.have.length(0)
    })

    it('emits an advertisement whose addresses are all remote', () => {
      const { wsBrowser, discovered } = runDiscoveryWith({
        eth0: [{ family: 'IPv4', internal: false, address: '192.168.1.50' }]
      })
      serviceUp(wsBrowser, ['192.168.1.99'])
      expect(discovered).to.have.length(1)
      expect(discovered[0].pipeElements[0].options.subOptions.host).to.equal(
        'remote.local'
      )
    })

    it('does not emit when the addresses list is empty or missing', () => {
      const { wsBrowser, discovered } = runDiscoveryWith({
        eth0: [{ family: 'IPv4', internal: false, address: '192.168.1.50' }]
      })
      serviceUp(wsBrowser, [])
      wsBrowser.emit('serviceUp', {
        host: 'remote.local',
        port: 3000,
        type: { name: 'signalk-ws' }
      })
      expect(discovered).to.have.length(0)
    })
  })
})
