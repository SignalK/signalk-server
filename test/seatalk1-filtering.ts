import { expect } from 'chai'
import { filter } from './filter-test-helper'

describe('SeaTalk1 sentence filtering', () => {
  function seatalk1filter(command: string, input: string) {
    return filter(`^\\$STALK,${command}\\b.*`, input)
  }

  it('should filter a matching SeaTalk1 command byte', async () => {
    const result = await seatalk1filter(
      '84',
      '$STALK,84,56,FA,01,03,37,2F,1C,0B'
    )
    expect(result).to.equal('')
  })

  it('should pass through a non-matching SeaTalk1 command byte', async () => {
    const input = '$STALK,9C,01,23,45'
    const result = await seatalk1filter('84', input)
    expect(result).to.equal(input)
  })

  it('should not filter partial command byte matches', async () => {
    const input = '$STALK,84,56,FA'
    const result = await seatalk1filter('8', input)
    expect(result).to.equal(input)
  })

  it('should not filter NMEA0183 sentences', async () => {
    const nmea =
      '$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A'
    const result = await seatalk1filter('84', nmea)
    expect(result).to.equal(nmea)
  })
})
