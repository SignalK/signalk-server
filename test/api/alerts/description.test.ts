import { expect } from 'chai'
import type { Path, Value } from '@signalk/server-api'
import {
  checkDescriptionBounds,
  MAX_DATA_BYTES,
  MAX_GROUP_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_REFERENCES
} from '../../../src/api/alerts/description'
import { InvalidAlertDescriptionError } from '../../../src/api/alerts/errors'

function rejectionMessage(description: {
  message: string
  group?: string
  references?: Path[]
  data?: Record<string, Value>
}): string {
  try {
    checkDescriptionBounds(description)
  } catch (error) {
    expect(error).to.be.instanceOf(InvalidAlertDescriptionError)
    return (error as InvalidAlertDescriptionError).message
  }
  expect.fail('expected the description to be refused')
}

describe('alert description bounds', () => {
  it('accepts a description within every bound', () => {
    expect(() => {
      checkDescriptionBounds({
        message: 'x'.repeat(MAX_MESSAGE_LENGTH),
        group: 'g'.repeat(MAX_GROUP_LENGTH),
        references: Array.from(
          { length: MAX_REFERENCES },
          (_unused, index) => `a.b${String(index)}` as Path
        )
      })
    }).to.not.throw()
  })

  it('refuses an oversized message, group and reference list', () => {
    expect(
      rejectionMessage({ message: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) })
    ).to.contain('message')
    expect(
      rejectionMessage({
        message: 'ok',
        group: 'g'.repeat(MAX_GROUP_LENGTH + 1)
      })
    ).to.contain('group')
    expect(
      rejectionMessage({
        message: 'ok',
        references: Array.from(
          { length: MAX_REFERENCES + 1 },
          (_unused, index) => `a.b${String(index)}` as Path
        )
      })
    ).to.contain('paths')
  })

  it('measures the data payload in serialized bytes, not code units', () => {
    // Each of these is one UTF-16 code unit and three UTF-8 bytes, so a
    // length-based check would admit roughly three times the stated bound.
    const multiByte = '€'.repeat(MAX_DATA_BYTES / 2)
    const data: Record<string, Value> = { note: multiByte }

    expect(JSON.stringify(data).length).to.be.below(MAX_DATA_BYTES)
    expect(Buffer.byteLength(JSON.stringify(data), 'utf8')).to.be.above(
      MAX_DATA_BYTES
    )
    expect(rejectionMessage({ message: 'ok', data })).to.contain('bytes')
  })

  it('accepts a data payload just inside the byte bound', () => {
    const data: Record<string, Value> = {
      note: 'a'.repeat(MAX_DATA_BYTES - 20)
    }

    expect(Buffer.byteLength(JSON.stringify(data), 'utf8')).to.be.at.most(
      MAX_DATA_BYTES
    )
    expect(() => {
      checkDescriptionBounds({ message: 'ok', data })
    }).to.not.throw()
  })
})
