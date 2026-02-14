import { expect } from 'chai'
import { getAtonTypeName } from './aton-types'

describe('getAtonTypeName', () => {
  it('returns name for known AtoN type ids', () => {
    expect(getAtonTypeName(1)).to.equal('Reference Point')
    expect(getAtonTypeName(2)).to.equal('RACON')
    expect(getAtonTypeName(9)).to.equal('Beacon, Cardinal N')
    expect(getAtonTypeName(20)).to.equal('Cardinal Mark N')
    expect(getAtonTypeName(31)).to.equal('Light Vessel/LANBY/Rigs')
  })

  it('returns undefined for unknown ids', () => {
    expect(getAtonTypeName(0)).to.be.undefined
    expect(getAtonTypeName(32)).to.be.undefined
    expect(getAtonTypeName(999)).to.be.undefined
  })
})
