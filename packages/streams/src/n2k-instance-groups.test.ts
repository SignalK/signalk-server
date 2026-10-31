import { expect } from 'chai'
import type { EventEmitter } from 'events'
import { FromPgn, pgnToActisenseSerialFormat } from '@canboat/canboatjs'
import { N2kMapper } from '@signalk/n2k-signalk'
import {
  N2K_INSTANCE_GROUPS,
  applicableRules,
  classifyInstance,
  defaultPrefixes,
  deviceKeyFromCanName,
  checkDeviceRules,
  instancePrefixRule,
  instanceRuleKey,
  isAtOrUnder,
  type N2kFrame,
  type N2kInstanceGroupId
} from './n2k-instance-groups'

const SRC = 42
const ABSENT_8BIT = 255

const parser = new FromPgn({})

// Frames go through the real canboat encoder and decoder so the classifier sees
// the same field shapes as in production: lookup names for known codes,
// numbers for unknown ones, and absent fields for the wire's "no data" value.
function decode(pgn: number, fields: Record<string, unknown>): N2kFrame {
  const encoded = pgnToActisenseSerialFormat({
    pgn,
    src: SRC,
    dst: 255,
    prio: 2,
    fields
  } as unknown as Parameters<typeof pgnToActisenseSerialFormat>[0])
  const frame = parser.parseString(encoded!) as unknown as N2kFrame | undefined
  if (!frame) throw new Error(`canboat could not decode PGN ${pgn}`)
  return frame
}

function withoutUndefined(
  fields: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined)
  )
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)

// The frame's classification with the prefixes its group writes it under.
function classified(frame: N2kFrame) {
  const classification = classifyInstance(frame)
  return (
    classification && {
      ...classification,
      defaultPrefixes: defaultPrefixes(
        classification.group,
        classification.discriminator,
        classification.instance,
        Number(frame.src)
      )
    }
  )
}

function engineFrame(instance: number): N2kFrame {
  return decode(127488, { instance, speed: 1000 })
}

describe('n2k-instance-groups', () => {
  describe('classifyInstance', () => {
    it('maps engine 0 to propulsion.port', () => {
      expect(classified(engineFrame(0))).to.deep.equal({
        group: 'engine',
        discriminator: undefined,
        instance: 0,
        defaultPrefixes: ['propulsion.port']
      })
    })

    it('maps engine 1 to propulsion.starboard', () => {
      expect(classified(engineFrame(1))).to.deep.include({
        instance: 1,
        defaultPrefixes: ['propulsion.starboard']
      })
    })

    it('maps engine 2 to propulsion.2', () => {
      expect(classified(engineFrame(2))).to.deep.include({
        instance: 2,
        defaultPrefixes: ['propulsion.2']
      })
    })

    it('maps an engine without instance to code 255 and propulsion.starboard', () => {
      const frame = engineFrame(ABSENT_8BIT)
      expect(
        (frame.fields as Record<string, unknown> | undefined)?.instance
      ).to.equal(undefined)
      expect(classified(frame)).to.deep.include({
        instance: 255,
        defaultPrefixes: ['propulsion.starboard']
      })
    })

    it('maps battery 3 to electrical.batteries.3', () => {
      const frame = decode(127508, { instance: 3, voltage: 12.5 })
      expect(classified(frame)).to.deep.equal({
        group: 'battery',
        discriminator: undefined,
        instance: 3,
        defaultPrefixes: ['electrical.batteries.3']
      })
    })

    it('maps a Fuel tank by type code', () => {
      const frame = decode(127505, { instance: 1, type: 0, level: 50 })
      expect(classified(frame)).to.deep.equal({
        group: 'tank',
        discriminator: 0,
        instance: 1,
        defaultPrefixes: ['tanks.fuel.1']
      })
    })

    it('keeps Engine Room instances apart under one fixed prefix', () => {
      const [first, second] = [0, 1].map((instance) =>
        classified(
          decode(130312, {
            sid: 0,
            instance,
            source: 3,
            actualTemperature: 300
          })
        )
      )
      expect(first).to.deep.equal({
        group: 'temperature',
        discriminator: 3,
        instance: 0,
        defaultPrefixes: ['environment.inside.engineRoom.temperature']
      })
      expect(second).to.deep.equal({
        group: 'temperature',
        discriminator: 3,
        instance: 1,
        defaultPrefixes: ['environment.inside.engineRoom.temperature']
      })
    })

    it('keeps indexed inside temperature and humidity leaves apart', () => {
      const temperature = classified(
        decode(130312, {
          sid: 0,
          instance: 2,
          source: 2,
          actualTemperature: 300
        })
      )
      const humidity = classified(
        decode(130313, { sid: 0, instance: 2, source: 0, actualHumidity: 50 })
      )
      expect(temperature?.defaultPrefixes).to.deep.equal([
        'environment.inside.2.temperature'
      ])
      expect(humidity?.defaultPrefixes).to.deep.equal([
        'environment.inside.2.relativeHumidity'
      ])
    })

    it('passes an unknown temperature source through as its code', () => {
      const frame = decode(130312, {
        sid: 0,
        instance: 2,
        source: 200,
        actualTemperature: 300
      })
      expect(classified(frame)).to.deep.include({
        discriminator: 200,
        defaultPrefixes: ['generic.temperatures.userDefined200.2.temperature']
      })
    })

    it('includes the bus address for DC connections', () => {
      const frame = decode(127751, {
        sid: 0,
        connectionNumber: 2,
        dcVoltage: 12
      })
      expect(classified(frame)).to.deep.equal({
        group: 'dcConnection',
        discriminator: undefined,
        instance: 2,
        defaultPrefixes: [`electrical.dc.${SRC}.2`]
      })
    })

    it('returns undefined for the rudder', () => {
      expect(
        classified(decode(127245, { instance: 0, position: 0.1 }))
      ).to.equal(undefined)
    })

    it('accepts string pgn and src', () => {
      const frame = decode(127751, {
        sid: 0,
        connectionNumber: 2,
        dcVoltage: 12
      })
      const stringly = { ...frame, pgn: '127751', src: String(SRC) }
      expect(classified(stringly)?.defaultPrefixes).to.deep.equal([
        `electrical.dc.${SRC}.2`
      ])
    })

    it('returns undefined for PGNs outside the table', () => {
      expect(
        classified(decode(129025, { latitude: 60.1, longitude: 24.9 }))
      ).to.equal(undefined)
    })

    it('returns undefined for switch banks', () => {
      expect(
        classified(decode(127501, { instance: 0, indicator1: 1 }))
      ).to.equal(undefined)
    })
  })

  describe('defaultPrefixes', () => {
    const cases: Array<
      [N2kInstanceGroupId, number | undefined, number, string]
    > = [
      ['engine', undefined, 0, 'propulsion.port'],
      ['engine', undefined, 255, 'propulsion.starboard'],
      ['battery', undefined, 3, 'electrical.batteries.3'],
      ['tank', 0, 1, 'tanks.fuel.1'],
      ['temperature', 3, 1, 'environment.inside.engineRoom.temperature'],
      ['temperature', 1, 0, 'environment.outside.temperature'],
      ['temperature', 2, 1, 'environment.inside.1.temperature'],
      ['temperature', 5, 1, 'tanks.liveWell.1.temperature'],
      ['temperature', 14, 2, 'propulsion.2.exhaustTemperature'],
      ['humidity', 0, 2, 'environment.inside.2.relativeHumidity'],
      ['pressure', 1, 1, 'water.1.pressure'],
      ['pressure', 0, 1, 'environment.outside.pressure'],
      ['acConnection', undefined, 1, `electrical.ac.${SRC}.1`],
      ['converter', undefined, 1, `electrical.converter.${SRC}.1`]
    ]
    for (const [group, discriminator, instance, expected] of cases) {
      it(`${group} ${discriminator ?? '-'} ${instance} → ${expected}`, () => {
        expect(
          defaultPrefixes(group, discriminator, instance, SRC)
        ).to.deep.equal([expected])
      })
    }

    it('lists both spellings a group can produce for one tuple', () => {
      expect(defaultPrefixes('temperature', 15, 1, SRC)).to.have.members([
        'generic.temperatures.userDefinedShaft_Seal_Temperature.1.temperature',
        'generic.temperatures.userDefinedShaft Seal Temperature.1.temperature'
      ])
    })

    it('places a pressure source without a Signal K path under generic', () => {
      expect(defaultPrefixes('pressure', 9, 1, SRC)).to.deep.equal([
        'generic.pressures.userDefined9.1.pressure'
      ])
    })

    it('is empty for a frame the mapper writes no path for', () => {
      expect(defaultPrefixes('pressure', ABSENT_8BIT, 1, SRC)).to.deep.equal([])
    })
  })

  describe('N2K_INSTANCE_GROUPS', () => {
    const singleLeafIds = () =>
      N2K_INSTANCE_GROUPS.filter((g) => g.singleLeaf).map((g) => g.id)

    it('marks only the groups that write one leaf per instance', () => {
      expect([...singleLeafIds()].sort()).to.deep.equal([
        'humidity',
        'pressure',
        'temperature'
      ])
    })

    it('lists each PGN in exactly one group', () => {
      const pgns = N2K_INSTANCE_GROUPS.flatMap((g) => g.pgns)
      expect(new Set(pgns).size).to.equal(pgns.length)
      expect(pgns).to.not.include(127501)
      expect(pgns).to.not.include(127245)
    })

    it('permits tank types and pressure sources the mapper can place', () => {
      const tank = N2K_INSTANCE_GROUPS.find((g) => g.id === 'tank')!
      const pressure = N2K_INSTANCE_GROUPS.find((g) => g.id === 'pressure')!
      const engine = N2K_INSTANCE_GROUPS.find((g) => g.id === 'engine')!
      expect(pressure.discriminatorCodes).to.deep.equal(range(0, 254))
      expect(tank.discriminatorCodes).to.include(0)
      expect(tank.discriminatorCodes).to.not.include(16)
      expect(engine.discriminatorCodes).to.equal(undefined)
    })
  })

  describe('deviceKeyFromCanName', () => {
    function canNameFromAddressClaim(fields: Record<string, unknown>): string {
      const mapper = new N2kMapper({}) as N2kMapper & EventEmitter
      let canName: string | undefined
      mapper.on(
        'n2kSourceMetadata',
        (_n2k: unknown, meta: { canName?: string }) => {
          canName = meta.canName
        }
      )
      mapper.toDelta(
        decode(60928, withoutUndefined(fields)) as unknown as Parameters<
          N2kMapper['toDelta']
        >[0]
      )
      if (!canName) throw new Error('mapper did not report a canName')
      return canName
    }

    const claim = {
      uniqueNumber: 656598,
      deviceInstanceLower: 0,
      deviceInstanceUpper: 0,
      deviceFunction: 130,
      spare: 0,
      deviceClass: 25,
      systemInstance: 0,
      industryGroup: 4,
      arbitraryAddressCapable: 1
    }

    it('decodes a known manufacturer from the mapper-produced NAME', () => {
      const canName = canNameFromAddressClaim({
        ...claim,
        manufacturerCode: 137
      })
      expect(deviceKeyFromCanName(canName)).to.equal('137:656598')
    })

    it('decodes an unknown manufacturer code the same way', () => {
      const canName = canNameFromAddressClaim({
        ...claim,
        manufacturerCode: 2000
      })
      expect(deviceKeyFromCanName(canName)).to.equal('2000:656598')
    })

    it('ignores instance fields, so instance edits keep the key', () => {
      const a = canNameFromAddressClaim({ ...claim, manufacturerCode: 137 })
      const b = canNameFromAddressClaim({
        ...claim,
        manufacturerCode: 137,
        deviceInstanceLower: 3,
        systemInstance: 2
      })
      expect(a).to.not.equal(b)
      expect(deviceKeyFromCanName(b)).to.equal(deviceKeyFromCanName(a))
    })

    it('decodes a NAME with fewer than 16 hex digits', () => {
      const low = (BigInt(137) << 21n) | 656598n
      const canName = ((0x1234n << 32n) | low).toString(16)
      expect(canName.length).to.be.lessThan(16)
      expect(deviceKeyFromCanName(canName)).to.equal('137:656598')
    })

    it('decodes a NAME with only the low word set', () => {
      expect(deviceKeyFromCanName(0x1234n.toString(16))).to.equal('0:4660')
    })

    it('rejects strings that are not a hex NAME', () => {
      expect(deviceKeyFromCanName('')).to.equal(undefined)
      expect(deviceKeyFromCanName('xyz')).to.equal(undefined)
      expect(deviceKeyFromCanName('1'.repeat(17))).to.equal(undefined)
    })
  })

  describe('instanceRuleKey', () => {
    it('keys a rule identity, with or without a discriminator', () => {
      expect(instanceRuleKey('engine', undefined, 0)).to.equal(
        instanceRuleKey('engine', undefined, 0)
      )
      expect(instanceRuleKey('tank', 1, 2)).to.not.equal(
        instanceRuleKey('tank', 2, 1)
      )
      expect(instanceRuleKey('battery', undefined, 12)).to.not.equal(
        instanceRuleKey('battery', 1, 2)
      )
    })
  })

  describe('isAtOrUnder', () => {
    it('matches the prefix itself and paths below it', () => {
      expect(isAtOrUnder('propulsion.main', 'propulsion.main')).to.equal(true)
      expect(
        isAtOrUnder('propulsion.main.revolutions', 'propulsion.main')
      ).to.equal(true)
    })

    it('matches on segment boundaries only', () => {
      expect(isAtOrUnder('propulsion.mainAft', 'propulsion.main')).to.equal(
        false
      )
      expect(isAtOrUnder('propulsion', 'propulsion.main')).to.equal(false)
    })
  })

  describe('instancePrefixRule', () => {
    it('splits the device key and renames target to prefix', () => {
      expect(
        instancePrefixRule('137:656598', {
          group: 'tank',
          discriminator: 1,
          instance: 2,
          target: 'tanks.freshWater.bow'
        })
      ).to.deep.equal({
        manufacturerCode: 137,
        uniqueNumber: 656598,
        group: 'tank',
        discriminator: 1,
        instance: 2,
        prefix: 'tanks.freshWater.bow'
      })
    })

    it('gives a malformed device key no device', () => {
      const rule = instancePrefixRule('137', {
        group: 'engine',
        instance: 0,
        target: 'propulsion.main'
      })
      expect(rule.manufacturerCode).to.be.NaN
      expect(rule.uniqueNumber).to.be.NaN
    })
  })

  describe('checkDeviceRules', () => {
    const DEVICE = '137:656598'
    const ENGINE = { group: 'engine', instance: 0, target: 'propulsion.main' }

    it('gives the applied rules in both forms and the problems by index', () => {
      const result = checkDeviceRules(DEVICE, [null, 'x', ENGINE])
      expect(result.rules).to.deep.equal([ENGINE])
      expect(result.prefixRules).to.deep.equal([
        instancePrefixRule(DEVICE, ENGINE)
      ])
      expect(result.problems.map((problem) => problem.index)).to.deep.equal([
        0, 1
      ])
    })

    it('reports a value that is not a list once, at index -1', () => {
      for (const value of [undefined, null, 'x', {}]) {
        const result = checkDeviceRules(DEVICE, value)
        expect(result.rules, String(value)).to.deep.equal([])
        expect(result.problems.map((problem) => problem.index)).to.deep.equal([
          -1
        ])
      }
    })
  })

  describe('applicableRules', () => {
    const DEVICE = '137:656598'
    const ENGINE = { group: 'engine', instance: 0, target: 'propulsion.main' }

    it('keeps the rules n2k-signalk applies', () => {
      expect(applicableRules(DEVICE, [ENGINE])).to.deep.equal([ENGINE])
    })

    it('drops the rules n2k-signalk rejects', () => {
      const rejected = [
        null,
        { group: 'switchBank', instance: 0, target: 'a' },
        { group: 'tank', instance: 0, target: 'a' },
        { group: 'engine', discriminator: 0, instance: 1, target: 'a' },
        { group: 'tank', discriminator: 99, instance: 0, target: 'a' },
        { group: 'battery', instance: 256, target: 'a' },
        { group: 'battery', instance: 0.5, target: 'a' },
        { group: 'battery', instance: 1, target: 42 },
        { group: 'battery', instance: 2, target: '' },
        { ...ENGINE, target: 'propulsion.duplicate' }
      ]
      expect(applicableRules(DEVICE, [ENGINE, ...rejected])).to.deep.equal([
        ENGINE
      ])
    })

    it('drops every rule of a malformed device key', () => {
      expect(applicableRules('1:99999999', [ENGINE])).to.deep.equal([])
      expect(applicableRules('x', [ENGINE])).to.deep.equal([])
      expect(applicableRules('0137:656598', [ENGINE])).to.deep.equal([])
      expect(applicableRules('2048:1', [ENGINE])).to.deep.equal([])
    })
  })
})
