import chai from 'chai'
chai.should()


const { getToPreferredDelta } = require('../lib/deltaPriority')

describe('toPreferredDelta logic', () => {
  it('works', () => {
    const sourcePreferences = {
      'environment.wind.speedApparent': [
        {
          sourceRef: 'a',
          timeout: 0
        },
        {
          sourceRef: 'b',
          timeout: 150
        },
        {
          sourceRef: 'c',
          timeout: 150
        }
      ]
    }
    const toPreferredDelta = getToPreferredDelta(sourcePreferences, 200)


    let totalDelay = 0
    const result: any[] = []
    const expectedResult: string[] = []
    let n = 0
    function push(sourceRef: string, delay: number, shouldBeEmitted: boolean) {
      totalDelay += delay
      if (shouldBeEmitted) {
        expectedResult.push(sourceRef)
      }
      setTimeout(() => {
        result.push(toPreferredDelta({
          context: 'self',
          updates: [{
            $source: sourceRef,
            values: [{
              path: 'environment.wind.speedApparent',
              value: n++
            }]
          }]
        }, new Date(), 'self'))
      }, totalDelay)
    }

    push('a', 0, true)
    push('b', 50, false)
    push('c', 50, false)
    push('b', 100, true)
    push('a', 0, true)
    push('b', 10, false)
    push('c', 10, false)
    push('c', 150, true)
    push('b', 10, true)
    push('c', 10, false)
    push('c', 150, true)
    push('a', 10, true)
    push('b', 10, false)
    push('d', 0, false)
    push('c', 10, false)
    push('c', 150, true)
    push('d', 205, true)


    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          result
            .filter(r => r.updates[0].values.length > 0)
            .map(r => r.updates[0].$source)
            .should.eql(expectedResult)
          resolve(undefined)
        } catch (err) {
          reject(err)
        }
      }, totalDelay + 10)
    })
  })
})