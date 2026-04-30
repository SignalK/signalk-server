import assert from 'assert'
import { buildDeviceIdentities } from '../src/deviceIdentities'

describe('buildDeviceIdentities', () => {
  it('returns an empty list when nothing identifiable is present', () => {
    const out = buildDeviceIdentities({})
    assert.deepStrictEqual(out, [])
  })

  it('picks up a CAN Name from the subKey itself (useCanName provider)', () => {
    const sources = {
      canhat: {
        label: 'canhat',
        type: 'NMEA2000',
        c0788c00e7e04312: {
          n2k: { pgns: {} }
        }
      }
    }
    const out = buildDeviceIdentities(sources)
    assert.strictEqual(out.length, 1)
    assert.strictEqual(out[0]!.canName, 'c0788c00e7e04312')
    assert.deepStrictEqual(out[0]!.sourceRefs, ['canhat.c0788c00e7e04312'])
  })

  it('picks up a CAN Name from n2k.canName (useCanName off)', () => {
    const sources = {
      YDEN02: {
        label: 'YDEN02',
        type: 'NMEA2000',
        '159': {
          n2k: {
            pgns: {},
            canName: 'c0788c00e7e04312',
            manufacturerCode: 'Furuno',
            modelId: 'SCX-20'
          }
        }
      }
    }
    const out = buildDeviceIdentities(sources)
    assert.strictEqual(out.length, 1)
    assert.strictEqual(out[0]!.canName, 'c0788c00e7e04312')
    assert.deepStrictEqual([...out[0]!.sourceRefs].sort(), [
      'YDEN02.159',
      'YDEN02.c0788c00e7e04312'
    ])
    assert.strictEqual(out[0]!.manufacturerCode, 'Furuno')
    assert.strictEqual(out[0]!.modelId, 'SCX-20')
  })

  it('merges two providers that see the same CAN Name under different keys', () => {
    const sources = {
      YDEN02: {
        label: 'YDEN02',
        '159': {
          n2k: { pgns: {}, canName: 'c0788c00e7e04312' }
        }
      },
      '1': {
        label: '1',
        c0788c00e7e04312: {
          n2k: { pgns: {} }
        }
      }
    }
    const out = buildDeviceIdentities(sources)
    assert.strictEqual(out.length, 1)
    // YDEN02 keeps its address ref plus gains the CAN-Name form.
    // '1' is already CAN-Name-keyed so only one form is present.
    assert.deepStrictEqual([...out[0]!.sourceRefs].sort(), [
      '1.c0788c00e7e04312',
      'YDEN02.159',
      'YDEN02.c0788c00e7e04312'
    ])
  })

  it('ignores leaves without any identifying CAN Name', () => {
    const sources = {
      YDEN02: {
        '159': {
          n2k: { pgns: {}, unknownCanName: true }
        }
      }
    }
    assert.deepStrictEqual(buildDeviceIdentities(sources), [])
  })

  it('exposes both address-keyed and CAN-Name-keyed refs for a useCanName provider', () => {
    // When a provider has useCanName on, deltas can arrive with either
    // "$source: <provider>.<src>" or "$source: <provider>.<canName>"
    // depending on which path emitted them. The sources tree is still
    // keyed by src, but we want both ref forms in the identity map so
    // the UI can match whichever form the priority list stores.
    const sources = {
      YDEN02: {
        '159': {
          n2k: { pgns: {}, canName: 'c0788c00e7e04312', src: '159' }
        }
      }
    }
    const out = buildDeviceIdentities(sources)
    assert.strictEqual(out.length, 1)
    assert.deepStrictEqual([...out[0]!.sourceRefs].sort(), [
      'YDEN02.159',
      'YDEN02.c0788c00e7e04312'
    ])
  })

  it('rejects a fake canName that is not 16 lowercase hex digits', () => {
    const sources = {
      bogus: {
        SOME_NON_HEX_KEY: {
          n2k: { pgns: {}, canName: 'not-a-can-name' }
        }
      }
    }
    assert.deepStrictEqual(buildDeviceIdentities(sources), [])
  })
})
