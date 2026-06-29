import { strict as assert } from 'assert'
import {
  dscToMessageInput,
  registerDscAdapter
} from '../src/api/communications/dscAdapter'
import { DscCall, MessageLogEntryInput } from '@signalk/server-api'

function call(over: Partial<DscCall> = {}): DscCall {
  return {
    format: '12',
    category: 'distress',
    mmsi: '316123456',
    natureOfDistress: 'sinking',
    transport: 'nmea0183',
    summary: 'DSC distress alert: MMSI 316123456, sinking. Monitor channel 16.',
    raw: '$CDDSC,12,3161234560,...',
    sourceRef: 'ais.GP',
    ...over
  }
}

describe('dscToMessageInput', () => {
  it('maps a distress call onto the envelope', () => {
    const e = dscToMessageInput(call())
    assert.equal(e.type, 'dsc')
    assert.equal(e.priority, 'distress')
    assert.equal(e.sender.mmsi, '316123456')
    assert.equal(e.transport, 'nmea0183')
    assert.equal(e.sourceRef, 'ais.GP')
    assert.equal(e.summary, call().summary)
    assert.deepEqual(e.payload, {
      format: '12',
      category: 'distress',
      natureOfDistress: 'sinking',
      distressMmsi: undefined,
      reportedTime: undefined
    })
  })

  it('maps a routine call (category -> priority routine)', () => {
    const e = dscToMessageInput(
      call({ format: '00', category: 'routine', natureOfDistress: undefined })
    )
    assert.equal(e.priority, 'routine')
  })

  it('maps unknown category to routine priority', () => {
    const e = dscToMessageInput(call({ category: 'unknown' }))
    assert.equal(e.priority, 'routine')
  })

  it('carries position and relay subject when present', () => {
    const e = dscToMessageInput(
      call({
        position: { latitude: 48.76, longitude: -123.1 },
        distressMmsi: '316999000'
      })
    )
    assert.deepEqual(e.position, { latitude: 48.76, longitude: -123.1 })
    assert.deepEqual(e.subject, { mmsi: '316999000' })
  })
})

describe('registerDscAdapter', () => {
  it('forwards a mapped DSC call into app.logMessage', async () => {
    const logged: MessageLogEntryInput[] = []
    const handler = registerDscAdapter({
      logMessage: async (e) => {
        logged.push(e)
        return undefined as never
      }
    })
    await handler(call())
    assert.equal(logged.length, 1)
    assert.equal(logged[0].type, 'dsc')
    assert.equal(logged[0].priority, 'distress')
  })

  it('drops the call when logMessage is unavailable', async () => {
    const handler = registerDscAdapter({})
    await assert.doesNotReject(() => handler(call()))
  })
})
