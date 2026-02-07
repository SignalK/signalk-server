import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type EnvImportOptions = {
  pluginId: string
  capabilities: Record<string, boolean>
  app?: {
    setPluginStatus?: (id: string, message: string) => void
    setPluginError?: (id: string, message: string) => void
    getSelfPath?: (path: string) => unknown
  }
  memoryRef: { current: WebAssembly.Memory | null }
  rawExports: { current: unknown }
  asLoaderInstance: { current: unknown }
}

const loadEnvImports = () => {
  const modulePath = require.resolve('../../src/wasm/bindings/env-imports')
  delete require.cache[modulePath]
  return require('../../src/wasm/bindings/env-imports') as {
    createEnvImports: (options: EnvImportOptions) => Record<string, unknown>
    createUtf8Reader: (memoryRef: {
      current: WebAssembly.Memory | null
    }) => (ptr: number, len: number) => string
  }
}

const writeUtf8 = (memory: WebAssembly.Memory, ptr: number, value: string) => {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(value)
  new Uint8Array(memory.buffer, ptr, bytes.length).set(bytes)
  return bytes.length
}

describe('wasm bindings', () => {
  it('reads utf8 strings from wasm memory', () => {
    const { createUtf8Reader } = loadEnvImports()
    const memory = new WebAssembly.Memory({ initial: 1 })
    const memoryRef = { current: memory }

    const len = writeUtf8(memory, 0, 'hello')
    const reader = createUtf8Reader(memoryRef)

    expect(reader(0, len)).to.equal('hello')
  })

  it('throws when memory is not initialized', () => {
    const { createUtf8Reader } = loadEnvImports()
    const reader = createUtf8Reader({ current: null })

    expect(() => reader(0, 1)).to.throw(
      'AssemblyScript module memory not initialized'
    )
  })

  it('writes status, error, and self path responses', () => {
    const { createEnvImports } = loadEnvImports()
    const memory = new WebAssembly.Memory({ initial: 1 })
    const memoryRef = { current: memory }
    const rawExports = { current: null }
    const asLoaderInstance = { current: null }

    let statusMessage = ''
    let errorMessage = ''
    const app = {
      setPluginStatus: (_id: string, message: string) => {
        statusMessage = message
      },
      setPluginError: (_id: string, message: string) => {
        errorMessage = message
      },
      getSelfPath: (path: string) => {
        if (path === 'navigation.speed') {
          return { value: 3 }
        }
        return undefined
      }
    }

    const env = createEnvImports({
      pluginId: 'plugin-1',
      capabilities: { network: false },
      app,
      memoryRef,
      rawExports,
      asLoaderInstance
    })

    const statusLen = writeUtf8(memory, 0, 'OK')
    env.sk_set_status(0, statusLen)

    const errorLen = writeUtf8(memory, 16, 'FAIL')
    env.sk_set_error(16, errorLen)

    const pathLen = writeUtf8(memory, 32, 'navigation.speed')
    const bufferPtr = 128
    const bytesWritten = env.sk_get_self_path(32, pathLen, bufferPtr, 64)

    const result = new TextDecoder('utf-8').decode(
      new Uint8Array(memory.buffer, bufferPtr, bytesWritten)
    )

    expect(statusMessage).to.equal('OK')
    expect(errorMessage).to.equal('FAIL')
    expect(JSON.parse(result)).to.deep.equal({ value: 3 })

    const missingPathLen = writeUtf8(memory, 64, 'navigation.missing')
    const missingBytes = env.sk_get_self_path(64, missingPathLen, 200, 64)
    expect(missingBytes).to.equal(0)
  })
})
