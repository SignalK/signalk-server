import { expect } from 'chai'
import { splitPathExpression } from '../dist/api/history/index.js'

describe('splitPathExpression', () => {
  it('defaults to average for scalar paths', () => {
    expect(splitPathExpression('navigation.speedOverGround')).to.deep.equal({
      path: 'navigation.speedOverGround',
      aggregate: 'average',
      parameter: []
    })
  })

  it('honors an explicit aggregate', () => {
    expect(splitPathExpression('navigation.speedOverGround:max')).to.deep.equal(
      {
        path: 'navigation.speedOverGround',
        aggregate: 'max',
        parameter: []
      }
    )
  })

  it('parses additional parameters after the aggregate', () => {
    expect(
      splitPathExpression('navigation.speedOverGround:sma:5')
    ).to.deep.equal({
      path: 'navigation.speedOverGround',
      aggregate: 'sma',
      parameter: ['5']
    })
  })

  it('defaults navigation.position to first because it is object-valued', () => {
    expect(splitPathExpression('navigation.position')).to.deep.equal({
      path: 'navigation.position',
      aggregate: 'first',
      parameter: []
    })
  })

  it('honors an explicit aggregate on navigation.position', () => {
    expect(splitPathExpression('navigation.position:last')).to.deep.equal({
      path: 'navigation.position',
      aggregate: 'last',
      parameter: []
    })
    expect(
      splitPathExpression('navigation.position:middle_index')
    ).to.deep.equal({
      path: 'navigation.position',
      aggregate: 'middle_index',
      parameter: []
    })
  })

  it('forwards the caller choice on navigation.position even when it is questionable', () => {
    // `average` does not make sense on object-valued paths, but the parser
    // no longer second-guesses the caller. Whether the response is
    // meaningful is the provider's responsibility.
    expect(splitPathExpression('navigation.position:average')).to.deep.equal({
      path: 'navigation.position',
      aggregate: 'average',
      parameter: []
    })
  })
})
