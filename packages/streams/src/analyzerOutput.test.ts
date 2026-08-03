import { expect } from 'chai'
import { EventEmitter } from 'events'
import { unwrapAnalyzerOutput } from './analyzerOutput'
import { N2kMapper } from '@signalk/n2k-signalk'
import { FromPgn } from '@canboat/canboatjs'

// Real output of `analyzer -json -si -camel -nv` (canboat v8.0.0-beta1) for
// the PLAIN line below. The envelope key is the camelCase PGN id; lookup
// fields arrive as {value, name}.
const RAW_60928 =
  '2017-04-15T14:57:58.470Z,6,60928,3,255,8,d3,e5,98,c5,00,82,32,c0'
const ANALYZER_60928 = {
  isoAddressClaim: {
    timestamp: '2017-04-15T14:57:58.470Z',
    prio: 6,
    src: 3,
    dst: 255,
    pgn: 60928,
    description: 'ISO Address Claim',
    fields: {
      uniqueNumber: 1631699,
      manufacturerCode: { value: 1580 },
      deviceInstanceLower: 0,
      deviceInstanceUpper: 0,
      deviceFunction: { value: 130, name: 'PC Gateway' },
      deviceClass: { value: 25, name: 'Internetwork device' },
      systemInstance: 0,
      industryGroup: { value: 4, name: 'Marine Industry' },
      arbitraryAddressCapable: { value: 1, name: 'Yes' }
    }
  }
}

describe('unwrapAnalyzerOutput', () => {
  it('unwraps the -camel envelope to a flat PGN object', () => {
    const flat = unwrapAnalyzerOutput(ANALYZER_60928)
    expect(flat.pgn).to.equal(60928)
    expect(flat.src).to.equal(3)
    expect(flat.description).to.equal('ISO Address Claim')
  })

  it('keeps INDIRECT_LOOKUP fields numeric and resolves plain lookups to names', () => {
    const flat = unwrapAnalyzerOutput(ANALYZER_60928)
    const fields = flat.fields as Record<string, unknown>
    // deviceFunction is an INDIRECT_LOOKUP (meaning depends on deviceClass):
    // canboatjs leaves it numeric, and the canName derivation re-encodes it,
    // so a name-string here would change every device's source ref.
    expect(fields.deviceFunction).to.equal(130)
    expect(fields.deviceClass).to.equal('Internetwork device')
    expect(fields.industryGroup).to.equal('Marine Industry')
    expect(fields.arbitraryAddressCapable).to.equal('Yes')
    // {value} without a name falls back to the raw value
    expect(fields.manufacturerCode).to.equal(1580)
  })

  it('maps bit-lookup arrays to arrays of names', () => {
    const flat = unwrapAnalyzerOutput({
      engineParametersDynamic: {
        pgn: 127489,
        src: 16,
        dst: 255,
        prio: 2,
        fields: {
          instance: { value: 0, name: 'Single Engine or Dual Engine Port' },
          discreteStatus1: [
            { value: 1, name: 'Check Engine' },
            { value: 4, name: 'Low Oil Pressure' }
          ]
        }
      }
    })
    const fields = flat.fields as Record<string, unknown>
    expect(fields.instance).to.equal('Single Engine or Dual Engine Port')
    expect(fields.discreteStatus1).to.deep.equal([
      'Check Engine',
      'Low Oil Pressure'
    ])
  })

  it('passes already-flat output through unchanged', () => {
    const flat = {
      timestamp: '2017-04-15T14:57:58.470Z',
      pgn: 60928,
      src: 3,
      fields: { uniqueNumber: 1631699 }
    }
    expect(unwrapAnalyzerOutput(flat)).to.deep.equal(flat)
  })

  it('derives the same canName as the canboatjs decode path', () => {
    // The regression that motivated this module: source refs must not change
    // when a user switches between the canboatjs and analyzer connection
    // types, or their per-source settings silently detach.
    const parser = new FromPgn({ format: 1, returnNulls: true, useCamel: true })
    parser.on('error', () => {})
    const fromCanboatjs = parser.parseString(RAW_60928)
    const fromAnalyzer = unwrapAnalyzerOutput(ANALYZER_60928)

    const canNameOf = (pgn: unknown) => {
      let canName: string | undefined
      const mapper = new N2kMapper({ useCanName: true }) as N2kMapper &
        EventEmitter
      mapper.on(
        'n2kSourceMetadata',
        (_n2k: unknown, meta: { canName?: string }) => {
          canName = meta.canName
        }
      )
      mapper.toDelta(pgn)
      return canName
    }

    const jsName = canNameOf(fromCanboatjs)
    const analyzerName = canNameOf(fromAnalyzer)
    expect(jsName).to.be.a('string')
    expect(analyzerName).to.equal(jsName)
  })
})
