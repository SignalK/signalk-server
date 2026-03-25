import { expect } from 'chai'
import Replacer from './replacer'

describe('Replacer', () => {
  it('replaces matching patterns', (done) => {
    const replacer = new Replacer({ regexp: 'foo', template: 'bar' })
    const results: string[] = []
    replacer.on('data', (d: string) => results.push(d))
    replacer.write('hello foo world')
    replacer.end()
    replacer.on('finish', () => {
      expect(results).to.deep.equal(['hello bar world'])
      done()
    })
  })

  it('replaces all occurrences (global flag)', (done) => {
    const replacer = new Replacer({ regexp: 'x', template: 'y' })
    const results: string[] = []
    replacer.on('data', (d: string) => results.push(d))
    replacer.write('xaxbxc')
    replacer.end()
    replacer.on('finish', () => {
      expect(results).to.deep.equal(['yaybyc'])
      done()
    })
  })

  it('filters out empty results', (done) => {
    const replacer = new Replacer({ regexp: '^.*$', template: '' })
    const results: string[] = []
    replacer.on('data', (d: string) => results.push(d))
    replacer.write('remove me')
    replacer.end()
    replacer.on('finish', () => {
      expect(results).to.deep.equal([])
      done()
    })
  })

  it('passes through non-matching data unchanged', (done) => {
    const replacer = new Replacer({ regexp: 'NOMATCH', template: '' })
    const results: string[] = []
    replacer.on('data', (d: string) => results.push(d))
    replacer.write('keep this')
    replacer.end()
    replacer.on('finish', () => {
      expect(results).to.deep.equal(['keep this'])
      done()
    })
  })

  it('removes null characters', (done) => {
    const replacer = new Replacer({ regexp: '\u0000', template: '' })
    const results: string[] = []
    replacer.on('data', (d: string) => results.push(d))
    replacer.write('hel\u0000lo')
    replacer.end()
    replacer.on('finish', () => {
      expect(results).to.deep.equal(['hello'])
      done()
    })
  })
})
