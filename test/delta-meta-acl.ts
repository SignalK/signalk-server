import { expect } from 'chai'
import type { Delta } from '@signalk/server-api'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tokenSecurityFactory = require('../dist/tokensecurity.js')

const WRITER = 'writer'
const READER = 'reader'

const acls = [
  {
    context: 'vessels.self',
    resources: [
      {
        paths: ['environment.*'],
        permissions: [
          { subject: WRITER, permission: 'write' },
          { subject: 'any', permission: 'read' }
        ]
      },
      {
        paths: ['navigation.*'],
        permissions: [{ subject: WRITER, permission: 'read' }]
      }
    ]
  }
]

interface DeltaAclStrategy {
  shouldAllowWrite(
    req: { skPrincipal: { identifier: string; permissions: string } },
    delta: Delta
  ): boolean
  filterReadDelta(principal: { identifier: string }, delta: Delta): Delta | null
}

function makeStrategy(): DeltaAclStrategy {
  // setupApp() registers express routes during construction
  const noop = () => undefined
  const app = {
    config: {},
    use: noop,
    get: noop,
    post: noop,
    put: noop,
    delete: noop
  }
  return tokenSecurityFactory(app, { secretKey: 'test-key', acls })
}

const ALLOWED_PATH = 'environment.wind.speedApparent'
const DENIED_PATH = 'navigation.speedOverGround'

const meta = (path: string) => ({
  path,
  value: {
    zones: [{ lower: 0, upper: 1000, state: 'emergency', message: 'x' }]
  }
})
const value = (path: string) => ({ path, value: 1 })

const delta = (update: object): Delta =>
  ({ context: 'vessels.self', updates: [update] }) as unknown as Delta

describe('delta values and meta are both subject to ACLs', function () {
  const strategy = makeStrategy()
  const writer = {
    skPrincipal: { identifier: WRITER, permissions: 'readwrite' }
  }

  describe('shouldAllowWrite', function () {
    it('denies meta on a non-writable path next to empty values', function () {
      expect(
        strategy.shouldAllowWrite(
          writer,
          delta({ values: [], meta: [meta(DENIED_PATH)] })
        )
      ).to.equal(false)
    })

    it('denies meta on a non-writable path next to writable values', function () {
      expect(
        strategy.shouldAllowWrite(
          writer,
          delta({ values: [value(ALLOWED_PATH)], meta: [meta(DENIED_PATH)] })
        )
      ).to.equal(false)
    })

    it('denies values on a non-writable path next to writable meta', function () {
      expect(
        strategy.shouldAllowWrite(
          writer,
          delta({ values: [value(DENIED_PATH)], meta: [meta(ALLOWED_PATH)] })
        )
      ).to.equal(false)
    })

    it('allows values and meta that are all writable', function () {
      expect(
        strategy.shouldAllowWrite(
          writer,
          delta({ values: [value(ALLOWED_PATH)], meta: [meta(ALLOWED_PATH)] })
        )
      ).to.equal(true)
    })
  })

  describe('filterReadDelta', function () {
    it('filters meta in an update that also has values', function () {
      const filtered = strategy.filterReadDelta(
        { identifier: READER },
        delta({
          values: [value(ALLOWED_PATH)],
          meta: [meta(ALLOWED_PATH), meta(DENIED_PATH)]
        })
      )
      expect(filtered?.updates).to.deep.equal([
        { values: [value(ALLOWED_PATH)], meta: [meta(ALLOWED_PATH)] }
      ])
    })

    it('keeps readable meta when values is empty', function () {
      const filtered = strategy.filterReadDelta(
        { identifier: READER },
        delta({ values: [], meta: [meta(ALLOWED_PATH)] })
      )
      expect(filtered?.updates).to.deep.equal([
        { values: [], meta: [meta(ALLOWED_PATH)] }
      ])
    })

    it('drops an update with nothing readable', function () {
      expect(
        strategy.filterReadDelta(
          { identifier: READER },
          delta({ values: [value(DENIED_PATH)], meta: [meta(DENIED_PATH)] })
        )
      ).to.equal(null)
    })
  })
})
