import { expect } from 'chai'
import {
  canboatjsSupportsManufacturerFilter,
  manufacturerCodeOf,
  manufacturerFilterOption,
  manufacturerPasses
} from './n2k-manufacturers'
import N2kToSignalK from './n2k-signalk'
import Simple from './simple'
import { createMockApp, createDebugStub } from './test-helpers'

// A Maretron NAME: manufacturer code 137.
const MARETRON_NAME = 'cfa0aad31135b495'
const MARETRON = 137

const codesOf = (names: string[]) =>
  names.map(
    (name) =>
      ({ maretron: MARETRON, Maretron: MARETRON, garmin: 229 })[
        name as 'maretron'
      ] ?? -1
  )

// canboatjs with parseManufacturers, whichever is installed.
const canboatjsPath = require.resolve('@canboat/canboatjs')
function withCanboatjs<T>(supports: boolean, run: () => T): T {
  const real = require.cache[canboatjsPath]!
  const exports = {
    ...real.exports,
    parseManufacturers: supports ? codesOf : undefined
  }
  require.cache[canboatjsPath] = { ...real, exports } as NodeModule
  try {
    return run()
  } finally {
    require.cache[canboatjsPath] = real
  }
}

describe('manufacturerFilterOption', () => {
  it('gives the allow or deny list', () => {
    expect(
      manufacturerFilterOption({
        filtersEnabled: true,
        manufacturerFilter: 'allow',
        manufacturers: ['Victron Energy', ' ']
      })
    ).to.deep.equal({ allowManufacturers: ['Victron Energy'] })
    expect(
      manufacturerFilterOption({
        filtersEnabled: true,
        manufacturerFilter: 'deny',
        manufacturers: ['Garmin']
      })
    ).to.deep.equal({ denyManufacturers: ['Garmin'] })
  })

  it('gives none with the filters off, no mode, or no manufacturer', () => {
    for (const options of [
      { manufacturerFilter: 'allow', manufacturers: ['Garmin'] },
      { filtersEnabled: true, manufacturers: ['Garmin'] },
      { filtersEnabled: true, manufacturerFilter: 'allow', manufacturers: [] },
      { filtersEnabled: true, manufacturerFilter: 'deny' }
    ]) {
      expect(manufacturerFilterOption(options)).to.equal(undefined)
    }
  })
})

describe('canboatjsSupportsManufacturerFilter', () => {
  it('looks for parseManufacturers', () => {
    expect(canboatjsSupportsManufacturerFilter({})).to.equal(false)
    expect(
      canboatjsSupportsManufacturerFilter({ parseManufacturers: () => [] })
    ).to.equal(true)
  })
})

describe('manufacturerCodeOf', () => {
  const codeOfName = (name: string) =>
    ({ Maretron: MARETRON })[name as 'Maretron']

  it("takes the claim's code, as a number or a name", () => {
    expect(manufacturerCodeOf({ manufacturerCode: 229 }, codeOfName)).to.equal(
      229
    )
    expect(
      manufacturerCodeOf({ manufacturerCode: 'Maretron' }, codeOfName)
    ).to.equal(MARETRON)
  })

  it('reads it from the CAN NAME otherwise', () => {
    expect(manufacturerCodeOf({ canName: MARETRON_NAME }, codeOfName)).to.equal(
      MARETRON
    )
  })

  it('knows nothing without either', () => {
    expect(manufacturerCodeOf({}, codeOfName)).to.equal(undefined)
    expect(manufacturerCodeOf({ canName: 'not a name' }, codeOfName)).to.equal(
      undefined
    )
  })
})

describe('manufacturerPasses', () => {
  it('keeps an allowed manufacturer, drops a denied one', () => {
    const allow = { allowManufacturers: ['maretron'] }
    const deny = { denyManufacturers: ['maretron'] }
    expect(manufacturerPasses(MARETRON, allow, codesOf)).to.equal(true)
    expect(manufacturerPasses(229, allow, codesOf)).to.equal(false)
    expect(manufacturerPasses(MARETRON, deny, codesOf)).to.equal(false)
    expect(manufacturerPasses(229, deny, codesOf)).to.equal(true)
  })

  it('passes everything without a filter, or an unknown manufacturer', () => {
    expect(manufacturerPasses(MARETRON, undefined, codesOf)).to.equal(true)
    const deny = { denyManufacturers: ['maretron'] }
    expect(manufacturerPasses(undefined, deny, codesOf)).to.equal(true)
  })
})

describe('N2kToSignalK and the manufacturer filter', () => {
  // canboatjs still passes on a filtered device's address claim and
  // product information: it must not show up as a source.
  function claimFrom(options: object) {
    const app = createMockApp()
    const cached: string[] = []
    app.deltaCache.setSourceDelta = (key: string) => {
      if (!cached.includes(key)) {
        cached.push(key)
      }
    }
    const stream = withCanboatjs(
      true,
      () => new N2kToSignalK({ app, providerId: 'can0', ...options })
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapper = (stream as any).n2kMapper
    withCanboatjs(true, () => {
      // The claim, as n2k-signalk gives it: the manufacturer's name.
      mapper.emit(
        'n2kSourceMetadata',
        { src: 122, pgn: 60928, timestamp: '2024-01-01T00:00:01.000Z' },
        { manufacturerCode: 'Maretron' }
      )
      // Product information, which doesn't repeat the manufacturer.
      mapper.emit(
        'n2kSourceMetadata',
        { src: 122, pgn: 126996, timestamp: '2024-01-01T00:00:02.000Z' },
        { modelId: 'DSM250' }
      )
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { cached, meta: (stream as any).sourceMeta[122] }
  }

  it('leaves a denied device out of the sources', () => {
    const { cached, meta } = claimFrom({ denyManufacturers: ['maretron'] })
    expect(cached).to.deep.equal([])
    expect(meta).to.equal(undefined)
  })

  it('keeps an allowed device', () => {
    const { cached } = claimFrom({ allowManufacturers: ['maretron'] })
    expect(cached).to.deep.equal(['can0.122'])
  })

  it('leaves a device out until its manufacturer is known', () => {
    const app = createMockApp()
    const cached: string[] = []
    app.deltaCache.setSourceDelta = (key: string) => {
      cached.push(key)
    }
    const stream = withCanboatjs(
      true,
      () =>
        new N2kToSignalK({
          app,
          providerId: 'can0',
          allowManufacturers: ['maretron']
        })
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapper = (stream as any).n2kMapper
    withCanboatjs(true, () => {
      // An ISO Request from the device, before its claim.
      mapper.emit(
        'n2kSourceMetadata',
        { src: 122, pgn: 59904, timestamp: '2024-01-01T00:00:00.000Z' },
        { unknownPGNs: {} }
      )
      expect(cached).to.deep.equal([])
      mapper.emit(
        'n2kSourceMetadata',
        { src: 122, pgn: 60928, timestamp: '2024-01-01T00:00:01.000Z' },
        { manufacturerCode: 'Maretron' }
      )
    })
    expect(cached).to.deep.equal(['can0.122'])
  })

  it('keeps every device without a filter', () => {
    const { cached } = claimFrom({})
    expect(cached).to.deep.equal(['can0.122'])
  })
})

describe('Simple: the manufacturer filter', () => {
  function build(extra: object) {
    return new Simple({
      app: createMockApp(),
      providerId: 'n2k-file',
      type: 'FileStream',
      createDebug: createDebugStub(),
      emitPropertyValue: () => {},
      onPropertyValues: () => {},
      subOptions: {
        dataType: 'NMEA2000JS',
        filename: '/dev/null',
        keepRunning: false,
        filtersEnabled: true,
        manufacturerFilter: 'deny',
        manufacturers: ['garmin'],
        ...extra
      }
    } as unknown as ConstructorParameters<typeof Simple>[0])
  }

  // The options the decoder was made with.
  function decoderOptions(simple: Simple): Record<string, unknown> {
    const pipeline = (simple as unknown as { pipeline: object[] }).pipeline
    const decoder = pipeline.find((e) => 'fromPgn' in e) as {
      fromPgn: { options: Record<string, unknown> }
    }
    return decoder.fromPgn.options
  }

  it('hands the list to canboatjs', () => {
    const simple = withCanboatjs(true, () => build({}))
    expect(decoderOptions(simple).denyManufacturers).to.deep.equal(['garmin'])
    expect(decoderOptions(simple).allowManufacturers).to.equal(undefined)
    simple.end()
  })

  it('says so when the installed canboatjs cannot filter', () => {
    const warn = console.warn
    const warnings: string[] = []
    console.warn = (message: string) => warnings.push(message)
    try {
      const simple = withCanboatjs(false, () => build({}))
      expect(decoderOptions(simple).denyManufacturers).to.equal(undefined)
      simple.end()
    } finally {
      console.warn = warn
    }
    expect(warnings).to.deep.equal([
      "n2k-file: this canboatjs can't filter devices by manufacturer; the manufacturer filter is off"
    ])
  })
})
