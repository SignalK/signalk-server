import { expect } from 'chai'
import SplittingLiner from './splitting-liner'

describe('SplittingLiner', () => {
  it('splits data on newline', (done) => {
    const liner = new SplittingLiner()
    const results: string[] = []
    liner.on('data', (d: string) => results.push(d))
    liner.write('a\nb\nc')
    liner.end()
    liner.on('finish', () => {
      expect(results).to.deep.equal(['a', 'b', 'c'])
      done()
    })
  })

  it('does not buffer partial lines across chunks', (done) => {
    const liner = new SplittingLiner()
    const results: string[] = []
    liner.on('data', (d: string) => results.push(d))
    liner.write('hel')
    liner.write('lo\nworld')
    liner.end()
    liner.on('finish', () => {
      expect(results).to.deep.equal(['hel', 'lo', 'world'])
      done()
    })
  })

  it('supports custom line separator', (done) => {
    const liner = new SplittingLiner({ lineSeparator: '|' })
    const results: string[] = []
    liner.on('data', (d: string) => results.push(d))
    liner.write('a|b|c')
    liner.end()
    liner.on('finish', () => {
      expect(results).to.deep.equal(['a', 'b', 'c'])
      done()
    })
  })
})
