import { expect } from 'chai'
import Liner from './liner'

describe('Liner', () => {
  it('splits data into lines on newline', (done) => {
    const liner = new Liner()
    const results: string[] = []
    liner.on('data', (d: string) => results.push(d))
    liner.write('line1\nline2\nline3\n')
    liner.end()
    liner.on('finish', () => {
      expect(results).to.deep.equal(['line1', 'line2', 'line3'])
      done()
    })
  })

  it('handles partial lines across chunks', (done) => {
    const liner = new Liner()
    const results: string[] = []
    liner.on('data', (d: string) => results.push(d))
    liner.write('hel')
    liner.write('lo\nwor')
    liner.write('ld\n')
    liner.end()
    liner.on('finish', () => {
      expect(results).to.deep.equal(['hello', 'world'])
      done()
    })
  })

  it('flushes remaining data on end', (done) => {
    const liner = new Liner()
    const results: string[] = []
    liner.on('data', (d: string) => results.push(d))
    liner.write('no-newline-at-end')
    liner.end()
    liner.on('finish', () => {
      expect(results).to.deep.equal(['no-newline-at-end'])
      done()
    })
  })

  it('supports custom line separator', (done) => {
    const liner = new Liner({ lineSeparator: '\r\n' })
    const results: string[] = []
    liner.on('data', (d: string) => results.push(d))
    liner.write('a\r\nb\r\nc\r\n')
    liner.end()
    liner.on('finish', () => {
      expect(results).to.deep.equal(['a', 'b', 'c'])
      done()
    })
  })

  it('resets partial line buffer when it exceeds 2048 chars', (done) => {
    const liner = new Liner()
    const results: string[] = []
    liner.on('data', (d: string) => results.push(d))
    liner.write('x'.repeat(2100))
    liner.write('\nnormal\n')
    liner.end()
    liner.on('finish', () => {
      // Overlong partial line is discarded, leaving empty buffer.
      // Next write splits on \n starting from that empty buffer.
      expect(results).to.deep.equal(['', 'normal'])
      done()
    })
  })
})
