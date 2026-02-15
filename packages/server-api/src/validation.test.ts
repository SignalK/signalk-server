import { expect } from 'chai'
import { validateDelta } from './validation'

describe('validateDelta', () => {
  it('accepts a valid delta with values', () => {
    const result = validateDelta({
      context:
        'vessels.urn:mrn:signalk:uuid:b7590868-1d62-47d9-989c-32321b349fb9',
      updates: [
        {
          timestamp: '2024-06-15T08:00:01.507Z',
          $source: 'N2000-01.115',
          values: [
            {
              path: 'navigation.speedOverGround',
              value: 3.85
            }
          ]
        }
      ]
    })
    expect(result.valid).to.be.true
    expect(result.errors).to.have.length(0)
  })

  it('accepts a delta with meta', () => {
    const result = validateDelta({
      updates: [
        {
          timestamp: '2024-06-15T08:00:00Z',
          meta: [
            {
              path: 'navigation.speedOverGround',
              value: { units: 'm/s', description: 'Speed over ground' }
            }
          ]
        }
      ]
    })
    expect(result.valid).to.be.true
  })

  it('accepts a delta with both values and meta', () => {
    const result = validateDelta({
      updates: [
        {
          timestamp: '2024-06-15T08:00:00Z',
          values: [{ path: 'navigation.speedOverGround', value: 3.85 }],
          meta: [
            {
              path: 'navigation.speedOverGround',
              value: { units: 'm/s', description: 'Speed over ground' }
            }
          ]
        }
      ]
    })
    expect(result.valid).to.be.true
  })

  it('rejects an update with neither values nor meta', () => {
    const result = validateDelta({
      updates: [{ timestamp: '2024-06-15T08:00:00Z' }]
    })
    expect(result.valid).to.be.false
  })

  it('rejects a delta without updates', () => {
    const result = validateDelta({ context: 'vessels.self' })
    expect(result.valid).to.be.false
    expect(result.errors.length).to.be.greaterThan(0)
  })

  it('rejects a non-object', () => {
    const result = validateDelta('not a delta')
    expect(result.valid).to.be.false
    expect(result.errors.length).to.be.greaterThan(0)
  })

  it('rejects null', () => {
    const result = validateDelta(null)
    expect(result.valid).to.be.false
  })
})
