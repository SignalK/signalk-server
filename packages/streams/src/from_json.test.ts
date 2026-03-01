import { expect } from 'chai'
import FromJson from './from_json'

describe('FromJson', () => {
  it('parses valid JSON', (done) => {
    const fromJson = new FromJson()
    const results: unknown[] = []
    fromJson.on('data', (d: unknown) => results.push(d))
    fromJson.write('{"key":"value"}')
    fromJson.end()
    fromJson.on('finish', () => {
      expect(results).to.have.length(1)
      expect(results[0]).to.deep.equal({ key: 'value' })
      done()
    })
  })

  it('handles arrays', (done) => {
    const fromJson = new FromJson()
    const results: unknown[] = []
    fromJson.on('data', (d: unknown) => results.push(d))
    fromJson.write('[1,2,3]')
    fromJson.end()
    fromJson.on('finish', () => {
      expect(results[0]).to.deep.equal([1, 2, 3])
      done()
    })
  })

  it('drops invalid JSON without error', (done) => {
    const fromJson = new FromJson()
    const results: unknown[] = []
    fromJson.on('data', (d: unknown) => results.push(d))
    fromJson.write('not json')
    fromJson.write('{"valid":true}')
    fromJson.end()
    fromJson.on('finish', () => {
      expect(results).to.have.length(1)
      expect(results[0]).to.deep.equal({ valid: true })
      done()
    })
  })

  it('handles multiple JSON objects in sequence', (done) => {
    const fromJson = new FromJson()
    const results: unknown[] = []
    fromJson.on('data', (d: unknown) => results.push(d))
    fromJson.write('{"a":1}')
    fromJson.write('{"b":2}')
    fromJson.end()
    fromJson.on('finish', () => {
      expect(results).to.have.length(2)
      expect(results[0]).to.deep.equal({ a: 1 })
      expect(results[1]).to.deep.equal({ b: 2 })
      done()
    })
  })
})
