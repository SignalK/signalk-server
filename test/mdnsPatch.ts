import { expect } from 'chai'

type LoadFn = (
  request: string,
  parent: NodeModule | null,
  isMain: boolean
) => unknown

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('node:module') as typeof import('node:module') & {
  _load: LoadFn
}

const helperModulePath = require.resolve('../dist/mdnsPatch.js')
const networkInterfaceRequest = '@astronautlabs/mdns/dist/NetworkInterface'

describe('patchAstronautLabsMdns', () => {
  const originalLoad = Module._load

  afterEach(() => {
    Module._load = originalLoad
    delete require.cache[helperModulePath]
  })

  function loadPatchedHelper(bindSocket: () => Promise<unknown>) {
    class FakeNetworkInterface {}

    ;(
      FakeNetworkInterface.prototype as { _bindSocket: typeof bindSocket }
    )._bindSocket = bindSocket

    Module._load = ((request, parent, isMain) => {
      if (request === networkInterfaceRequest) {
        return { NetworkInterface: FakeNetworkInterface }
      }

      return originalLoad(request, parent, isMain)
    }) as LoadFn

    delete require.cache[helperModulePath]

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { patchAstronautLabsMdns } = require('../dist/mdnsPatch.js') as {
      patchAstronautLabsMdns: () => void
    }

    patchAstronautLabsMdns()

    return FakeNetworkInterface
  }

  it('suppresses @astronautlabs/mdns EADDRINUSE membership noise', async () => {
    const logged: unknown[][] = []
    const originalConsoleError = console.error

    console.error = (...args: unknown[]) => {
      logged.push(args)
    }

    try {
      const ignoredError = new Error(
        'addMembership EADDRINUSE'
      ) as NodeJS.ErrnoException
      ignoredError.code = 'EADDRINUSE'

      const FakeNetworkInterface = loadPatchedHelper(async () => {
        console.error(
          'Fatal error: Could not add membership to interface 192.168.0.148',
          ignoredError
        )
        console.error('should still be logged')
      })

      await (
        FakeNetworkInterface.prototype as {
          _bindSocket: () => Promise<unknown>
        }
      )._bindSocket()

      expect(logged).to.have.length(1)
      expect(logged[0][0]).to.equal('should still be logged')
    } finally {
      console.error = originalConsoleError
    }
  })

  it('leaves other membership errors visible', async () => {
    const logged: unknown[][] = []
    const originalConsoleError = console.error

    console.error = (...args: unknown[]) => {
      logged.push(args)
    }

    try {
      const visibleError = new Error(
        'addMembership EACCES'
      ) as NodeJS.ErrnoException
      visibleError.code = 'EACCES'

      const FakeNetworkInterface = loadPatchedHelper(async () => {
        console.error(
          'Fatal error: Could not add membership to interface 192.168.0.148',
          visibleError
        )
      })

      await (
        FakeNetworkInterface.prototype as {
          _bindSocket: () => Promise<unknown>
        }
      )._bindSocket()

      expect(logged).to.have.length(1)
      expect(logged[0][0]).to.equal(
        'Fatal error: Could not add membership to interface 192.168.0.148'
      )
      expect(logged[0][1]).to.equal(visibleError)
    } finally {
      console.error = originalConsoleError
    }
  })
})
