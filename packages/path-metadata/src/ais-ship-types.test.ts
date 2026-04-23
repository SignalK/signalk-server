import { expect } from 'chai'
import { getAISShipTypeName } from './ais-ship-types'

describe('getAISShipTypeName', () => {
  it('returns name for known AIS ship type ids', () => {
    expect(getAISShipTypeName(30)).to.equal('Fishing')
    expect(getAISShipTypeName(36)).to.equal('Sailing')
    expect(getAISShipTypeName(37)).to.equal('Pleasure')
    expect(getAISShipTypeName(60)).to.equal('Passenger ship')
    expect(getAISShipTypeName(80)).to.equal('Tanker')
  })

  it('returns undefined for unknown ids', () => {
    expect(getAISShipTypeName(0)).to.be.undefined
    expect(getAISShipTypeName(19)).to.be.undefined
    expect(getAISShipTypeName(999)).to.be.undefined
  })
})
