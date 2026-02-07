import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type UnknownRecord = Record<string, unknown>
type ProviderMethods = Record<string, (...args: unknown[]) => unknown>
type ProviderRegistration = {
  pluginId: string
  provider: { type?: string; methods: ProviderMethods }
}
type AsExports = {
  __newString: () => number
  __getString: (ptr: number) => string
} & Record<string, () => number>
type AsLoader = { exports: AsExports }
type RustExports = {
  memory: WebAssembly.Memory
  allocate: (size: number) => number
  deallocate: () => void
} & Record<string, unknown>
type PluginInstance = {
  pluginId: string
  asLoader?: AsLoader
  instance?: { exports: RustExports | Record<string, unknown> }
  setAsyncifyResume?: (cb: (() => unknown) | null) => void
}

const resourceModule = require('../../src/wasm/bindings/resource-provider') as {
  wasmResourceProviders: Map<string, UnknownRecord>
  callWasmResourceHandler: (
    pluginInstance: PluginInstance,
    handlerName: string,
    requestJson: string
  ) => string | null
  createResourceProviderBinding: (
    pluginId: string,
    capabilities: { resourceProvider?: boolean },
    app: UnknownRecord,
    readUtf8String: (ptr: number, len: number) => string
  ) => (typePtr: number, typeLen: number) => number
  updateResourceProviderInstance: (
    pluginId: string,
    pluginInstance: PluginInstance
  ) => void
  cleanupResourceProviders: (pluginId: string, app?: UnknownRecord) => void
}

const weatherModule = require('../../src/wasm/bindings/weather-provider') as {
  wasmWeatherProviders: Map<string, UnknownRecord>
  callWasmWeatherHandler: (
    pluginInstance: PluginInstance,
    handlerName: string,
    requestJson: string
  ) => Promise<string | null>
  createWeatherProviderBinding: (
    pluginId: string,
    capabilities: { weatherProvider?: boolean },
    app: UnknownRecord,
    readUtf8String: (ptr: number, len: number) => string
  ) => (namePtr: number, nameLen: number) => number
  updateWeatherProviderInstance: (
    pluginId: string,
    pluginInstance: PluginInstance
  ) => void
  cleanupWeatherProviders: (pluginId: string, app?: UnknownRecord) => void
}

const radarModule = require('../../src/wasm/bindings/radar-provider') as {
  wasmRadarProviders: Map<string, UnknownRecord>
  callWasmRadarHandler: (
    pluginInstance: PluginInstance,
    handlerName: string,
    requestJson: string
  ) => Promise<string | null>
  createRadarProviderBinding: (
    pluginId: string,
    capabilities: { radarProvider?: boolean },
    app: UnknownRecord,
    readUtf8String: (ptr: number, len: number) => string
  ) => (namePtr: number, nameLen: number) => number
  updateRadarProviderInstance: (
    pluginId: string,
    pluginInstance: PluginInstance
  ) => void
  cleanupRadarProviders: (pluginId: string, app?: UnknownRecord) => void
  createRadarEmitSpokesBinding: (
    pluginId: string,
    capabilities: { radarProvider?: boolean },
    app: UnknownRecord,
    readUtf8String: (ptr: number, len: number) => string,
    readBinaryData: (ptr: number, len: number) => Buffer
  ) => (
    radarIdPtr: number,
    radarIdLen: number,
    spokeDataPtr: number,
    spokeDataLen: number
  ) => number
}

const createRawExports = (
  responseJson: string,
  handlerName: string,
  options: { noRequest?: boolean } = {}
) => {
  const memory = new WebAssembly.Memory({ initial: 1 })
  let offset = 16

  const allocate = (size: number) => {
    const max = memory.buffer.byteLength
    if (offset + size > max) {
      offset = 0
    }
    const ptr = offset
    offset += size
    return ptr
  }

  const deallocate = () => undefined

  const writeResponse = (responsePtr: number) => {
    const responseBytes = Buffer.from(responseJson, 'utf8')
    const memView = new Uint8Array(memory.buffer)
    memView.set(responseBytes, responsePtr)
    return responseBytes.length
  }

  const handler = options.noRequest
    ? (responsePtr: number, _responseMaxLen: number) =>
        writeResponse(responsePtr)
    : (
        _requestPtr: number,
        _requestLen: number,
        responsePtr: number,
        _responseMaxLen: number
      ) => writeResponse(responsePtr)

  return {
    memory,
    allocate,
    deallocate,
    [handlerName]: handler
  }
}

const createSharedRustExports = (
  responses: Record<string, string>,
  options: { noRequestHandlers?: Set<string> } = {}
) => {
  const memory = new WebAssembly.Memory({ initial: 2 })
  let offset = 32

  const allocate = (size: number) => {
    const ptr = offset
    offset += size
    return ptr
  }

  const deallocate = () => undefined

  const writeResponse = (responsePtr: number, responseJson: string) => {
    const responseBytes = Buffer.from(responseJson, 'utf8')
    const memView = new Uint8Array(memory.buffer)
    memView.set(responseBytes, responsePtr)
    return responseBytes.length
  }

  const exports: RustExports = { memory, allocate, deallocate }
  const noRequestHandlers = options.noRequestHandlers || new Set()

  Object.entries(responses).forEach(([handlerName, responseJson]) => {
    exports[handlerName] = noRequestHandlers.has(handlerName)
      ? (responsePtr: number, _responseMaxLen: number) =>
          writeResponse(responsePtr, responseJson)
      : (
          _requestPtr: number,
          _requestLen: number,
          responsePtr: number,
          _responseMaxLen: number
        ) => writeResponse(responsePtr, responseJson)
  })

  return exports
}

const createAsLoader = (responses: Record<string, string>) => {
  let nextPtr = 1
  const store = new Map<number, string>()

  const exports: AsExports = {
    __newString: () => 0,
    __getString: (ptr: number) => store.get(ptr) || ''
  }

  Object.entries(responses).forEach(([handlerName, responseJson]) => {
    exports[handlerName] = () => {
      const ptr = nextPtr
      nextPtr += 1
      store.set(ptr, responseJson)
      return ptr
    }
  })

  return { exports }
}

describe('wasm provider bindings', () => {
  beforeEach(() => {
    resourceModule.wasmResourceProviders.clear()
    weatherModule.wasmWeatherProviders.clear()
    radarModule.wasmRadarProviders.clear()
  })

  it('handles resource provider handler variants', () => {
    const asLoader = {
      exports: {
        __newString: () => 1,
        __getString: () => '{"value":1}',
        resources_list_resources: () => 2
      }
    }

    const asResult = resourceModule.callWasmResourceHandler(
      { pluginId: 'plugin-a', asLoader },
      'resources_list_resources',
      '{"resourceType":"notes"}'
    )

    expect(asResult).to.equal('{"value":1}')

    const rawExports = createRawExports('{"value":2}', 'resources_get_resource')
    const rawResult = resourceModule.callWasmResourceHandler(
      { pluginId: 'plugin-a', instance: { exports: rawExports } },
      'resources_get_resource',
      '{"id":"1"}'
    )

    expect(rawResult).to.equal('{"value":2}')

    const missingAllocate = resourceModule.callWasmResourceHandler(
      {
        pluginId: 'plugin-a',
        instance: { exports: { memory: rawExports.memory } }
      },
      'resources_get_resource',
      '{}'
    )

    expect(missingAllocate).to.equal(null)
  })

  it('registers resource providers and wires methods', async () => {
    let registered: ProviderRegistration | null = null
    const app: UnknownRecord = {
      resourcesApi: {
        register: (
          pluginId: string,
          provider: { type?: string; methods: ProviderMethods }
        ) => {
          registered = { pluginId, provider }
        },
        unRegister: () => undefined
      }
    }

    const binding = resourceModule.createResourceProviderBinding(
      'plugin-a',
      { resourceProvider: true },
      app,
      () => 'notes'
    )

    expect(binding(0, 0)).to.equal(1)
    expect(registered?.provider?.type).to.equal('notes')

    const asLoader = {
      exports: {
        __newString: () => 1,
        __getString: (ptr: number) => (ptr === 2 ? '{}' : '{"id":1}'),
        resources_list_resources: () => 2,
        resources_get_resource: () => 3,
        resources_set_resource: () => 4,
        resources_delete_resource: () => 5
      }
    }

    resourceModule.updateResourceProviderInstance('plugin-a', {
      pluginId: 'plugin-a',
      asLoader
    })

    const listResult = await registered!.provider.methods.listResources({})
    expect(listResult).to.deep.equal({})

    const getResult = await registered!.provider.methods.getResource('id-1')
    expect(getResult).to.deep.equal({ id: 1 })

    await registered!.provider.methods.setResource('id-1', { a: 1 })
    await registered!.provider.methods.deleteResource('id-1')

    resourceModule.cleanupResourceProviders('plugin-a', app)
    expect(resourceModule.wasmResourceProviders.size).to.equal(0)
  })

  it('guards resource provider registration', () => {
    const binding = resourceModule.createResourceProviderBinding(
      'plugin-a',
      { resourceProvider: false },
      {},
      () => 'notes'
    )

    expect(binding(0, 0)).to.equal(0)
  })

  it('handles resource provider readiness and cleanup errors', async () => {
    const binding = resourceModule.createResourceProviderBinding(
      'plugin-a',
      { resourceProvider: true },
      {
        resourcesApi: {
          register: () => undefined,
          unRegister: () => {
            throw new Error('boom')
          }
        }
      },
      () => 'notes'
    )

    expect(binding(0, 0)).to.equal(1)

    const provider = resourceModule.wasmResourceProviders.get('plugin-a:notes')
    expect(provider).to.not.equal(undefined)

    const dummyApp = {
      resourcesApi: {
        unRegister: () => {
          throw new Error('boom')
        }
      }
    }
    resourceModule.cleanupResourceProviders('plugin-a', dummyApp)
    expect(resourceModule.wasmResourceProviders.size).to.equal(0)
  })

  it('handles weather provider async handlers', async () => {
    let resumeCallback: (() => unknown) | null = null

    let handlerCalls = 0
    const asLoader = {
      exports: {
        __newString: () => 1,
        __getString: (ptr: number) => (ptr === 2 ? '[{"id":1}]' : '[{"id":2}]'),
        asyncify_get_state: () => 1,
        weather_get_observations: () => {
          handlerCalls += 1
          return handlerCalls === 1 ? 2 : 3
        }
      }
    }

    const pluginInstance = {
      pluginId: 'weather-plugin',
      asLoader,
      setAsyncifyResume: (cb: (() => unknown) | null) => {
        resumeCallback = cb
      }
    }

    const promise = weatherModule.callWasmWeatherHandler(
      pluginInstance,
      'weather_get_observations',
      '{}'
    )

    if (resumeCallback) {
      resumeCallback()
    }

    const result = await promise
    expect(result).to.equal('[{"id":2}]')
  })

  it('handles radar handler variants', async () => {
    let resumeCallback: (() => unknown) | null = null
    let handlerCalls = 0

    const asLoader = {
      exports: {
        __newString: () => 1,
        __getString: (ptr: number) => (ptr === 2 ? '["r1"]' : '["r2"]'),
        asyncify_get_state: () => 1,
        radar_get_radars: () => {
          handlerCalls += 1
          return handlerCalls === 1 ? 2 : 3
        }
      }
    }

    const pluginInstance = {
      pluginId: 'radar-plugin',
      asLoader,
      setAsyncifyResume: (cb: (() => unknown) | null) => {
        resumeCallback = cb
      }
    }

    const promise = radarModule.callWasmRadarHandler(
      pluginInstance,
      'radar_get_radars',
      '{}'
    )

    if (resumeCallback) {
      resumeCallback()
    }

    const result = await promise
    expect(result).to.equal('["r2"]')

    const rawExports = {
      memory: new WebAssembly.Memory({ initial: 1 }),
      radar_get_state: () => 0
    }
    const missingAllocate = await radarModule.callWasmRadarHandler(
      { pluginId: 'radar-plugin', instance: { exports: rawExports } },
      'radar_get_state',
      '{}'
    )
    expect(missingAllocate).to.equal(null)

    const notFound = await radarModule.callWasmRadarHandler(
      { pluginId: 'radar-plugin', instance: { exports: {} } },
      'radar_get_state',
      '{}'
    )
    expect(notFound).to.equal(null)

    const rustExports = createSharedRustExports({
      radar_get_state: '{"state":"on"}'
    })
    const rustResult = await radarModule.callWasmRadarHandler(
      { pluginId: 'radar-plugin', instance: { exports: rustExports } },
      'radar_get_state',
      '{}'
    )
    expect(rustResult).to.equal('{"state":"on"}')
  })

  it('registers weather providers and parses responses', async () => {
    let registered: ProviderRegistration | null = null
    const app: UnknownRecord = {
      weatherApi: {
        register: (
          pluginId: string,
          provider: { type?: string; methods: ProviderMethods }
        ) => {
          registered = { pluginId, provider }
        },
        unRegister: () => undefined
      }
    }

    const binding = weatherModule.createWeatherProviderBinding(
      'weather-plugin',
      { weatherProvider: true },
      app,
      () => 'WeatherPro'
    )

    expect(binding(0, 0)).to.equal(1)

    const rawExports = createRawExports(
      '[{"id":1}]',
      'weather_get_observations'
    )

    weatherModule.updateWeatherProviderInstance('weather-plugin', {
      pluginId: 'weather-plugin',
      instance: { exports: rawExports }
    })

    const observations = await registered!.provider.methods.getObservations({
      latitude: 1,
      longitude: 2
    })
    expect(observations).to.deep.equal([{ id: 1 }])

    const badExports = createRawExports('not-json', 'weather_get_forecasts')
    weatherModule.updateWeatherProviderInstance('weather-plugin', {
      pluginId: 'weather-plugin',
      instance: { exports: badExports }
    })

    const forecasts = await registered!.provider.methods.getForecasts(
      { latitude: 1, longitude: 2 },
      'daily'
    )
    expect(forecasts).to.deep.equal([])

    const warningsExports = createRawExports(
      '[{"id":2}]',
      'weather_get_warnings'
    )
    weatherModule.updateWeatherProviderInstance('weather-plugin', {
      pluginId: 'weather-plugin',
      instance: { exports: warningsExports }
    })

    const warnings = await registered!.provider.methods.getWarnings({
      latitude: 1,
      longitude: 2
    })
    expect(warnings).to.deep.equal([{ id: 2 }])

    weatherModule.cleanupWeatherProviders('weather-plugin', app)
    expect(weatherModule.wasmWeatherProviders.size).to.equal(0)
  })

  it('registers radar providers and emits spokes', async () => {
    let registered: ProviderRegistration | null = null
    const app: UnknownRecord = {
      radarApi: {
        register: (
          pluginId: string,
          provider: { type?: string; methods: ProviderMethods }
        ) => {
          registered = { pluginId, provider }
        },
        unRegister: () => undefined
      },
      binaryStreamManager: {
        emitData: () => undefined
      }
    }

    const binding = radarModule.createRadarProviderBinding(
      'radar-plugin',
      { radarProvider: true },
      app,
      () => 'RadarOne'
    )

    expect(binding(0, 0)).to.equal(1)

    const asLoader = createAsLoader({
      radar_get_radars: '["radar-1"]',
      radar_get_state: '{"state":"on"}',
      radar_get_radar_info: '{"model":"x"}',
      radar_set_power: 'true',
      radar_set_range: 'true',
      radar_set_gain: 'true',
      radar_set_sea: 'true',
      radar_set_rain: 'true',
      radar_set_controls: 'true',
      radar_get_capabilities: '{"ranges":[100]}',
      radar_get_control: '{"value":3}',
      radar_set_control: '{"success":true}',
      radar_get_targets: '{"targets":[1]}',
      radar_acquire_target: '{"success":true,"targetId":5}',
      radar_cancel_target: 'true',
      radar_get_arpa_settings: '{"guard":1}',
      radar_set_arpa_settings: '{"success":true}'
    })

    radarModule.updateRadarProviderInstance('radar-plugin', {
      pluginId: 'radar-plugin',
      asLoader
    })

    const radars = await registered!.provider.methods.getRadars()
    expect(radars).to.deep.equal(['radar-1'])

    const state = await registered!.provider.methods.getState('radar-1')
    expect(state).to.deep.equal({ state: 'on' })

    const info = await registered!.provider.methods.getRadarInfo('radar-1')
    expect(info).to.deep.equal({ model: 'x' })

    expect(
      await registered!.provider.methods.setPower('radar-1', 'on')
    ).to.equal(true)
    expect(
      await registered!.provider.methods.setRange('radar-1', 100)
    ).to.equal(true)
    expect(
      await registered!.provider.methods.setGain('radar-1', { auto: true })
    ).to.equal(true)
    expect(
      await registered!.provider.methods.setSea('radar-1', { auto: true })
    ).to.equal(true)
    expect(
      await registered!.provider.methods.setRain('radar-1', { auto: true })
    ).to.equal(true)
    expect(
      await registered!.provider.methods.setControls('radar-1', { a: 1 })
    ).to.equal(true)

    const capabilities =
      await registered!.provider.methods.getCapabilities('radar-1')
    expect(capabilities).to.deep.equal({ ranges: [100] })

    const control = await registered!.provider.methods.getControl(
      'radar-1',
      'gain'
    )
    expect(control).to.deep.equal({ value: 3 })

    const setControl = await registered!.provider.methods.setControl(
      'radar-1',
      'gain',
      3
    )
    expect(setControl).to.deep.equal({ success: true })

    const targets = await registered!.provider.methods.getTargets('radar-1')
    expect(targets).to.deep.equal({ targets: [1] })

    const acquired = await registered!.provider.methods.acquireTarget(
      'radar-1',
      1,
      2
    )
    expect(acquired).to.deep.equal({ success: true, targetId: 5 })

    const canceled = await registered!.provider.methods.cancelTarget(
      'radar-1',
      5
    )
    expect(canceled).to.equal(true)

    const arpaSettings =
      await registered!.provider.methods.getArpaSettings('radar-1')
    expect(arpaSettings).to.deep.equal({ guard: 1 })

    const setArpa = await registered!.provider.methods.setArpaSettings(
      'radar-1',
      { guard: 2 }
    )
    expect(setArpa).to.deep.equal({ success: true })

    const spokes = radarModule.createRadarEmitSpokesBinding(
      'radar-plugin',
      { radarProvider: true },
      app,
      () => 'radar-1',
      () => Buffer.from([1, 2])
    )

    expect(spokes(0, 0, 0, 2)).to.equal(1)

    const spokesDenied = radarModule.createRadarEmitSpokesBinding(
      'radar-plugin',
      { radarProvider: false },
      app,
      () => 'radar-1',
      () => Buffer.from([1, 2])
    )
    expect(spokesDenied(0, 0, 0, 2)).to.equal(0)

    radarModule.cleanupRadarProviders('radar-plugin', app)
    expect(radarModule.wasmRadarProviders.size).to.equal(0)
  })

  it('guards radar registration and handles not-ready providers', async () => {
    const denied = radarModule.createRadarProviderBinding(
      'radar-plugin',
      { radarProvider: false },
      { radarApi: { register: () => undefined } },
      () => 'Radar'
    )
    expect(denied(0, 0)).to.equal(0)

    const noApi = radarModule.createRadarProviderBinding(
      'radar-plugin',
      { radarProvider: true },
      {},
      () => 'Radar'
    )
    expect(noApi(0, 0)).to.equal(0)

    let registered: ProviderRegistration | null = null
    const binding = radarModule.createRadarProviderBinding(
      'radar-plugin',
      { radarProvider: true },
      {
        radarApi: {
          register: (
            _pluginId: string,
            provider: { type?: string; methods: ProviderMethods }
          ) => {
            registered = { pluginId: 'radar-plugin', provider }
          }
        }
      },
      () => 'Radar'
    )
    expect(binding(0, 0)).to.equal(1)

    expect(await registered!.provider.methods.getRadars()).to.deep.equal([])
    expect(await registered!.provider.methods.getRadarInfo('r1')).to.equal(null)
    expect(await registered!.provider.methods.setPower('r1', 'on')).to.equal(
      false
    )
    expect(
      await registered!.provider.methods.setControl('r1', 'c1', 1)
    ).to.deep.equal({
      success: false,
      error: 'Provider not ready'
    })

    const emitSpokes = radarModule.createRadarEmitSpokesBinding(
      'radar-plugin',
      { radarProvider: true },
      { binaryStreamManager: { emitData: () => undefined } },
      () => 'radar-1',
      () => Buffer.from([1])
    )
    expect(emitSpokes(0, 0, 0, 1)).to.equal(0)
  })

  it('handles radar and weather error parsing', async () => {
    let registeredRadar: { methods: ProviderMethods } | null = null
    const app: UnknownRecord = {
      radarApi: {
        register: (
          _pluginId: string,
          provider: { methods: ProviderMethods }
        ) => {
          registeredRadar = provider
        },
        unRegister: () => undefined
      }
    }

    const radarBinding = radarModule.createRadarProviderBinding(
      'radar-plugin',
      { radarProvider: true },
      app,
      () => 'RadarErr'
    )

    expect(radarBinding(0, 0)).to.equal(1)

    const errorAsLoader = createAsLoader({
      radar_get_capabilities: '{"error":"fail"}',
      radar_get_state: '{"error":"fail"}',
      radar_get_control: 'not-json',
      radar_set_control: 'not-json',
      radar_get_targets: 'not-json',
      radar_acquire_target: 'not-json',
      radar_set_arpa_settings: 'not-json'
    })

    radarModule.updateRadarProviderInstance('radar-plugin', {
      pluginId: 'radar-plugin',
      asLoader: errorAsLoader
    })

    expect(await registeredRadar!.methods.getCapabilities('r')).to.equal(null)
    expect(await registeredRadar!.methods.getState('r')).to.equal(null)
    expect(await registeredRadar!.methods.getControl('r', 'c')).to.equal(null)
    expect(
      await registeredRadar!.methods.setControl('r', 'c', 1)
    ).to.deep.equal({
      success: false,
      error: 'Invalid response'
    })
    expect(await registeredRadar!.methods.getTargets('r')).to.equal(null)
    expect(
      await registeredRadar!.methods.acquireTarget('r', 1, 1)
    ).to.deep.equal({
      success: false,
      error: 'Invalid response'
    })
    expect(
      await registeredRadar!.methods.setArpaSettings('r', { a: 1 })
    ).to.deep.equal({
      success: false,
      error: 'Invalid response'
    })

    let registeredWeather: ProviderRegistration | null = null
    const weatherBinding = weatherModule.createWeatherProviderBinding(
      'weather-plugin',
      { weatherProvider: true },
      {
        weatherApi: {
          register: (
            _pluginId: string,
            provider: { type?: string; methods: ProviderMethods }
          ) => {
            registeredWeather = { pluginId: 'weather-plugin', provider }
          },
          unRegister: () => undefined
        }
      },
      () => 'WeatherErr'
    )

    expect(weatherBinding(0, 0)).to.equal(1)

    const weatherExports = createRawExports('not-json', 'weather_get_warnings')
    weatherModule.updateWeatherProviderInstance('weather-plugin', {
      pluginId: 'weather-plugin',
      instance: { exports: weatherExports }
    })

    const warnings = await registeredWeather!.provider.methods.getWarnings({
      latitude: 1,
      longitude: 2
    })
    expect(warnings).to.deep.equal([])
  })
})
