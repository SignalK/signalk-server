import { expect } from 'chai'
import { filter } from './filter-test-helper'

describe('NMEA0183 sentence filtering', () => {
  function nmea0183filter(sentence: string, input: string) {
    return filter(`^...${sentence}.*`, input)
  }

  it('should filter a matching NMEA0183 sentence', async () => {
    const result = await nmea0183filter(
      'RMC',
      '$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A'
    )
    expect(result).to.equal('')
  })

  it('should pass through a non-matching NMEA0183 sentence', async () => {
    const input = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M*47'
    const result = await nmea0183filter('RMC', input)
    expect(result).to.equal(input)
  })

  it('should filter regardless of talker id', async () => {
    const gp = await nmea0183filter(
      'RMC',
      '$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A'
    )
    const gn = await nmea0183filter(
      'RMC',
      '$GNRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A'
    )
    expect(gp).to.equal('')
    expect(gn).to.equal('')
  })

  it('should not filter SeaTalk1 datagrams', async () => {
    const input = '$STALK,84,56,FA,01,03,37,2F,1C,0B'
    const result = await nmea0183filter('84', input)
    expect(result).to.equal(input)
  })
})
