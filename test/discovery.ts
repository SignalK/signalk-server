import { expect } from 'chai'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'

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

const require = createRequire(import.meta.url)
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

    global.setTimeout = ((...args: unknown[]) => {
      const callback = args[0]

      if (typeof callback === 'function') {
        scheduledCallbacks.push(callback)
      }

      return 0 as ReturnType<typeof setTimeout>
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
})
