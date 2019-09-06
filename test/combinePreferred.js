const chai = require('chai')
chai.Should()

const B = require('baconjs')

const combinePreferred = require('../lib/combinePreferred')

describe('combinePreferred logic', () => {
  it('works', () => {
    const a = new B.Bus()
    const b = new B.Bus()
    const c = new B.Bus()

    const ps = combinePreferred([
      {
        stream: a.map(() => 'a')
      },
      {
        stream: b.map(() => 'b'),
        timeout: 150
      },
      {
        stream: c.map(() => 'c'),
        timeout: 150
      }
    ])

    const acc = []
    ps.onValue(v => acc.push(v))

    let totalDelay = 0
    function push (bus, delay) {
      totalDelay += delay
      setTimeout(() => {
        bus.push('')
      }, totalDelay)
    }

    push(a, 0) // pass
    push(b, 10)
    push(c, 10)
    push(b, 150) // pass
    push(a, 0) // pass
    push(b, 10)
    push(c, 10)
    push(c, 150) // pass
    push(b, 10) // pass
    push(c, 10)
    push(c, 150)
    push(a, 10) // pass
    push(b, 10)
    push(c, 10)
    push(c, 150) // pass

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          acc.should.eql(['a', 'b', 'a', 'c', 'b', 'c', 'a', 'c'])
          resolve()
        } catch (err) {
          reject(err)
        }
      }, totalDelay + 10)
    })
  })
})
