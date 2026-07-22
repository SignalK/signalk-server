import { expect } from 'chai'
import { EventEmitter } from 'node:events'

type LoadFn = (
  request: string,
  parent: NodeModule | null,
  isMain: boolean
) => unknown

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('node:module') as typeof import('node:module') & {
  _load: LoadFn
}

const mdnsModulePath = require.resolve('../dist/mdns.js')

class FakeAdvertisement extends EventEmitter {
  static instances: FakeAdvertisement[] = []

  readonly serviceType: string

  constructor(serviceType: string) {
    super()
    this.serviceType = serviceType
    FakeAdvertisement.instances.push(this)
  }

  start() {
    return this
  }

  stop() {
    return this
  }
}

type App = {
  config: {
    settings: Record<string, unknown>
    name: string
    version: string
    getExternalHostname: () => string
    isExternalSsl: () => boolean
  }
  selfId: string
  interfaces: Record<string, unknown>
}

describe('mdnsResponder', () => {
  const originalLoad = Module._load
  let debugMessages: string[]

  afterEach(() => {
    Module._load = originalLoad
    FakeAdvertisement.instances = []
    delete require.cache[mdnsModulePath]
  })

  function loadResponder(): (app: App) => unknown {
    debugMessages = []

    Module._load = ((request, parent, isMain) => {
      if (request === '@astronautlabs/mdns') {
        return { Advertisement: FakeAdvertisement }
      }
      if (request === './mdnsPatch') {
        return { patchAstronautLabsMdns: () => {} }
      }
      if (request === './ports') {
        return { getExternalPort: () => 3000 }
      }
      if (request === './debug') {
        return {
          createDebug: () => {
            const debug = (message: unknown) => {
              if (typeof message === 'string') {
                debugMessages.push(message)
              }
            }
            debug.enabled = true
            return debug
          }
        }
      }
      if (request === 'os') {
        return { hostname: () => 'testhost' }
      }
      return originalLoad(request, parent, isMain)
    }) as LoadFn

    delete require.cache[mdnsModulePath]

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../dist/mdns.js') as (app: App) => unknown
  }

  function makeApp(): App {
    return {
      config: {
        settings: {},
        name: 'signalk-server',
        version: '2.0.0',
        getExternalHostname: () => 'testhost',
        isExternalSsl: () => false
      },
      selfId: 'urn:mrn:signalk:uuid:test',
      interfaces: {}
    }
  }

  it('logs advertisement errors at debug level, not to the console', () => {
    const logged: unknown[][] = []
    const originalConsoleError = console.error
    const originalConsoleLog = console.log

    console.error = (...args: unknown[]) => {
      logged.push(args)
    }
    console.log = (...args: unknown[]) => {
      logged.push(args)
    }

    try {
      const mdnsResponder = loadResponder()
      mdnsResponder(makeApp())

      expect(FakeAdvertisement.instances).to.have.length(1)

      FakeAdvertisement.instances[0].emit(
        'error',
        new Error('Timed out getting default route')
      )

      expect(logged).to.have.length(0)
      expect(
        debugMessages.some(
          (message) =>
            message.includes('_http._tcp') &&
            message.includes('Timed out getting default route')
        )
      ).to.equal(true)
    } finally {
      console.error = originalConsoleError
      console.log = originalConsoleLog
    }
  })
})
