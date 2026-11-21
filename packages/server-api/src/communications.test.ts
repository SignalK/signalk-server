import { describe, it } from 'mocha'
import { strict as assert } from 'assert'
import {
  MessageLogEntry,
  MessageLogEntryInput,
  MessageLogStore
} from './communications'

describe('communications types', () => {
  it('an input entry is assignable and an entry carries id + disposition', () => {
    const input: MessageLogEntryInput = {
      type: 'dsc',
      priority: 'distress',
      sender: { mmsi: '316123456' },
      summary: 'DSC distress alert: MMSI 316123456',
      payload: {
        format: '12',
        category: 'distress',
        natureOfDistress: 'sinking'
      },
      raw: '$CDDSC,12,3161234560,...'
    }
    const entry: MessageLogEntry = {
      ...input,
      id: 'abc',
      receivedAt: '2026-06-25T00:00:00.000Z',
      sourceRef: 'ais.GP',
      transport: 'nmea0183',
      subject: undefined,
      position: undefined,
      notificationId: undefined,
      disposition: {}
    }
    assert.equal(entry.type, 'dsc')
    assert.equal(entry.disposition.acknowledgedAt, undefined)
  })

  it('MessageLogStore shape is implementable', () => {
    const store: Partial<MessageLogStore> = {
      append: async (e) => ({
        ...e,
        id: 'x',
        receivedAt: '2026-06-25T00:00:00.000Z',
        disposition: {}
      })
    }
    assert.equal(typeof store.append, 'function')
  })
})
