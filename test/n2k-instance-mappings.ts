import chai, { expect } from 'chai'
import _ from 'lodash'
import { Request, Response } from 'express'
import {
  findDeviceSourceRefs,
  isDeviceKey,
  mappedSourceRefs,
  N2kInstanceMappingsApp,
  prunePrefixes,
  registerN2kInstanceMappingRoutes,
  validateInstanceMappings
} from '../src/n2k-instance-mappings'
import type {
  N2kInstanceMappings,
  N2kInstanceRule
} from '@signalk/streams/n2k-instance-groups'
import { freeport } from './ts-servertestutilities'
import { FORBIDDEN_PATH_KEYS } from '@signalk/server-api'
import { FORBIDDEN_TARGET_SEGMENTS } from '../src/n2k-target-policy'
import { FromPgn, pgnToActisenseSerialFormat } from '@canboat/canboatjs'
import {
  startServerP,
  getAdminToken,
  getReadOnlyToken
} from './servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(chai as any).Should()

// Low 32 bits of the NAME carry the manufacturer code and unique number.
const CAN_NAME_A = 'c0788c00112a04d6' // 137:656598
const CAN_NAME_B = 'c0788c0022603039' // 275:12345
const DEVICE_A = '137:656598'
const DEVICE_B = '275:12345'

function expectRejected(body: unknown, messagePart?: RegExp) {
  const result = validateInstanceMappings(body)
  expect(result.ok, JSON.stringify(body)).to.equal(false)
  if (!result.ok && messagePart) {
    expect(result.error).to.match(messagePart)
  }
}

function expectAccepted(body: unknown): N2kInstanceRule[] {
  const result = validateInstanceMappings(body)
  if (!result.ok) {
    throw new Error(`expected acceptance, got: ${result.error}`)
  }
  return result.value
}

describe('n2k instance mappings', function () {
  describe('isDeviceKey', function () {
    it('accepts <manufacturer code>:<unique number>', function () {
      isDeviceKey(DEVICE_A).should.equal(true)
    })

    it('rejects anything else, including __proto__', function () {
      for (const key of ['__proto__', 'abc', '', '1:2:3', '1:', ':1', '1']) {
        isDeviceKey(key).should.equal(false, key)
      }
    })
  })

  describe('validateInstanceMappings', function () {
    it('accepts a valid rule', function () {
      expectAccepted([
        { group: 'engine', instance: 0, target: 'propulsion.main' }
      ]).should.deep.equal([
        { group: 'engine', instance: 0, target: 'propulsion.main' }
      ])
    })

    it('rejects a body that is not an array of rules', function () {
      expectRejected({ group: 'engine', instance: 0, target: 'a' })
      expectRejected([{ group: 'engine', instance: 0 }])
      expectRejected([
        { group: 'engine', instance: 0, target: 'propulsion.main', extra: 1 }
      ])
    })

    it('rejects targets outside the path grammar', function () {
      for (const target of [
        'propulsion/main',
        'propulsion..main',
        '.propulsion',
        'propulsion.',
        '',
        'propulsion.ma-in',
        'a.b.c.d.e.f.g.h.i',
        'a'.repeat(129)
      ]) {
        expectRejected([{ group: 'engine', instance: 0, target }])
      }
    })

    it('rejects a target under notifications', function () {
      expectRejected(
        [{ group: 'engine', instance: 0, target: 'notifications.engine' }],
        /notifications/
      )
    })

    it('rejects target segments that reach the object prototype', function () {
      for (const target of [
        'constructor.x',
        'propulsion.prototype',
        'a.constructor.b'
      ]) {
        expectRejected([{ group: 'engine', instance: 0, target }], /target/)
      }
    })

    it('drops a rule whose target is its own unmapped path', function () {
      expectAccepted([
        { group: 'engine', instance: 0, target: 'propulsion.port' },
        { group: 'engine', instance: 1, target: 'propulsion.aux' }
      ]).should.deep.equal([
        { group: 'engine', instance: 1, target: 'propulsion.aux' }
      ])
    })

    it('rejects an unknown group', function () {
      expectRejected(
        [{ group: 'switchBank', instance: 0, target: 'electrical.main' }],
        /group/
      )
    })

    it('rejects a discriminator code outside the group', function () {
      expectRejected(
        [
          {
            group: 'pressure',
            discriminator: 20,
            instance: 0,
            target: 'environment.foo.pressure'
          }
        ],
        /discriminator/
      )
    })

    it('requires a discriminator exactly where the group has one', function () {
      expectRejected(
        [{ group: 'tank', instance: 0, target: 'tanks.fuel.day' }],
        /discriminator/
      )
      expectRejected(
        [
          {
            group: 'battery',
            discriminator: 0,
            instance: 0,
            target: 'electrical.batteries.house'
          }
        ],
        /discriminator/
      )
    })

    it('rejects an instance outside the group range', function () {
      expectRejected([
        { group: 'battery', instance: 256, target: 'electrical.batteries.x' }
      ])
      expectRejected([
        { group: 'tank', discriminator: 0, instance: 16, target: 'tanks.x' }
      ])
      expectRejected([
        { group: 'battery', instance: 1.5, target: 'electrical.batteries.x' }
      ])
    })

    it('rejects two rules for the same instance', function () {
      expectRejected(
        [
          { group: 'engine', instance: 0, target: 'propulsion.main' },
          { group: 'engine', instance: 0, target: 'propulsion.aux' }
        ],
        /more than one rule/
      )
    })

    it('rejects equal targets within a device', function () {
      expectRejected(
        [
          { group: 'engine', instance: 0, target: 'propulsion.main' },
          { group: 'engine', instance: 1, target: 'propulsion.main' }
        ],
        /overlaps/
      )
    })

    it('rejects equal multi-leaf targets across groups', function () {
      expectRejected(
        [
          {
            group: 'battery',
            instance: 0,
            target: 'electrical.batteries.house'
          },
          {
            group: 'dcConnection',
            instance: 0,
            target: 'electrical.batteries.house'
          }
        ],
        /overlaps/
      )
    })

    it('rejects equal single-leaf targets', function () {
      expectRejected(
        [
          {
            group: 'temperature',
            discriminator: 0,
            instance: 0,
            target: 'environment.inside.saloon.temperature'
          },
          {
            group: 'temperature',
            discriminator: 4,
            instance: 0,
            target: 'environment.inside.saloon.temperature'
          }
        ],
        /overlaps/
      )
    })

    it('accepts a single-leaf target under a multi-leaf target', function () {
      expectAccepted([
        { group: 'engine', instance: 0, target: 'propulsion.main' },
        {
          group: 'temperature',
          discriminator: 14,
          instance: 0,
          target: 'propulsion.main.exhaustTemperature'
        }
      ])
    })

    it('treats nesting on segment boundaries only', function () {
      expectAccepted([
        { group: 'engine', instance: 0, target: 'propulsion.main' },
        { group: 'engine', instance: 1, target: 'propulsion.mainAux' }
      ])
    })

    it("accepts a target on another instance's unmapped path", function () {
      expectAccepted([
        { group: 'battery', instance: 0, target: 'electrical.batteries.1' }
      ])
    })

    it("accepts Inside 0 on Main Cabin's unmapped path", function () {
      expectAccepted([
        {
          group: 'temperature',
          discriminator: 2,
          instance: 0,
          target: 'environment.inside.mainCabin.temperature'
        }
      ])
    })

    it("accepts Engine Room 1 on Outside's unmapped path", function () {
      expectAccepted([
        {
          group: 'temperature',
          discriminator: 3,
          instance: 1,
          target: 'environment.outside.temperature'
        }
      ])
    })

    it("accepts a target on another group's unmapped path", function () {
      expectAccepted([
        { group: 'dcConnection', instance: 0, target: 'electrical.batteries.0' }
      ])
    })

    it('accepts a swap when the displaced instance is mapped too', function () {
      expectAccepted([
        { group: 'battery', instance: 0, target: 'electrical.batteries.1' },
        { group: 'battery', instance: 1, target: 'electrical.batteries.house' }
      ])
    })

    it('accepts an engine swap', function () {
      expectAccepted([
        { group: 'engine', instance: 0, target: 'propulsion.starboard' },
        { group: 'engine', instance: 1, target: 'propulsion.port' }
      ])
    })

    it('accepts an Inside temperature swap', function () {
      expectAccepted([
        {
          group: 'temperature',
          discriminator: 2,
          instance: 0,
          target: 'environment.inside.1.temperature'
        },
        {
          group: 'temperature',
          discriminator: 2,
          instance: 1,
          target: 'environment.inside.0.temperature'
        }
      ])
    })

    it('accepts a battery swap', function () {
      expectAccepted([
        { group: 'battery', instance: 0, target: 'electrical.batteries.1' },
        { group: 'battery', instance: 1, target: 'electrical.batteries.0' }
      ])
    })

    it('names the instances whose targets overlap in user terms', function () {
      const result = validateInstanceMappings([
        {
          group: 'temperature',
          discriminator: 2,
          instance: 0,
          target: 'environment.inside.saloon.temperature'
        },
        {
          group: 'temperature',
          discriminator: 4,
          instance: 0,
          target: 'environment.inside.saloon.temperature'
        }
      ])
      expect(result.ok).to.equal(false)
      if (!result.ok) {
        expect(result.error).to.match(
          /^Temperature Main Cabin Temperature instance 0: /
        )
        expect(result.error).to.match(
          /of Temperature Inside Temperature instance 0$/
        )
        expect(result.error).to.not.match(/rules\[/)
      }
    })

    it('drops a single-leaf rule whose target is its own unmapped path', function () {
      expectAccepted([
        {
          group: 'temperature',
          discriminator: 3,
          instance: 1,
          target: 'environment.inside.engineRoom.temperature'
        }
      ]).should.deep.equal([])
    })

    it('treats an address-bearing unmapped path at any bus address as no rule', function () {
      // electrical.ac.<src>.<connection>: the device may sit at address 7.
      expectAccepted([
        { group: 'acConnection', instance: 1, target: 'electrical.ac.7.1' }
      ]).should.deep.equal([])
      expectRejected(
        [{ group: 'acConnection', instance: 1, target: 'electrical.ac.7.2' }],
        /electrical.ac/
      )
    })

    describe('per-group target policy', function () {
      const accepts = (rule: object) => expectAccepted([rule])
      const rejects = (rule: object) => expectRejected([rule], /target must/)

      it('takes <id> under the fixed root for batteries', function () {
        accepts({
          group: 'battery',
          instance: 0,
          target: 'electrical.batteries.house'
        })
        rejects({ group: 'battery', instance: 0, target: 'electrical.house' })
        rejects({
          group: 'battery',
          instance: 0,
          target: 'electrical.batteries.house.aft'
        })
      })

      it('takes propulsion or generator for engines', function () {
        accepts({ group: 'engine', instance: 0, target: 'generator.genset' })
        rejects({ group: 'engine', instance: 0, target: 'generator.gen.set' })
      })

      it('takes a DC source branch for DC connections', function () {
        accepts({
          group: 'dcConnection',
          instance: 0,
          target: 'electrical.alternators.main'
        })
        accepts({
          group: 'dcConnection',
          instance: 0,
          target: 'electrical.windGenerators.aft'
        })
        rejects({
          group: 'battery',
          instance: 0,
          target: 'electrical.windGenerators.aft'
        })
      })

      it('takes any path for temperature sources without a spec leaf', function () {
        // A user-defined source code, written under generic.temperatures.
        const custom = { group: 'temperature', discriminator: 130, instance: 0 }
        accepts({ ...custom, target: 'propulsion.main.wetExhaustTemperature' })
        accepts({ ...custom, target: 'environment.outside.temperature' })
        const shaftSeal = {
          group: 'temperature',
          discriminator: 15,
          instance: 0
        }
        accepts({
          ...shaftSeal,
          target: 'propulsion.main.shaftSealTemperature'
        })
        const engineRoom = {
          group: 'temperature',
          discriminator: 3,
          instance: 0
        }
        rejects({
          ...engineRoom,
          target: 'propulsion.main.wetExhaustTemperature'
        })
      })

      it('takes any path for humidity other than inside and outside', function () {
        const target = 'environment.forepeak.humidity'
        accepts({ group: 'humidity', discriminator: 2, instance: 0, target })
        rejects({ group: 'humidity', discriminator: 0, instance: 0, target })
      })

      it('holds any other path to the target grammar', function () {
        const custom = { group: 'temperature', discriminator: 130, instance: 0 }
        expectRejected(
          [{ ...custom, target: 'notifications.custom.temperature' }],
          /notifications/
        )
        expectRejected(
          [{ ...custom, target: 'a.b.c.d.e.f.g.h.i' }],
          /dot-separated/
        )
        expectRejected(
          [
            {
              group: 'dcConnection',
              instance: 0,
              target: 'electrical.a.b.c.d.e.f.g.h'
            }
          ],
          /dot-separated/
        )
      })

      it('takes a spec location with a named zone for temperature', function () {
        accepts({
          group: 'temperature',
          discriminator: 2,
          instance: 0,
          target: 'environment.inside.saloon.temperature'
        })
        rejects({
          group: 'temperature',
          discriminator: 2,
          instance: 0,
          target: 'environment.inside.saloon.aft.temperature'
        })
      })

      it('takes a spec location for oil pressure, any path for hydraulic', function () {
        accepts({
          group: 'pressure',
          discriminator: 7,
          instance: 0,
          target: 'propulsion.main.oilPressure'
        })
        rejects({
          group: 'pressure',
          discriminator: 7,
          instance: 0,
          target: 'oil.main.pressure'
        })
        accepts({
          group: 'pressure',
          discriminator: 4,
          instance: 0,
          target: 'steering.hydraulic.pressure'
        })
      })

      it('lets a tank change its type', function () {
        accepts({
          group: 'tank',
          discriminator: 0,
          instance: 0,
          target: 'tanks.freshWater.aft'
        })
      })

      it('rejects two batteries on one target', function () {
        expectRejected(
          [
            {
              group: 'battery',
              instance: 0,
              target: 'electrical.batteries.house'
            },
            {
              group: 'battery',
              instance: 1,
              target: 'electrical.batteries.house'
            }
          ],
          /overlaps/
        )
      })

      it('rejects a charger outside its root', function () {
        expectRejected([
          {
            group: 'battery',
            instance: 0,
            target: 'electrical.batteries.house'
          },
          {
            group: 'charger',
            instance: 0,
            target: 'electrical.batteries.house.x'
          }
        ])
      })

      it('rejects any rudder rule', function () {
        expectRejected(
          [{ group: 'rudder', instance: 0, target: 'steering.rudderAngle' }],
          /unknown group/
        )
      })
    })

    it('rejects more than 64 rules', function () {
      const rules = Array.from({ length: 65 }, (_unused, i) => ({
        group: 'battery',
        instance: i,
        target: `electrical.batteries.bank${i}`
      }))
      expectRejected(rules)
      expectAccepted(rules.slice(0, 64))
    })
  })

  describe('prunePrefixes', function () {
    const engineMain: N2kInstanceRule = {
      group: 'engine',
      instance: 0,
      target: 'propulsion.main'
    }

    it("prunes an added rule's default prefixes", function () {
      prunePrefixes([], [engineMain], 5).should.deep.equal([
        'propulsion.port',
        'notifications.propulsion.port'
      ])
    })

    it('prunes the old target of a changed rule', function () {
      prunePrefixes(
        [engineMain],
        [{ ...engineMain, target: 'propulsion.aux' }],
        5
      ).should.deep.equal(['propulsion.main', 'notifications.propulsion.main'])
    })

    it('prunes the old target of a removed rule', function () {
      prunePrefixes([engineMain], [], 5).should.deep.equal([
        'propulsion.main',
        'notifications.propulsion.main'
      ])
    })

    it('prunes nothing for unchanged rules', function () {
      prunePrefixes([engineMain], [{ ...engineMain }], 5).should.deep.equal([])
    })

    it('keeps a target that a rule for another instance still writes', function () {
      prunePrefixes(
        [engineMain],
        [{ ...engineMain, instance: 1 }],
        5
      ).should.deep.equal([
        'propulsion.starboard',
        'notifications.propulsion.starboard'
      ])
    })

    it("uses the source's address for address-bearing defaults", function () {
      prunePrefixes(
        [],
        [{ group: 'dcConnection', instance: 1, target: 'electrical.dc.house' }],
        7
      ).should.deep.equal([
        'electrical.dc.7.1',
        'notifications.electrical.dc.7.1'
      ])
    })
  })

  describe('findDeviceSourceRefs', function () {
    const sources = {
      can0: {
        label: 'can0',
        type: 'NMEA2000',
        '5': { n2k: { src: '5', canName: CAN_NAME_A } },
        '6': { n2k: { src: '6', canName: CAN_NAME_B } }
      },
      can1: {
        '9': { n2k: { src: '9', canName: CAN_NAME_A } }
      }
    }

    it('lists canName and address refs of the device on every connection', function () {
      _.sortBy(
        findDeviceSourceRefs(DEVICE_A, sources, {}),
        'ref'
      ).should.deep.equal([
        { ref: 'can0.5', src: 5 },
        { ref: `can0.${CAN_NAME_A}`, src: 5 },
        { ref: 'can1.9', src: 9 },
        { ref: `can1.${CAN_NAME_A}`, src: 9 }
      ])
    })

    it('falls back to source deltas when the sources tree lacks the device', function () {
      findDeviceSourceRefs(DEVICE_B, undefined, {
        'can0.6': {
          updates: [
            { source: { label: 'can0', src: '6', canName: CAN_NAME_B } }
          ]
        }
      }).should.deep.equal([
        { ref: `can0.${CAN_NAME_B}`, src: 6 },
        { ref: 'can0.6', src: 6 }
      ])
    })

    it('returns nothing for a device that is not present', function () {
      findDeviceSourceRefs('1:1', sources, {}).should.deep.equal([])
    })
  })

  describe('mappedSourceRefs', function () {
    const sources = {
      can0: {
        '5': { n2k: { src: '5', canName: CAN_NAME_A } },
        '6': { n2k: { src: '6', canName: CAN_NAME_B } }
      }
    }
    const rules: N2kInstanceRule[] = [
      { group: 'engine', instance: 0, target: 'propulsion.main' }
    ]

    it("maps every ref of a device with rules to the device's rules", function () {
      const mapped = mappedSourceRefs({ [DEVICE_A]: rules }, sources, {})
      _.sortBy([...mapped.keys()]).should.deep.equal([
        'can0.5',
        `can0.${CAN_NAME_A}`
      ])
      mapped.get('can0.5')!.should.deep.equal({ rules, src: 5 })
    })

    it('is empty without mappings', function () {
      mappedSourceRefs(undefined, sources, {}).size.should.equal(0)
      mappedSourceRefs({}, sources, {}).size.should.equal(0)
    })
  })

  describe('route handlers', function () {
    type Handler = (req: Request, res: Response) => void

    interface FakeResponse {
      statusCode: number
      body: unknown
    }

    function fakeApp(writeError?: Error) {
      const handlers: Record<string, Handler> = {}
      const events: Array<{ type: string; data: unknown }> = []
      const removed: Array<{ ref: string; prefixes?: readonly string[] }> = []
      const app: N2kInstanceMappingsApp = {
        config: { settings: {} },
        securityStrategy: { addAdminMiddleware: () => undefined },
        get: (path: string, handler: Handler) => {
          handlers[`GET ${path}`] = handler
        },
        put: (path: string, handler: Handler) => {
          handlers[`PUT ${path}`] = handler
        },
        emit: (_event: string, ...args: unknown[]) => {
          events.push(args[0] as { type: string; data: unknown })
          return true
        },
        signalk: {
          sources: {
            can0: { '5': { n2k: { src: '5', canName: CAN_NAME_A } } }
          }
        },
        deltaCache: {
          sourceDeltas: {},
          removeSource: (ref: string, prefixes?: readonly string[]) => {
            removed.push({ ref, prefixes })
          }
        }
      }
      registerN2kInstanceMappingRoutes(app, (_settings, cb) => cb(writeError))
      const call = (method: 'GET' | 'PUT', deviceKey: string, body?: unknown) =>
        new Promise<FakeResponse>((resolve) => {
          const out: FakeResponse = { statusCode: 200, body: undefined }
          const res = {
            status(code: number) {
              out.statusCode = code
              return res
            },
            json(payload: unknown) {
              out.body = payload
              resolve(out)
              return res
            }
          }
          handlers[`${method} /skServer/n2kInstanceMappings/:deviceKey`](
            { params: { deviceKey }, body } as unknown as Request,
            res as unknown as Response
          )
        })
      return { app, events, removed, call }
    }

    const rules = [{ group: 'engine', instance: 0, target: 'propulsion.main' }]

    it('stores rules, emits the full mappings, then prunes', async function () {
      const { app, events, removed, call } = fakeApp()
      const res = await call('PUT', DEVICE_A, rules)
      res.statusCode.should.equal(200)
      const stored = app.config.settings
        .n2kInstanceMappings as N2kInstanceMappings
      stored.should.deep.equal({ [DEVICE_A]: rules })
      events.should.deep.equal([
        { type: 'N2KINSTANCEMAPPINGS', data: { [DEVICE_A]: rules } }
      ])
      _.sortBy(removed, 'ref').should.deep.equal([
        {
          ref: 'can0.5',
          prefixes: ['propulsion.port', 'notifications.propulsion.port']
        },
        {
          ref: `can0.${CAN_NAME_A}`,
          prefixes: ['propulsion.port', 'notifications.propulsion.port']
        }
      ])
      ;(await call('GET', DEVICE_A)).body!.should.deep.equal(rules)
    })

    it('drops the device entry when its list becomes empty', async function () {
      const { app, call } = fakeApp()
      await call('PUT', DEVICE_A, rules)
      ;(await call('PUT', DEVICE_A, [])).statusCode.should.equal(200)
      app.config.settings.n2kInstanceMappings!.should.deep.equal({})
      ;(await call('GET', DEVICE_A)).body!.should.deep.equal([])
    })

    it('leaves settings unchanged and emits nothing when the write fails', async function () {
      const { app, events, removed, call } = fakeApp(new Error('disk full'))
      const before = app.config.settings
      const res = await call('PUT', DEVICE_A, rules)
      res.statusCode.should.equal(500)
      app.config.settings.should.equal(before)
      expect(app.config.settings.n2kInstanceMappings).to.equal(undefined)
      events.should.deep.equal([])
      removed.should.deep.equal([])
    })

    it('stores rules as an object when the stored mappings are an array', async function () {
      const { app, call } = fakeApp()
      app.config.settings.n2kInstanceMappings =
        [] as unknown as N2kInstanceMappings
      ;(await call('PUT', DEVICE_A, rules)).statusCode.should.equal(200)
      const persisted = JSON.parse(JSON.stringify(app.config.settings))
      persisted.n2kInstanceMappings.should.deep.equal({ [DEVICE_A]: rules })
    })

    it('answers 400 for a target segment that reaches the object prototype', async function () {
      const { call } = fakeApp()
      const res = await call('PUT', DEVICE_A, [
        { group: 'engine', instance: 0, target: 'constructor.x' }
      ])
      res.statusCode.should.equal(400)
    })

    it('rejects an invalid device key on GET and PUT', async function () {
      const { call } = fakeApp()
      ;(await call('GET', '__proto__')).statusCode.should.equal(400)
      ;(await call('PUT', '__proto__', rules)).statusCode.should.equal(400)
      ;(await call('PUT', 'abc', rules)).statusCode.should.equal(400)
    })
  })

  describe('REST routes on a running server', function () {
    let url: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let server: any
    let adminToken: string
    let readToken: string
    const PROVIDER = 'mappingTestN2k'

    before(async function () {
      const port = await freeport()
      url = `http://0.0.0.0:${port}`
      server = await startServerP(port, true)
      adminToken = await getAdminToken(server)
      readToken = await getReadOnlyToken(server)
    })

    after(async function () {
      await server.stop()
    })

    function request(
      method: string,
      deviceKey: string,
      token?: string,
      body?: unknown
    ) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      if (token) headers.Cookie = `JAUTHENTICATION=${token}`
      return fetch(`${url}/skServer/n2kInstanceMappings/${deviceKey}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    }

    const rules = [{ group: 'engine', instance: 0, target: 'propulsion.main' }]

    it('rejects unauthenticated and read-only users', async function () {
      for (const token of [undefined, readToken]) {
        ;(await request('GET', DEVICE_A, token)).status.should.equal(401)
        ;(await request('PUT', DEVICE_A, token, rules)).status.should.equal(401)
      }
    })

    it('persists a PUT, emits N2KINSTANCEMAPPINGS and serves it on GET', async function () {
      const events: Array<{ type: string; data: unknown }> = []
      const onEvent = (e: { type: string; data: unknown }) => events.push(e)
      server.app.on('serverAdminEvent', onEvent)
      try {
        const res = await request('PUT', DEVICE_B, adminToken, rules)
        res.status.should.equal(200)
      } finally {
        server.app.removeListener('serverAdminEvent', onEvent)
      }
      const event = events.find((e) => e.type === 'N2KINSTANCEMAPPINGS')
      expect(event, 'N2KINSTANCEMAPPINGS emitted').to.not.equal(undefined)
      ;(event!.data as N2kInstanceMappings)[DEVICE_B].should.deep.equal(rules)
      server.app.config.settings.n2kInstanceMappings[
        DEVICE_B
      ].should.deep.equal(rules)
      const get = await request('GET', DEVICE_B, adminToken)
      get.status.should.equal(200)
      ;(await get.json()).should.deep.equal(rules)
    })

    it('returns an empty list for a device without rules', async function () {
      const get = await request('GET', '1:1', adminToken)
      get.status.should.equal(200)
      ;(await get.json()).should.deep.equal([])
    })

    it('accepts rules for a device that is not on the bus', async function () {
      ;(await request('PUT', '999:42', adminToken, rules)).status.should.equal(
        200
      )
    })

    it('answers 400 with a FAILED body for invalid input', async function () {
      const badKey = await request('PUT', 'abc', adminToken, rules)
      badKey.status.should.equal(400)
      const badBody = await request('PUT', DEVICE_A, adminToken, [
        { group: 'engine', instance: 0, target: 'generator.gen.set' }
      ])
      badBody.status.should.equal(400)
      ;(await badBody.json()).should.have.property('state', 'FAILED')
    })

    it("prunes the device's cached default-path leaves but not another device's", async function () {
      const selfParts = server.app.selfContext.split('.')
      const refA = `${PROVIDER}.${CAN_NAME_A}`
      const refB = `${PROVIDER}.${CAN_NAME_B}`
      const sendEngine = (src: string, canName: string) =>
        server.app.handleMessage(PROVIDER, {
          context: server.app.selfContext,
          updates: [
            {
              source: {
                label: PROVIDER,
                type: 'NMEA2000',
                pgn: 127488,
                src,
                canName
              },
              timestamp: new Date().toISOString(),
              values: [{ path: 'propulsion.port.revolutions', value: 20 }]
            }
          ]
        })
      const cacheHas = (ref: string) =>
        _.get(server.app.deltaCache.cache, [
          ...selfParts,
          'propulsion',
          'port',
          'revolutions',
          ref
        ]) !== undefined
      sendEngine('5', CAN_NAME_A)
      sendEngine('6', CAN_NAME_B)
      const deadline = Date.now() + 2000
      while (!(cacheHas(refA) && cacheHas(refB))) {
        if (Date.now() > deadline) throw new Error('deltas never cached')
        await new Promise((resolve) => setTimeout(resolve, 25))
      }

      ;(await request('PUT', DEVICE_A, adminToken, rules)).status.should.equal(
        200
      )

      cacheHas(refA).should.equal(false)
      cacheHas(refB).should.equal(true)
    })
  })

  // The rule applies in the real conversion stream: frames posted as decoded
  // canboat JSON run through the n2k-signalk pipe element into the server.
  describe('NMEA 2000 provider pipeline', function () {
    // Two of the discovery interface's 5 s status ticks.
    const STATUS_PUSH_WAIT_MS = 11_000
    const PROVIDER = 'n2kPipe'
    const ENGINE_SRC = 50
    const OTHER_SRC = 51
    const refA = `${PROVIDER}.${ENGINE_SRC}`
    const refB = `${PROVIDER}.${OTHER_SRC}`
    const parser = new FromPgn({})
    let url: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let server: any
    let adminToken: string
    type Instances = Record<string, Record<string, number[]>>
    const pushedInstances: Instances[] = []
    const onAdminEvent = (e: {
      type: string
      data: { pgnDataInstances: Instances }
    }) => {
      if (e.type === 'N2KDEVICESTATUS') {
        pushedInstances.push(e.data.pgnDataInstances)
      }
    }

    before(async function () {
      const port = await freeport()
      url = `http://0.0.0.0:${port}`
      server = await startServerP(port, true, {
        settings: {
          pipedProviders: [
            {
              id: PROVIDER,
              pipeElements: [
                { type: '../test/httpprovider' },
                { type: 'providers/n2k-signalk' }
              ]
            }
          ]
        }
      })
      adminToken = await getAdminToken(server)
      server.app.on('serverAdminEvent', onAdminEvent)
    })

    after(async function () {
      server.app.removeListener('serverAdminEvent', onAdminEvent)
      await server.stop()
    })

    function frame(pgn: number, src: number, fields: Record<string, unknown>) {
      const encoded = pgnToActisenseSerialFormat({
        pgn,
        src,
        dst: 255,
        prio: 2,
        fields
      } as unknown as Parameters<typeof pgnToActisenseSerialFormat>[0])
      const decoded: unknown = parser.parseString(encoded!)
      if (!decoded) throw new Error(`canboat could not decode PGN ${pgn}`)
      return decoded
    }

    const addressClaim = (src: number, manufacturerCode: number) =>
      frame(60928, src, {
        uniqueNumber: 656598,
        manufacturerCode,
        deviceInstanceLower: 0,
        deviceInstanceUpper: 0,
        deviceFunction: 140,
        deviceClass: 50,
        systemInstance: 0,
        industryGroup: 4,
        arbitraryAddressCapable: 1
      })
    const engine = (src: number) =>
      frame(127488, src, { instance: 0, speed: 1000 })
    const battery = (src: number) =>
      frame(127508, src, { instance: 3, voltage: 12.5 })

    async function send(...frames: unknown[]) {
      for (const f of frames) {
        const res = await fetch(`${url}/signalk/v1/api/_test/delta`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `JAUTHENTICATION=${adminToken}`
          },
          body: JSON.stringify(f)
        })
        res.status.should.equal(200)
      }
    }

    async function until(
      what: string,
      condition: () => boolean,
      timeoutMs = 2000
    ) {
      const deadline = Date.now() + timeoutMs
      while (!condition()) {
        if (Date.now() > deadline) throw new Error(`timed out: ${what}`)
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
    }

    it('writes the next frame at the target and prunes the default leaf', async function () {
      // Device keys 137:656598 and 381:656598.
      await send(
        addressClaim(ENGINE_SRC, 137),
        addressClaim(OTHER_SRC, 381),
        engine(ENGINE_SRC),
        battery(ENGINE_SRC),
        battery(OTHER_SRC)
      )
      const at = (...path: string[]) =>
        _.get(server.app.signalk.self, path) as
          { $source?: string; values?: Record<string, unknown> } | undefined
      const publishes = (ref: string, ...path: string[]) => {
        const leaf = at(...path)
        return leaf?.$source === ref || leaf?.values?.[ref] !== undefined
      }
      await until('default-path engine leaf', () =>
        publishes(refA, 'propulsion', 'port', 'revolutions')
      )

      const put = await fetch(
        `${url}/skServer/n2kInstanceMappings/137:656598`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `JAUTHENTICATION=${adminToken}`
          },
          body: JSON.stringify([
            { group: 'engine', instance: 0, target: 'propulsion.main' },
            {
              group: 'battery',
              instance: 3,
              target: 'electrical.batteries.house'
            }
          ])
        }
      )
      put.status.should.equal(200)

      await send(engine(ENGINE_SRC), battery(ENGINE_SRC))
      await until('mapped engine leaf', () =>
        publishes(refA, 'propulsion', 'main', 'revolutions')
      )
      publishes(refA, 'propulsion', 'port', 'revolutions').should.equal(false)
      publishes(
        refA,
        'electrical',
        'batteries',
        'house',
        'voltage'
      ).should.equal(true)
      publishes(refA, 'electrical', 'batteries', '3', 'voltage').should.equal(
        false
      )
      publishes(refB, 'electrical', 'batteries', '3', 'voltage').should.equal(
        true
      )
    })

    it('still reports raw instances, so the shared battery conflicts', async function () {
      const hasRawInstances = (instances: Instances | undefined) =>
        _.isEqual(instances?.[refA]?.['127488'], [0]) &&
        _.isEqual(instances?.[refA]?.['127508'], [3]) &&
        _.isEqual(instances?.[refB]?.['127508'], [3])

      const res = await fetch(`${url}/skServer/n2kDeviceStatus`, {
        headers: { Cookie: `JAUTHENTICATION=${adminToken}` }
      })
      res.status.should.equal(200)
      const status = await res.json()
      hasRawInstances(status.pgnDataInstances).should.equal(
        true,
        JSON.stringify(status.pgnDataInstances)
      )

      await until(
        'N2KDEVICESTATUS push with the mapped instances',
        () => hasRawInstances(pushedInstances[pushedInstances.length - 1]),
        STATUS_PUSH_WAIT_MS
      )
    })
  })
})

describe('N2K instance mapping target grammar', () => {
  it('forbids exactly the path segments the server drops from deltas', () => {
    expect([...FORBIDDEN_TARGET_SEGMENTS].sort()).to.deep.equal(
      [...FORBIDDEN_PATH_KEYS].sort()
    )
  })
})
