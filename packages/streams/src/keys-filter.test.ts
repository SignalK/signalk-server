import { expect } from 'chai'
import KeysFilter from './keys-filter'
import { createDebugStub } from './test-helpers'

describe('KeysFilter', () => {
  it('filters out excluded paths', (done) => {
    const filter = new KeysFilter({
      excludeMatchingPaths: ['navigation.speedOverGround'],
      createDebug: createDebugStub()
    })
    const results: unknown[] = []
    filter.on('data', (d: unknown) => results.push(d))

    filter.write({
      updates: [
        {
          values: [
            { path: 'navigation.speedOverGround', value: 5 },
            { path: 'navigation.courseOverGround', value: 1.2 }
          ],
          $source: 'test'
        }
      ]
    })
    filter.end()
    filter.on('finish', () => {
      expect(results).to.have.length(1)
      const delta = results[0] as {
        updates: Array<{ values: Array<{ path: string }> }>
      }
      expect(delta.updates[0]!.values).to.have.length(1)
      expect(delta.updates[0]!.values[0]!.path).to.equal(
        'navigation.courseOverGround'
      )
      done()
    })
  })

  it('drops entire update if all values are excluded', (done) => {
    const filter = new KeysFilter({
      excludeMatchingPaths: ['navigation.speedOverGround'],
      createDebug: createDebugStub()
    })
    const results: unknown[] = []
    filter.on('data', (d: unknown) => results.push(d))

    filter.write({
      updates: [
        {
          values: [{ path: 'navigation.speedOverGround', value: 5 }],
          $source: 'test'
        }
      ]
    })
    filter.end()
    filter.on('finish', () => {
      expect(results).to.have.length(0)
      done()
    })
  })

  it('passes through deltas with no excluded paths', (done) => {
    const filter = new KeysFilter({
      excludeMatchingPaths: ['nothing.matches'],
      createDebug: createDebugStub()
    })
    const results: unknown[] = []
    filter.on('data', (d: unknown) => results.push(d))

    filter.write({
      updates: [
        {
          values: [{ path: 'navigation.speedOverGround', value: 5 }],
          $source: 'test',
          timestamp: '2024-01-01T00:00:00Z'
        }
      ]
    })
    filter.end()
    filter.on('finish', () => {
      expect(results).to.have.length(1)
      const delta = results[0] as {
        updates: Array<{ $source: string; timestamp: string }>
      }
      expect(delta.updates[0]!.$source).to.equal('test')
      expect(delta.updates[0]!.timestamp).to.equal('2024-01-01T00:00:00Z')
      done()
    })
  })

  it('handles string input (JSON)', (done) => {
    const filter = new KeysFilter({
      excludeMatchingPaths: ['a.b'],
      createDebug: createDebugStub()
    })
    const results: unknown[] = []
    filter.on('data', (d: unknown) => results.push(d))

    const json = JSON.stringify({
      updates: [{ values: [{ path: 'a.c', value: 1 }] }]
    })
    filter.write(json)
    filter.end()
    filter.on('finish', () => {
      expect(results).to.have.length(1)
      expect(typeof results[0]).to.equal('string')
      done()
    })
  })
})
