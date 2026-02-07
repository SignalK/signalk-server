import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type MockEntry = { id: string; previous?: NodeModule }

type LoaderExports = {
  instance: { exports: Record<string, unknown> }
  exports: Record<string, unknown>
}

type NormalizedExports = {
  id: () => string
  name: () => string
  schema: () => string
  start: (config: string) => number | Promise<number>
  stop: () => number
  memory?: WebAssembly.Memory
  delta_handler?: (deltaJson: string) => void
}

type RawExports = {
  memory: WebAssembly.Memory
  allocate?: (len: number) => number
  deallocate?: (ptr: number, len: number) => void
} & Record<string, unknown>

type AsExports = RawExports & {
  __new: (len: number) => number
  __free: () => void
  __getString: (ptr: number) => string
  __newString: (value: string) => number
}

const mockModule = (entries: MockEntry[], id: string, exports: unknown) => {
  const resolved = require.resolve(id)
  entries.push({ id: resolved, previous: require.cache[resolved] })
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports
  } as NodeModule
}

const loadStandardLoader = (
  overrides: { loaderExports?: LoaderExports } = {}
) => {
  const entries: MockEntry[] = []

  mockModule(entries, 'node:wasi', {
    WASI: class {
      getImportObject() {
        return {}
      }
      getImports() {
        return {}
      }
      start() {}
      initialize() {}
    }
  })

  mockModule(entries, '@assemblyscript/loader', {
    __esModule: true,
    default: {
      instantiate: async (_module: unknown, _imports: unknown) => {
        return (
          overrides.loaderExports || {
            instance: { exports: {} },
            exports: {}
          }
        )
      }
    }
  })

  mockModule(entries, '../../src/wasm/bindings/env-imports', {
    createEnvImports: () => ({})
  })
  mockModule(entries, '../../src/wasm/bindings/resource-provider', {
    updateResourceProviderInstance: () => undefined
  })
  mockModule(entries, '../../src/wasm/bindings/weather-provider', {
    updateWeatherProviderInstance: () => undefined
  })
  mockModule(entries, '../../src/wasm/bindings/radar-provider', {
    updateRadarProviderInstance: () => undefined
  })
  mockModule(entries, '../../src/wasm/utils/fetch-wrapper', {
    getNodeFetch: () => async () => ({ ok: true })
  })

  const modulePath = require.resolve('../../src/wasm/loaders/standard-loader')
  delete require.cache[modulePath]
  const standardLoader = require(modulePath) as {
    loadStandardPlugin: (...args: unknown[]) => Promise<unknown>
  }

  return {
    standardLoader,
    restore: () => {
      delete require.cache[modulePath]
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

const writeUtf8 = (memory: WebAssembly.Memory, ptr: number, value: string) => {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(value)
  new Uint8Array(memory.buffer, ptr, bytes.length).set(bytes)
  return bytes.length
}

const readUtf8 = (memory: WebAssembly.Memory, ptr: number, len: number) => {
  return new TextDecoder('utf-8').decode(
    new Uint8Array(memory.buffer, ptr, len)
  )
}

describe('wasm standard loader', () => {
  const originalCompile = WebAssembly.compile
  const originalInstantiate = WebAssembly.instantiate
  const originalImports = WebAssembly.Module.imports
  const originalExports = WebAssembly.Module.exports

  afterEach(() => {
    WebAssembly.compile = originalCompile
    WebAssembly.instantiate = originalInstantiate
    WebAssembly.Module.imports = originalImports
    WebAssembly.Module.exports = originalExports
  })

  it('rejects unknown plugin formats', async () => {
    const { standardLoader, restore } = loadStandardLoader()

    const fakeModule = { __exports: [], __imports: [] }
    WebAssembly.compile = async () =>
      fakeModule as unknown as WebAssembly.Module
    WebAssembly.Module.imports = (module) =>
      (module as typeof fakeModule)
        .__imports as WebAssembly.ModuleImportDescriptor[]
    WebAssembly.Module.exports = (module) =>
      (module as typeof fakeModule)
        .__exports as WebAssembly.ModuleExportDescriptor[]
    WebAssembly.instantiate = async () =>
      ({ exports: {} }) as WebAssembly.Instance

    try {
      await standardLoader.loadStandardPlugin(
        'plugin-1',
        '/tmp/plugin.wasm',
        Buffer.alloc(8),
        '/tmp',
        { network: false }
      )
      throw new Error('expected load to throw')
    } catch (error) {
      expect((error as Error).message).to.contain('Unknown WASM plugin format')
    } finally {
      restore()
    }
  })

  it('loads rust library plugins with buffer-based exports', async () => {
    const { standardLoader, restore } = loadStandardLoader()

    const fakeModule = {
      __exports: [{ name: 'plugin_id' }, { name: 'allocate' }],
      __imports: []
    }

    const memory = new WebAssembly.Memory({ initial: 1 })
    let lastConfig = ''
    const rawExports: RawExports = {
      memory,
      allocate: (_len: number) => 1,
      deallocate: () => undefined,
      plugin_id: (ptr: number, _max: number) => writeUtf8(memory, ptr, 'id'),
      plugin_name: (ptr: number, _max: number) =>
        writeUtf8(memory, ptr, 'name'),
      plugin_schema: (ptr: number, _max: number) =>
        writeUtf8(memory, ptr, '{"type":"object"}'),
      plugin_start: (ptr: number, len: number) => {
        lastConfig = readUtf8(memory, ptr, len)
        return 0
      },
      plugin_stop: () => 1
    }
    WebAssembly.compile = async () =>
      fakeModule as unknown as WebAssembly.Module
    WebAssembly.Module.imports = (module) =>
      (module as typeof fakeModule)
        .__imports as WebAssembly.ModuleImportDescriptor[]
    WebAssembly.Module.exports = (module) =>
      (module as typeof fakeModule)
        .__exports as WebAssembly.ModuleExportDescriptor[]
    WebAssembly.instantiate = async () =>
      ({ exports: rawExports }) as WebAssembly.Instance

    try {
      const pluginInstance = (await standardLoader.loadStandardPlugin(
        'plugin-1',
        '/tmp/plugin.wasm',
        Buffer.alloc(8),
        '/tmp',
        { network: false }
      )) as { exports: NormalizedExports }

      expect(pluginInstance.exports.id()).to.equal('id')
      expect(pluginInstance.exports.name()).to.equal('name')
      expect(pluginInstance.exports.schema()).to.equal('{"type":"object"}')
      expect(pluginInstance.exports.start('{"enabled":true}')).to.equal(0)
      expect(lastConfig).to.equal('{"enabled":true}')
      expect(pluginInstance.exports.stop()).to.equal(1)
      expect(pluginInstance.exports.memory).to.equal(memory)
    } finally {
      restore()
    }
  })

  it('loads AssemblyScript plugins with normalized exports', async () => {
    const memory = new WebAssembly.Memory({ initial: 1 })
    const strings = new Map<number, string>([
      [1, 'name'],
      [2, 'id'],
      [3, '{"type":"object"}']
    ])
    let lastDelta = ''
    let lastConfig = ''

    const asExports: AsExports = {
      memory,
      __new: (_len: number) => 32,
      __free: () => undefined,
      __getString: (ptr: number) => strings.get(ptr) || '',
      __newString: (value: string) => {
        lastDelta = value
        return 64
      },
      plugin_id: () => 2,
      plugin_name: () => 1,
      plugin_schema: () => 3,
      plugin_start: (ptr: number, len: number) => {
        lastConfig = readUtf8(memory, ptr, len)
        return 0
      },
      plugin_stop: () => 1,
      delta_handler: (_ptr: number) => undefined
    }

    const { standardLoader, restore } = loadStandardLoader({
      loaderExports: {
        instance: { exports: asExports },
        exports: asExports
      }
    })

    const fakeModule = {
      __exports: [{ name: 'plugin_name' }, { name: 'plugin_start' }],
      __imports: []
    }

    WebAssembly.compile = async () =>
      fakeModule as unknown as WebAssembly.Module
    WebAssembly.Module.imports = (module) =>
      (module as typeof fakeModule)
        .__imports as WebAssembly.ModuleImportDescriptor[]
    WebAssembly.Module.exports = (module) =>
      (module as typeof fakeModule)
        .__exports as WebAssembly.ModuleExportDescriptor[]
    WebAssembly.instantiate = async () =>
      ({ exports: asExports }) as WebAssembly.Instance

    try {
      const pluginInstance = (await standardLoader.loadStandardPlugin(
        'plugin-1',
        '/tmp/plugin.wasm',
        Buffer.alloc(8),
        '/tmp',
        { network: false }
      )) as { exports: NormalizedExports }

      expect(pluginInstance.exports.id()).to.equal('id')
      expect(pluginInstance.exports.name()).to.equal('name')
      expect(pluginInstance.exports.schema()).to.equal('{"type":"object"}')
      expect(await pluginInstance.exports.start('{"enabled":true}')).to.equal(0)
      expect(lastConfig).to.equal('{"enabled":true}')
      expect(pluginInstance.exports.stop()).to.equal(1)

      pluginInstance.exports.delta_handler('{"updates":[]}')
      expect(lastDelta).to.equal('{"updates":[]}')
    } finally {
      restore()
    }
  })

  it('loads rust command plugins and starts via WASI', async () => {
    let started = false
    const { standardLoader, restore } = loadStandardLoader()

    const fakeModule = {
      __exports: [{ name: '_start' }],
      __imports: []
    }

    WebAssembly.compile = async () =>
      fakeModule as unknown as WebAssembly.Module
    WebAssembly.Module.imports = (module) =>
      (module as typeof fakeModule)
        .__imports as WebAssembly.ModuleImportDescriptor[]
    WebAssembly.Module.exports = (module) =>
      (module as typeof fakeModule)
        .__exports as WebAssembly.ModuleExportDescriptor[]
    WebAssembly.instantiate = async () =>
      ({
        exports: {
          _start: () => {
            started = true
          },
          memory: new WebAssembly.Memory({ initial: 1 })
        }
      }) as WebAssembly.Instance

    try {
      await standardLoader.loadStandardPlugin(
        'plugin-1',
        '/tmp/plugin.wasm',
        Buffer.alloc(8),
        '/tmp',
        { network: false }
      )

      expect(started).to.equal(true)
    } finally {
      restore()
    }
  })
})
