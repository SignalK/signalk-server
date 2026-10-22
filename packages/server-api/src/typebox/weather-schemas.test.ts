import { TypeSystem } from '@sinclair/typebox/system'
import { Value } from '@sinclair/typebox/value'
import { expect } from 'chai'
import { WeatherDataModelSchema } from './weather-schemas'

// Value.Check does not know string formats unless they are registered
try {
  TypeSystem.Format('date-time', (value) => !isNaN(Date.parse(value)))
} catch {
  // already registered by a sibling test
}

const weather = (water: object) => ({
  date: '2026-01-17T09:01:00.000Z',
  type: 'observation',
  water
})

describe('WeatherDataModelSchema water.seaStateValue', () => {
  it('accepts a numeric Beaufort sea state', () => {
    expect(
      Value.Check(WeatherDataModelSchema, weather({ seaStateValue: 3 }))
    ).to.equal(true)
  })
})
