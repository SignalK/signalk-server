import { expect } from 'chai'
import chai from 'chai'
import { NotificationApi } from '../dist/api/notifications/index.js'
import { startServer, DATETIME_REGEX } from './ts-servertestutilities'
import {
  ALARM_STATE,
  NotificationManagerDisabledError
} from '@signalk/server-api'
import type {
  Delta,
  Context,
  Notification,
  Path,
  Timestamp,
  SourceRef,
  AlarmProperties
} from '@signalk/server-api'
chai.should()

describe('NotificationApi', () => {
  it('registers as DeltaInputHandler and filters notifications correctly', async function () {
    // Track handleMessage calls
    const handleMessageCalls: Delta[] = []
    let registeredHandler:
      | ((delta: Delta, next: (delta: Delta) => void) => void)
      | null = null

    // Mock app
    const mockApp = {
      registerDeltaInputHandler: (
        handler: (delta: Delta, next: (delta: Delta) => void) => void
      ) => {
        registeredHandler = handler
      },
      handleMessage: (pluginId: string, delta: Delta) => {
        handleMessageCalls.push(delta)
      },
      config: {
        configPath: '/tmp/test',
        settings: {}
      },
      setPluginStatus: () => {},
      setPluginError: () => {},
      signalk: {
        self: {}
      },
      get: () => {},
      post: () => {},
      put: () => {},
      delete: () => {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    // Create NotificationApi instance
    const notificationApi = new NotificationApi(mockApp)
    await notificationApi.start()

    // Verify handler was registered
    void expect(registeredHandler).to.not.be.null

    // Create test delta with voltage and related notifications
    const testDelta: Delta = {
      context: 'vessels.self' as Context,
      updates: [
        {
          $source: 'test.source' as SourceRef,
          timestamp: '2026-02-07T12:00:00.000Z' as Timestamp,
          values: [
            {
              path: 'electrical.batteries.1.voltage' as Path,
              value: 15.5
            },
            {
              path: 'notifications.electrical.batteries.1.voltage' as Path,
              value: {
                state: 'alarm',
                method: ['visual', 'sound'],
                message: 'Battery voltage is too high'
              }
            },
            {
              path: 'notifications.electrical.batteries.1.current' as Path,
              value: {
                state: 'alarm',
                method: ['visual', 'sound'],
                message: 'Battery current over the limit'
              }
            }
          ]
        },
        {
          $source: 'test.source' as SourceRef,
          timestamp: '2026-02-07T12:00:01.000Z' as Timestamp,
          values: [
            {
              path: 'notifications.mob' as Path,
              value: {
                state: 'emergency',
                method: ['visual', 'sound'],
                message: 'Person Overboard!'
              }
            }
          ]
        }
      ]
    }

    // Call the registered handler
    let filteredDelta: Delta | null = null
    registeredHandler!(testDelta, (delta) => {
      filteredDelta = delta
    })

    // Give a tick for any async operations
    await new Promise((resolve) => setImmediate(resolve))

    // Verify filtered delta only contains voltage (notifications filtered out)
    void expect(filteredDelta).to.not.be.null
    expect(filteredDelta!.updates).to.have.lengthOf(1)
    const update = filteredDelta!.updates![0]
    if ('values' in update) {
      expect(update.values).to.have.lengthOf(1)
      expect(update.values[0].path).to.equal('electrical.batteries.1.voltage')
      expect(update.values[0].value).to.equal(15.5)
    } else {
      throw new Error('Expected update to have values property')
    }

    // Verify handleMessage was called three times with notification deltas
    expect(handleMessageCalls).to.have.lengthOf(3)

    // First notification delta (voltage)
    expect(handleMessageCalls[0].context).to.equal('vessels.self')
    expect(handleMessageCalls[0].updates).to.have.lengthOf(1)
    const notificationUpdate = handleMessageCalls[0].updates![0]
    if ('values' in notificationUpdate) {
      expect(notificationUpdate.values[0].path).to.equal(
        'notifications.electrical.batteries.1.voltage'
      )
    } else {
      throw new Error('Expected notification update to have values property')
    }
    expect(notificationUpdate).to.have.property('notificationId')

    // Second notification delta (current)
    expect(handleMessageCalls[1].context).to.equal('vessels.self')
    expect(handleMessageCalls[1].updates).to.have.lengthOf(1)
    const currentNotificationUpdate = handleMessageCalls[1].updates![0]
    if ('values' in currentNotificationUpdate) {
      expect(currentNotificationUpdate.values[0].path).to.equal(
        'notifications.electrical.batteries.1.current'
      )
    } else {
      throw new Error(
        'Expected current notification update to have values property'
      )
    }
    expect(currentNotificationUpdate).to.have.property('notificationId')

    // Third notification delta (MOB)
    expect(handleMessageCalls[2].context).to.equal('vessels.self')
    expect(handleMessageCalls[2].updates).to.have.lengthOf(1)
    const mobNotificationUpdate = handleMessageCalls[2].updates![0]
    if ('values' in mobNotificationUpdate) {
      expect(mobNotificationUpdate.values[0].path).to.equal('notifications.mob')
    } else {
      throw new Error(
        'Expected MOB notification update to have values property'
      )
    }
    expect(mobNotificationUpdate).to.have.property('notificationId')
  })

  describe('with management disabled', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const makeApp = (overrides: any = {}) => {
      const handleMessageCalls: Delta[] = []
      let registeredHandler:
        | ((delta: Delta, next: (delta: Delta) => void) => void)
        | null = null
      const app = {
        registerDeltaInputHandler: (
          handler: (delta: Delta, next: (delta: Delta) => void) => void
        ) => {
          registeredHandler = handler
        },
        handleMessage: (_pluginId: string, delta: Delta) => {
          handleMessageCalls.push(delta)
        },
        config: {
          configPath: '/tmp/test',
          settings: { notifications: { manageNotifications: false } }
        },
        signalk: { self: {} },
        get: () => {},
        post: () => {},
        put: () => {},
        delete: () => {},
        ...overrides
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
      return {
        app,
        handleMessageCalls,
        getHandler: () => registeredHandler
      }
    }

    it('does not register a delta input handler', async function () {
      const { app, getHandler } = makeApp()
      const api = new NotificationApi(app)
      await api.start()
      void expect(getHandler()).to.be.null
    })

    const modelWithNotifications = () => ({
      signalk: {
        self: {
          notifications: {
            engine: {
              temp: {
                value: {
                  state: 'alarm',
                  method: ['visual', 'sound'],
                  message: 'Engine hot',
                  id: 'handler-supplied-id'
                },
                $source: 'handler',
                timestamp: '2026-06-07T00:00:00.000Z'
              }
            },
            bilge: {
              value: {
                state: 'alert',
                method: ['visual'],
                message: 'Bilge level high',
                id: 'nm-style-id',
                status: {
                  silenced: false,
                  acknowledged: false,
                  canSilence: true,
                  canAcknowledge: true,
                  canClear: false
                }
              },
              $source: 'oldNM',
              timestamp: '2026-06-07T00:00:00.000Z'
            },
            tanks: {
              fuel: {
                value: {
                  state: 'warn',
                  method: ['visual'],
                  message: 'Fuel low'
                },
                $source: 'device',
                timestamp: '2026-06-07T00:00:00.000Z'
              }
            }
          }
        }
      }
    })

    it('list() reads notifications from the data model', async function () {
      const { app } = makeApp(modelWithNotifications())
      const api = new NotificationApi(app)
      await api.start()
      const list = api.list() as Record<string, AlarmProperties>
      // keyed by value.id when present, by path otherwise
      expect(Object.keys(list)).to.have.members([
        'handler-supplied-id',
        'nm-style-id',
        'notifications.tanks.fuel'
      ])
      expect(list['handler-supplied-id'].context).to.equal('vessels.self')
      expect(list['handler-supplied-id'].path).to.equal(
        'notifications.engine.temp'
      )
      expect(list['handler-supplied-id'].value.state).to.equal('alarm')
      // NM-style value with an embedded status block passes through verbatim
      expect(list['nm-style-id'].value.status).to.deep.equal({
        silenced: false,
        acknowledged: false,
        canSilence: true,
        canAcknowledge: true,
        canClear: false
      })
      expect(list['notifications.tanks.fuel'].value.id).to.equal(undefined)
    })

    it('getPath() returns only the requested subtree', async function () {
      const { app } = makeApp(modelWithNotifications())
      const api = new NotificationApi(app)
      await api.start()
      const subtree = api.getPath('notifications.engine' as Path) as Record<
        string,
        AlarmProperties
      >
      expect(Object.keys(subtree)).to.deep.equal(['handler-supplied-id'])
      // unprefixed form is accepted too
      const bare = api.getPath('engine' as Path) as Record<
        string,
        AlarmProperties
      >
      expect(Object.keys(bare)).to.deep.equal(['handler-supplied-id'])
    })

    it('list() includes notifications nested under a notification leaf', async function () {
      const { app } = makeApp({
        signalk: {
          self: {
            notifications: {
              engine: {
                value: {
                  state: 'alarm',
                  method: ['visual'],
                  message: 'Engine alarm'
                },
                $source: 'handler',
                timestamp: '2026-06-07T00:00:00.000Z',
                temperature: {
                  value: {
                    state: 'warn',
                    method: ['visual'],
                    message: 'Engine hot'
                  },
                  $source: 'handler',
                  timestamp: '2026-06-07T00:00:00.000Z'
                }
              }
            }
          }
        }
      })
      const api = new NotificationApi(app)
      await api.start()
      const list = api.list() as Record<string, AlarmProperties>
      expect(Object.keys(list)).to.have.members([
        'notifications.engine',
        'notifications.engine.temperature'
      ])
    })

    it('list() skips multi-source values nodes', async function () {
      const { app } = makeApp({
        signalk: {
          self: {
            notifications: {
              pump: {
                value: null,
                $source: 'handler',
                timestamp: '2026-06-07T00:00:00.000Z',
                values: {
                  otherSource: {
                    value: {
                      state: 'alarm',
                      method: ['visual'],
                      message: 'stale per-source value'
                    },
                    timestamp: '2026-06-07T00:00:00.000Z'
                  }
                }
              }
            }
          }
        }
      })
      const api = new NotificationApi(app)
      await api.start()
      const list = api.list() as Record<string, AlarmProperties>
      expect(Object.keys(list)).to.deep.equal([])
    })

    it('list() keeps both entries on a duplicate value.id', async function () {
      const { app } = makeApp({
        signalk: {
          self: {
            notifications: {
              a: {
                value: {
                  state: 'alarm',
                  method: ['visual'],
                  message: 'first',
                  id: 'dup-id'
                },
                $source: 'handler',
                timestamp: '2026-06-07T00:00:00.000Z'
              },
              b: {
                value: {
                  state: 'warn',
                  method: ['visual'],
                  message: 'second',
                  id: 'dup-id'
                },
                $source: 'handler',
                timestamp: '2026-06-07T00:00:00.000Z'
              }
            }
          }
        }
      })
      const api = new NotificationApi(app)
      await api.start()
      const list = api.list() as Record<string, AlarmProperties>
      expect(Object.keys(list)).to.have.lengthOf(2)
      const paths = Object.values(list).map((entry) => entry.path)
      expect(paths).to.have.members(['notifications.a', 'notifications.b'])
    })

    it('list() survives a deep notification path', async function () {
      // deeper than the default call-stack limit (~10k frames)
      const depth = 12000
      const leaf: Record<string, unknown> = {
        value: { state: 'alarm', method: ['visual'], message: 'deep' },
        $source: 'handler',
        timestamp: '2026-06-07T00:00:00.000Z'
      }
      let node: Record<string, unknown> = leaf
      for (let i = 0; i < depth; i++) {
        node = { s: node }
      }
      const { app } = makeApp({
        signalk: { self: { notifications: node } }
      })
      const api = new NotificationApi(app)
      await api.start()
      const list = api.list() as Record<string, AlarmProperties>
      expect(Object.keys(list)).to.have.lengthOf(1)
    })

    it('raise() emits a delta and returns an id', async function () {
      const { app, handleMessageCalls } = makeApp()
      const api = new NotificationApi(app)
      await api.start()
      const id = api.raise({
        state: ALARM_STATE.warn,
        message: 'Low tank',
        path: 'tanks.fuel.0' as Path
      })
      expect(id).to.be.a('string')
      expect(handleMessageCalls).to.have.lengthOf(1)
      const update = handleMessageCalls[0].updates![0]
      if ('values' in update) {
        expect(update.values[0].path).to.equal('notifications.tanks.fuel.0')
        expect((update.values[0].value as Notification).id).to.equal(id)
      } else {
        throw new Error('Expected update to have values property')
      }
    })

    it('raise() honors idInPath', async function () {
      const { app, handleMessageCalls } = makeApp()
      const api = new NotificationApi(app)
      await api.start()
      const id = api.raise({
        state: ALARM_STATE.warn,
        message: 'Low tank',
        path: 'tanks.fuel.0' as Path,
        idInPath: true
      })
      const update = handleMessageCalls[0].updates![0]
      if ('values' in update) {
        expect(update.values[0].path).to.equal(
          `notifications.tanks.fuel.0.${id}`
        )
      } else {
        throw new Error('Expected update to have values property')
      }
    })

    it('raise() ignores a context override and emits for self', async function () {
      const { app, handleMessageCalls } = makeApp()
      const api = new NotificationApi(app)
      await api.start()
      api.raise({
        state: ALARM_STATE.warn,
        message: 'ctx',
        path: 'environment.test' as Path,
        context: 'vessels.urn:mrn:imo:mmsi:230099999' as Context
      })
      expect(handleMessageCalls[0].context).to.equal('vessels.self')
    })

    it('raise() without a path throws', async function () {
      const { app } = makeApp()
      const api = new NotificationApi(app)
      await api.start()
      expect(() =>
        api.raise({ state: 'warn', message: 'no path' } as never)
      ).to.throw(/path/)
    })

    it('uuid-addressed and bulk operations throw the named error', async function () {
      const { app } = makeApp()
      const api = new NotificationApi(app)
      await api.start()
      const id = 'some-id' as never
      expect(() => api.getId(id)).to.throw(NotificationManagerDisabledError)
      expect(() => api.silence(id)).to.throw(NotificationManagerDisabledError)
      expect(() => api.acknowledge(id)).to.throw(
        NotificationManagerDisabledError
      )
      expect(() => api.clear(id)).to.throw(NotificationManagerDisabledError)
      expect(() => api.update(id, {} as never)).to.throw(
        NotificationManagerDisabledError
      )
      expect(() => api.silenceAll()).to.throw(NotificationManagerDisabledError)
      expect(() => api.acknowledgeAll())
        .to.throw(NotificationManagerDisabledError)
        .with.property('code', 'NOTIFICATION_MANAGER_DISABLED')
    })

    it('REST: raise and list work end to end', async function () {
      const { post, get, stop } = await startServer({
        notifications: { manageNotifications: false }
      })
      try {
        let response = await get(`/notifications`)
        response.status.should.equal(200)
        const empty = await response.json()
        expect(empty).to.deep.equal({})

        response = await post(`/notifications`, {
          state: 'warn',
          message: 'disabled-mode raise',
          path: 'environment.test'
        })
        response.status.should.equal(200)
        const postBody = (await response.json()) as {
          state: string
          statusCode: number
          id: string
        }
        postBody.state.should.equal('COMPLETED')
        postBody.statusCode.should.equal(200)
        postBody.id.should.be.a('string')

        response = await get(`/notifications`)
        response.status.should.equal(200)
        const list = (await response.json()) as Record<string, AlarmProperties>
        expect(Object.keys(list)).to.include(postBody.id)
        const entry = list[postBody.id]
        entry.context.should.equal('vessels.self')
        entry.path.should.equal('notifications.environment.test')
        entry.value.state.should.equal('warn')
        expect(entry.value.id).to.equal(postBody.id)
        // no core-side status enrichment
        expect(entry.value.status).to.equal(undefined)

        // re-raise on the same path: the model entry is overwritten, so the
        // new id replaces the old one in the list
        response = await post(`/notifications`, {
          state: 'alarm',
          message: 'raised again',
          path: 'environment.test'
        })
        const second = (await response.json()) as { id: string }
        response = await get(`/notifications`)
        const relisted = (await response.json()) as Record<
          string,
          AlarmProperties
        >
        expect(Object.keys(relisted)).to.include(second.id)
        expect(Object.keys(relisted)).to.not.include(postBody.id)
      } finally {
        stop()
      }
    })

    it('REST: raise without a path returns 400', async function () {
      const { post, stop } = await startServer({
        notifications: { manageNotifications: false }
      })
      try {
        const response = await post(`/notifications`, {
          state: 'warn',
          message: 'no path'
        })
        response.status.should.equal(400)
      } finally {
        stop()
      }
    })

    it('REST: mob raises at notifications.mob.<id> with position and createdAt', async function () {
      const { createWsPromiser, post, stop } = await startServer({
        notifications: { manageNotifications: false }
      })
      try {
        const wsPromiser = createWsPromiser()
        await wsPromiser.nthMessage(1)

        const response = await post(`/notifications/mob`, {})
        response.status.should.equal(200)
        const { id } = (await response.json()) as { id: string }

        const mobDelta = JSON.parse(await wsPromiser.nthMessage(2))
        const { path, value } = mobDelta.updates[0].values[0]
        path.should.equal(`notifications.mob.${id}`)
        value.state.should.equal('emergency')
        value.id.should.equal(id)
        value.message.should.equal('Person Overboard!')
        expect(value).to.have.property('position')
        value.createdAt.should.match(DATETIME_REGEX)
      } finally {
        stop()
      }
    })

    it('REST: injected notifications delta passes through un-stamped', async function () {
      const { createWsPromiser, sendADelta, stop } = await startServer({
        notifications: { manageNotifications: false }
      })
      try {
        const wsPromiser = createWsPromiser()
        await wsPromiser.nthMessage(1)

        await sendADelta({
          context: 'vessels.self',
          updates: [
            {
              values: [
                {
                  path: 'notifications.test.alarm',
                  value: {
                    state: 'alarm',
                    method: ['visual'],
                    message: 'raw value'
                  }
                }
              ]
            }
          ]
        })
        const delta = JSON.parse(await wsPromiser.nthMessage(2))
        const update = delta.updates[0]
        expect(update).to.not.have.property('notificationId')
        const { path, value } = update.values[0]
        path.should.equal('notifications.test.alarm')
        value.should.deep.equal({
          state: 'alarm',
          method: ['visual'],
          message: 'raw value'
        })
      } finally {
        stop()
      }
    })

    it('REST: uuid-addressed and bulk routes return 501 with the standard body', async function () {
      const { get, post, put, host, stop } = await startServer({
        notifications: { manageNotifications: false }
      })
      try {
        const VALID_UUID = '9922c05a-2813-4995-ab72-33f8f2246ff7'
        const responses = await Promise.all([
          get(`/notifications/${VALID_UUID}`),
          put(`/notifications/${VALID_UUID}`, { message: 'x' }),
          fetch(`${host}/signalk/v2/api/notifications/${VALID_UUID}`, {
            method: 'DELETE'
          }),
          post(`/notifications/${VALID_UUID}/silence`, {}),
          post(`/notifications/${VALID_UUID}/acknowledge`, {}),
          post(`/notifications/silenceAll`, {}),
          post(`/notifications/acknowledgeAll`, {}),
          // flag pre-check wins over uuid validation
          get(`/notifications/not-a-uuid`),
          post(`/notifications/not-a-uuid/silence`, {})
        ])
        responses.forEach((r) => r.status.should.equal(501))

        const body = (await responses[0].json()) as {
          state: string
          statusCode: number
          message: string
        }
        body.state.should.equal('FAILED')
        body.statusCode.should.equal(501)
        body.message.should.equal(
          new NotificationManagerDisabledError().message
        )
      } finally {
        stop()
      }
    })
  })

  describe('with management enabled', () => {
    it('GET /notifications/:id with an unknown uuid returns 404', async function () {
      const { get, stop } = await startServer()
      try {
        const response = await get(
          `/notifications/9922c05a-2813-4995-ab72-33f8f2246ff7`
        )
        response.status.should.equal(404)
      } finally {
        stop()
      }
    })

    it('REST: full lifecycle round trip works', async function () {
      const { get, post, put, host, stop } = await startServer()
      try {
        let response = await post(`/notifications`, {
          state: 'alarm',
          message: 'lifecycle',
          path: 'environment.lifecycle'
        })
        response.status.should.equal(200)
        const { id } = (await response.json()) as { id: string }

        response = await post(`/notifications/${id}/silence`, {})
        response.status.should.equal(200)
        response = await get(`/notifications/${id}`)
        response.status.should.equal(200)
        const silenced = (await response.json()) as {
          value: { status: { silenced: boolean } }
        }
        silenced.value.status.silenced.should.equal(true)

        response = await put(`/notifications/${id}`, { message: 'updated' })
        response.status.should.equal(200)

        response = await post(`/notifications/silenceAll`, {})
        response.status.should.equal(200)
        response = await post(`/notifications/acknowledgeAll`, {})
        response.status.should.equal(200)

        // a fresh alarm, acknowledged individually
        response = await post(`/notifications`, {
          state: 'alarm',
          message: 'lifecycle 2',
          path: 'environment.lifecycle2'
        })
        const second = (await response.json()) as { id: string }
        response = await post(`/notifications/${second.id}/acknowledge`, {})
        response.status.should.equal(200)

        response = await fetch(`${host}/signalk/v2/api/notifications/${id}`, {
          method: 'DELETE'
        })
        response.status.should.equal(200)
      } finally {
        stop()
      }
    })
  })

  describe('settings persistence', () => {
    it('PUT /skServer/settings merges the notifications block and preserves siblings', async function () {
      const { host, stop } = await startServer()
      try {
        const settingsUrl = `${host}/skServer/settings`
        // the PUT handler dereferences settings.options unconditionally;
        // constructor-supplied settings suppress file writes, so this
        // exercises the PUT merge and GET exposure in memory
        const putSettings = (body: object) =>
          fetch(settingsUrl, {
            method: 'PUT',
            body: JSON.stringify({ options: {}, ...body }),
            headers: { 'Content-Type': 'application/json' }
          })

        let response = await putSettings({ courseApi: { apiOnly: true } })
        response.status.should.equal(200)
        response = await putSettings({
          notifications: { manageNotifications: false }
        })
        response.status.should.equal(200)

        const settings = (await (await fetch(settingsUrl)).json()) as {
          notifications: { manageNotifications: boolean }
          courseApi: { apiOnly: boolean }
        }
        settings.notifications.manageNotifications.should.equal(false)
        // sibling block untouched by the notifications-only PUT
        settings.courseApi.apiOnly.should.equal(true)
      } finally {
        stop()
      }
    })
  })

  describe('MOB Notification', () => {
    it('can raise and get an MOB notification', async function () {
      const { createWsPromiser, get, post, stop } = await startServer()
      try {
        const wsPromiser = createWsPromiser()
        await wsPromiser.nthMessage(1)

        let response = await post(`/notifications/mob`, {})
        const { id, statusCode } = (await response.json()) as {
          id: string
          statusCode: number
        }
        statusCode.should.equal(200)
        const mobDelta = JSON.parse(await wsPromiser.nthMessage(2))
        const { path, value } = mobDelta.updates[0].values[0]
        path.should.equal(`notifications.mob.${id}`)
        value.state.should.equal('emergency')
        response = await get(`/notifications/${id}`)
        const notiData = (await response.json()) as AlarmProperties
        notiData.value.state.should.equal('emergency')
      } finally {
        stop()
      }
    })
  })
})
