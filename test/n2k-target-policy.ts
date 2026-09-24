import { expect } from 'chai'
import { getMetadata } from '@signalk/path-metadata'
import { N2K_INSTANCE_GROUPS } from '@signalk/streams/n2k-instance-groups'
import {
  ID_SLOT,
  TargetEditor,
  targetEditor,
  targetError,
  targetForm,
  ZONE_SLOT
} from '../src/n2k-target-policy'
import { validateInstanceMappings } from '../src/n2k-instance-mappings'

const SAMPLE_NAME = 'sample'
const SAMPLE_FREE_PATH = 'custom.sample.pressure'
const BUS_ADDRESS = 34
// canboat TEMPERATURE_SOURCE "Dew Point Temperature"
const DEW_POINT_SOURCE = 9
// canboat TEMPERATURE_SOURCE and HUMIDITY_SOURCE codes whose rows take any
// path: Shaft Seal, a user-defined code, and a humidity source that is
// neither inside nor outside.
const SHAFT_SEAL_SOURCE = 15
const USER_DEFINED_SOURCE = 130
const OTHER_HUMIDITY_SOURCE = 2
const DISCRIMINATOR_SAMPLES: Readonly<Record<string, readonly number[]>> = {
  temperature: [0, 3, DEW_POINT_SOURCE, SHAFT_SEAL_SOURCE, USER_DEFINED_SOURCE],
  humidity: [0, 1, OTHER_HUMIDITY_SOURCE],
  pressure: [0, 4, 7]
}

const fillSlots = (location: string) =>
  location
    .split('.')
    .map((s) => (s === ID_SLOT || s === ZONE_SLOT ? SAMPLE_NAME : s))
    .join('.')

function locationsOf(
  group: 'temperature' | 'humidity' | 'pressure',
  discriminator: number
): readonly string[] {
  const form = targetForm(group, discriminator)
  if (form.kind !== 'location') throw new Error(`${group} is ${form.kind}`)
  return form.locations
}

const unitsOf = (location: string) =>
  getMetadata(`vessels.self.${fillSlots(location)}`)?.units

// Every target the editor offers, with a name filled into each slot.
function choices(editor: TargetEditor): string[] {
  const offered = (() => {
    switch (editor.kind) {
      case 'fixed':
        return [`${editor.root}.${SAMPLE_NAME}`]
      case 'branch':
        return editor.branches.map((b) => `${b}.${SAMPLE_NAME}`)
      case 'location':
        return editor.locations.map(fillSlots)
      case 'free':
        return [SAMPLE_FREE_PATH]
    }
  })()
  const other =
    editor.kind !== 'fixed' && editor.kind !== 'free' && editor.other
      ? [SAMPLE_FREE_PATH]
      : []
  return [...offered, ...other, ...editor.unmapped]
}

describe('n2k target policy', function () {
  describe('temperature locations', function () {
    const locations = locationsOf('temperature', 0)

    it('match the spec temperature leaves', function () {
      expect(locations).to.deep.equal([
        'environment.outside.temperature',
        'environment.inside.temperature',
        'environment.inside.<zone>.temperature',
        'environment.water.temperature',
        'electrical.batteries.<id>.temperature',
        'electrical.inverters.<id>.dc.temperature',
        'electrical.chargers.<id>.temperature',
        'electrical.alternators.<id>.temperature',
        'electrical.alternators.<id>.regulatorTemperature',
        'electrical.solar.<id>.temperature',
        'electrical.solar.<id>.panelTemperature',
        'tanks.freshWater.<id>.temperature',
        'tanks.wasteWater.<id>.temperature',
        'tanks.blackWater.<id>.temperature',
        'tanks.fuel.<id>.temperature',
        'tanks.lubrication.<id>.temperature',
        'tanks.liveWell.<id>.temperature',
        'tanks.baitWell.<id>.temperature',
        'tanks.gas.<id>.temperature',
        'tanks.ballast.<id>.temperature',
        'propulsion.<id>.temperature',
        'propulsion.<id>.oilTemperature',
        'propulsion.<id>.coolantTemperature',
        'propulsion.<id>.intakeManifoldTemperature',
        'propulsion.<id>.transmission.oilTemperature',
        'propulsion.<id>.exhaustTemperature'
      ])
    })

    it('leave out derived temperatures', function () {
      for (const location of locations) {
        expect(location).to.not.match(
          /\.(dewPoint|dewPointTemperature|apparentWindChillTemperature|theoreticalWindChillTemperature|heatIndexTemperature)$/
        )
      }
    })

    it('still accept a derived-temperature row at its own path', function () {
      const editor = targetEditor(
        'temperature',
        DEW_POINT_SOURCE,
        0,
        BUS_ADDRESS
      )
      expect(editor.unmapped).to.deep.equal([
        'environment.outside.dewPointTemperature'
      ])
      expect(
        targetError(editor, 'environment.outside.dewPointTemperature')
      ).to.equal(undefined)
      const other = targetEditor('temperature', 1, 0, BUS_ADDRESS)
      expect(
        targetError(other, 'environment.outside.dewPointTemperature')
      ).to.be.a('string')
      const rule = {
        group: 'temperature' as const,
        discriminator: DEW_POINT_SOURCE,
        instance: 0,
        target: 'environment.outside.dewPointTemperature'
      }
      expect(validateInstanceMappings([rule]).ok).to.equal(true)
      expect(
        validateInstanceMappings([{ ...rule, discriminator: 1 }]).ok
      ).to.equal(false)
    })

    it('are all kelvin leaves, without alarm limits', function () {
      for (const location of locations) {
        expect(unitsOf(location), location).to.equal('K')
        expect(location).to.not.match(/\.(warn|fault|limit)[A-Z]/)
      }
    })
  })

  it('offers the spec humidity leaves', function () {
    expect(locationsOf('humidity', 0)).to.deep.equal([
      'environment.outside.humidity',
      'environment.outside.relativeHumidity',
      'environment.inside.relativeHumidity',
      'environment.inside.<zone>.relativeHumidity'
    ])
  })

  it('offers pascal leaves for atmospheric, oil and fuel pressure', function () {
    for (const source of [0, 7, 8]) {
      const locations = locationsOf('pressure', source)
      expect(locations).to.include('environment.outside.pressure')
      expect(locations).to.include('propulsion.<id>.oilPressure')
      expect(locations).to.include('propulsion.<id>.fuel.pressure')
      for (const location of locations) {
        expect(unitsOf(location), location).to.equal('Pa')
      }
    }
  })

  it('leaves other pressure sources free', function () {
    for (const source of [1, 2, 3, 4, 5, 6]) {
      expect(targetForm('pressure', source)).to.deep.equal({ kind: 'free' })
    }
  })

  it('accepts the unmapped path whatever the form', function () {
    const editor = targetEditor('acConnection', undefined, 0, BUS_ADDRESS)
    expect(editor.unmapped).to.deep.equal(['electrical.ac.34.0'])
    expect(targetError(editor, 'electrical.ac.34.0')).to.equal(undefined)
    expect(targetError(editor, 'electrical.ac.35.0')).to.be.a('string')
  })

  it('offers any other path where the spec has no place', function () {
    const other = (
      group: 'temperature' | 'humidity' | 'dcConnection' | 'converter',
      discriminator?: number
    ) => {
      const editor = targetEditor(group, discriminator, 0, BUS_ADDRESS)
      return editor.kind === 'location' || editor.kind === 'branch'
        ? editor.other === true
        : false
    }
    expect(other('temperature', USER_DEFINED_SOURCE)).to.equal(true)
    expect(other('temperature', SHAFT_SEAL_SOURCE)).to.equal(true)
    expect(other('temperature', 3)).to.equal(false)
    expect(other('humidity', OTHER_HUMIDITY_SOURCE)).to.equal(true)
    expect(other('humidity', 0)).to.equal(false)
    expect(other('humidity', 1)).to.equal(false)
    expect(other('dcConnection')).to.equal(true)
    expect(other('converter')).to.equal(true)
    expect(
      targetEditor('battery', undefined, 0, BUS_ADDRESS)
    ).to.not.have.property('other')
  })

  it('validates every choice any editor offers', function () {
    for (const group of N2K_INSTANCE_GROUPS) {
      const discriminators = group.discriminatorCodes
        ? [...group.discriminatorCodes]
        : (DISCRIMINATOR_SAMPLES[group.id] ?? [undefined])
      for (const discriminator of discriminators) {
        const editor = targetEditor(group.id, discriminator, 0, BUS_ADDRESS)
        for (const target of choices(editor)) {
          const rule = { group: group.id, discriminator, instance: 0, target }
          const result = validateInstanceMappings([rule])
          expect(
            result.ok,
            `${JSON.stringify(rule)}: ${result.ok ? '' : result.error}`
          ).to.equal(true)
        }
      }
    }
  })
})
