import { expect } from 'chai'
import WebSocket from 'ws'
import { freeport } from './ts-servertestutilities'
import { startServerP, getWriteToken } from './servertestutilities'

type AnyObject = Record<string, unknown>
type TestDelta = { context: string; updates: AnyObject[] }
type Snapshot = Map<PropertyKey, PropertyDescriptor>[]

const BUILTINS: Array<[string, object]> = [
  ['Object.prototype', Object.prototype],
  ['Object', Object],
  ['Function.prototype', Function.prototype],
  ['Object.prototype.toString', Object.prototype.toString]
]

function snapshotBuiltins(): Snapshot {
  return BUILTINS.map(
    ([, target]) =>
      new Map(
        Reflect.ownKeys(target).map((key) => [
          key,
          Object.getOwnPropertyDescriptor(target, key)!
        ])
      )
  )
}

// Returns what changed since the snapshot and puts the builtins back.
function restoreBuiltins(before: Snapshot): string[] {
  const changes: string[] = []
  BUILTINS.forEach(([name, target], i) => {
    const original = before[i]!
    for (const key of Reflect.ownKeys(target)) {
      const desc = Object.getOwnPropertyDescriptor(target, key)!
      const orig = original.get(key)
      if (!orig) {
        changes.push(`${name}.${String(key)} added`)
        Reflect.deleteProperty(target, key)
      } else if (orig.value !== desc.value || orig.get !== desc.get) {
        changes.push(`${name}.${String(key)} replaced`)
        Object.defineProperty(target, key, orig)
      }
    }
    for (const [key, orig] of original) {
      if (!Object.getOwnPropertyDescriptor(target, key)) {
        changes.push(`${name}.${String(key)} removed`)
        Object.defineProperty(target, key, orig)
      }
    }
  })
  return changes
}

function payload() {
  return {
    polluted: 'yes',
    skIsAuthenticated: true,
    skPrincipal: {
      permissions: 'admin',
      identifier: 'polluted',
      path: '',
      value: 'polluted'
    }
  }
}

function valueDelta(
  context: string,
  path: string,
  value: unknown,
  source: AnyObject = {}
): TestDelta {
  return { context, updates: [{ ...source, values: [{ path, value }] }] }
}

function sourceDelta(source: AnyObject, path = 'navigation.log'): TestDelta {
  return valueDelta('vessels.self', path, 1, source)
}

function metaDelta(context: string, path: string): TestDelta {
  return { context, updates: [{ meta: [{ path, value: { units: 'm' } }] }] }
}

const CASES: Array<[string, TestDelta[]]> = [
  [
    'context vessels.__proto__',
    [valueDelta('vessels.__proto__', '', payload())]
  ],
  [
    'context vessels.constructor',
    [valueDelta('vessels.constructor', '', payload())]
  ],
  ['context vessels.toString', [valueDelta('vessels.toString', '', payload())]],
  [
    'context __proto__.skPrincipal',
    [valueDelta('__proto__.skPrincipal', '', { permissions: 'admin' })]
  ],
  [
    'context __proto__.polluted with a path',
    [valueDelta('__proto__.polluted', 'a', 1)]
  ],
  [
    'context vessels.foo.__proto__',
    [valueDelta('vessels.foo.__proto__', '', payload())]
  ],
  ['context toString with a path', [valueDelta('toString', 'a', 1)]],
  [
    'prototype keys in an empty-path value',
    [
      valueDelta(
        'vessels.x',
        '',
        JSON.parse('{"__proto__": {}, "constructor": {}}')
      )
    ]
  ],
  ['path __proto__', [valueDelta('vessels.self', '__proto__', 1)]],
  ['path toString', [valueDelta('vessels.self', 'toString', 1)]],
  ['$source __proto__', [sourceDelta({ $source: '__proto__' })]],
  [
    '$source __proto__.polluted',
    [sourceDelta({ $source: '__proto__.polluted' })]
  ],
  [
    '$source constructor.prototype.x',
    [sourceDelta({ $source: 'constructor.prototype.x' })]
  ],
  ['$source toString', [sourceDelta({ $source: 'toString' })]],
  [
    '$source __proto__ on a multi-source path',
    [
      sourceDelta({ $source: 'multi.a' }, 'navigation.multi'),
      sourceDelta({ $source: 'multi.b' }, 'navigation.multi'),
      sourceDelta({ $source: '__proto__' }, 'navigation.multi')
    ]
  ],
  [
    'source label __proto__',
    [
      sourceDelta({
        source: {
          label: '__proto__',
          type: 'NMEA2000',
          src: 'polluted',
          pgn: 1
        }
      })
    ]
  ],
  [
    'source src __proto__',
    [
      sourceDelta({
        source: { label: 'n2k', type: 'NMEA2000', src: '__proto__', pgn: 1 }
      })
    ]
  ],
  [
    'meta under vessels.__proto__',
    [metaDelta('vessels.__proto__', 'polluted')]
  ],
  ['meta on path toString', [metaDelta('vessels.self', 'toString')]]
]

describe('Deltas with keys that resolve through the prototype chain', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let port: number
  let writer: WebSocket
  let sentinel = 0
  let baseline: Snapshot

  before(async function () {
    port = await freeport()
    server = await startServerP(port, true)
    const token = await getWriteToken(server)
    writer = new WebSocket(
      `ws://0.0.0.0:${port}/signalk/v1/stream?subscribe=none&token=${token}`
    )
    await new Promise((resolve) => writer.once('message', resolve))
    // Taken once every test file is loaded, as some install chai's `should`.
    baseline = snapshotBuiltins()
  })

  afterEach(function () {
    restoreBuiltins(baseline)
  })

  after(async function () {
    writer.close()
    await server.stop()
  })

  // A sentinel delta sent after the attack proves the attack was processed.
  async function sendAndSettle(deltas: TestDelta[]) {
    const marker = `m${++sentinel}`
    const send = (delta: object) =>
      new Promise((resolve) => writer.send(JSON.stringify(delta), resolve))
    for (const delta of deltas) {
      await send(delta)
    }
    await send(valueDelta('vessels.sentinel', 'marker', marker))
    const deadline = Date.now() + 5000
    while (
      server.app.signalk.retrieve().vessels.sentinel?.marker?.value !== marker
    ) {
      if (Date.now() > deadline) throw new Error('sentinel never arrived')
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }

  for (const [name, deltas] of CASES) {
    it(`leaves builtins unchanged for ${name}`, async function () {
      await sendAndSettle(deltas)
      expect(restoreBuiltins(baseline)).to.deep.equal([])
    })
  }

  it('keeps an unauthenticated websocket unable to write afterwards', async function () {
    await sendAndSettle([valueDelta('vessels.__proto__', '', payload())])
    const anon = new WebSocket(`ws://0.0.0.0:${port}/signalk/v1/stream`)
    await new Promise((resolve) => anon.once('message', resolve))
    await new Promise((resolve) =>
      anon.send(
        JSON.stringify(valueDelta('vessels.anon', 'marker', 'written')),
        resolve
      )
    )
    await sendAndSettle([valueDelta('vessels.sentinel', 'other', 1)])
    anon.close()
    expect(server.app.signalk.retrieve().vessels.anon).to.equal(undefined)
  })
})
