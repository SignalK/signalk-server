import chai from 'chai'
import { freeport } from './ts-servertestutilities'
import {
  startServerP,
  getReadOnlyToken,
  getAdminToken
} from './servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(chai as any).Should()

describe('Endpoint authentication', function () {
  let url: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let adminToken: string
  let readToken: string

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

  function authHeaders(token: string) {
    return {
      Cookie: `JAUTHENTICATION=${token}`,
      'Content-Type': 'application/json'
    }
  }

  async function fetchEndpoint(
    method: string,
    path: string,
    token?: string,
    body?: object
  ): Promise<number> {
    const options: RequestInit = {
      method,
      headers: token
        ? authHeaders(token)
        : { 'Content-Type': 'application/json' }
    }
    if (body && method !== 'GET' && method !== 'HEAD') {
      options.body = JSON.stringify(body)
    }
    const result = await fetch(`${url}${path}`, options)
    return result.status
  }

  describe('alerts API endpoints inherit v2 auth', function () {
    const ALERTS = '/signalk/v2/api/alerts'
    // The id never matches an alert: auth is decided by the path prefix and the
    // verb, before any route looks one up.
    // `adminStatus` is what the route answers an authorised admin: 201 for a
    // raise, 200 for silence-all, 404 for the routes addressing an alert that
    // does not exist. Asserting only "not 401" would let a 500 pass for
    // authorised.
    const mutating: Array<{
      method: string
      path: string
      body: object
      adminStatus: number
    }> = [
      {
        method: 'POST',
        path: ALERTS,
        body: { path: 'test.alert', priority: 'alarm', message: 'Test' },
        adminStatus: 201
      },
      {
        method: 'POST',
        path: `${ALERTS}/silence-all`,
        body: {},
        adminStatus: 200
      },
      {
        method: 'POST',
        path: `${ALERTS}/no-such-alert/acknowledge`,
        body: {},
        adminStatus: 404
      },
      {
        method: 'POST',
        path: `${ALERTS}/no-such-alert/escalate`,
        body: { priority: 'alarm' },
        adminStatus: 404
      },
      {
        method: 'POST',
        path: `${ALERTS}/no-such-alert/silence`,
        body: {},
        adminStatus: 404
      },
      {
        method: 'PUT',
        path: `${ALERTS}/no-such-alert/condition`,
        body: { active: false },
        adminStatus: 404
      }
    ]

    for (const { method, path, body, adminStatus } of mutating) {
      it(`${method} ${path} rejects unauthenticated requests`, async function () {
        const status = await fetchEndpoint(method, path, undefined, body)
        status.should.equal(401, `${method} ${path}: expected 401`)
      })

      it(`${method} ${path} rejects read-only users`, async function () {
        const status = await fetchEndpoint(method, path, readToken, body)
        status.should.equal(401, `${method} ${path}: expected 401`)
      })

      it(`${method} ${path} accepts admin users`, async function () {
        const status = await fetchEndpoint(method, path, adminToken, body)
        status.should.equal(
          adminStatus,
          `${method} ${path}: expected ${String(adminStatus)} for an admin`
        )
      })
    }

    for (const path of [ALERTS, `${ALERTS}/status`, `${ALERTS}/history`]) {
      it(`GET ${path} is readable by a read-only user`, async function () {
        const status = await fetchEndpoint('GET', path, readToken)
        status.should.equal(200)
      })
    }
  })

  describe('skServer config endpoints require admin auth', function () {
    const endpoints: Array<{ method: string; path: string; body: object }> = [
      {
        method: 'PUT',
        path: '/skServer/priorityOverrides',
        body: {}
      },
      {
        method: 'GET',
        path: '/skServer/priorityOverrides',
        body: {}
      },
      {
        method: 'GET',
        path: '/skServer/priorityGroups',
        body: {}
      },
      {
        method: 'GET',
        path: '/skServer/priorityDefaults',
        body: {}
      },
      {
        method: 'GET',
        path: '/skServer/sourceAliases',
        body: {}
      },
      {
        method: 'GET',
        path: '/skServer/ignoredInstanceConflicts',
        body: {}
      },
      {
        method: 'PUT',
        path: '/skServer/vessel',
        body: { name: 'TestVessel', mmsi: '123456789' }
      },
      { method: 'POST', path: '/skServer/debug', body: { value: 'test:*' } },
      {
        method: 'POST',
        path: '/skServer/rememberDebug',
        body: { value: 'test:*' }
      },
      {
        method: 'DELETE',
        path: '/skServer/removeSource?sourceRef=test',
        body: {}
      }
    ]

    for (const { method, path, body } of endpoints) {
      it(`${method} ${path} rejects unauthenticated requests`, async function () {
        const status = await fetchEndpoint(method, path, undefined, body)
        status.should.equal(
          401,
          `${method} ${path}: expected 401, got ${status}`
        )
      })

      it(`${method} ${path} rejects read-only users`, async function () {
        const status = await fetchEndpoint(method, path, readToken, body)
        status.should.equal(
          401,
          `${method} ${path}: expected 401, got ${status}`
        )
      })

      it(`${method} ${path} accepts admin users`, async function () {
        const status = await fetchEndpoint(method, path, adminToken, body)
        status.should.not.equal(
          401,
          `${method} ${path}: admin request should not be rejected`
        )
      })
    }

    it('PUT /skServer/settings rejects unauthenticated requests', async function () {
      const status = await fetchEndpoint(
        'PUT',
        '/skServer/settings',
        undefined,
        {}
      )
      status.should.equal(401)
    })

    it('PUT /skServer/settings rejects read-only users', async function () {
      const status = await fetchEndpoint(
        'PUT',
        '/skServer/settings',
        readToken,
        {}
      )
      status.should.equal(401)
    })

    it('PUT /skServer/settings accepts admin users', async function () {
      const status = await fetchEndpoint(
        'PUT',
        '/skServer/settings',
        adminToken,
        { interfaces: {}, options: {} }
      )
      status.should.not.equal(401)
    })
  })

  describe('v2 notification endpoints require authentication', function () {
    const endpoints: Array<{
      method: string
      path: string
      body?: object
    }> = [
      { method: 'POST', path: '/signalk/v2/api/notifications/silenceAll' },
      { method: 'POST', path: '/signalk/v2/api/notifications/acknowledgeAll' },
      {
        method: 'POST',
        path: '/signalk/v2/api/notifications/mob',
        body: {}
      },
      {
        method: 'POST',
        path: '/signalk/v2/api/notifications',
        body: { message: 'test', state: 'alert' }
      },
      {
        method: 'PUT',
        path: '/signalk/v2/api/notifications/test-id',
        body: { message: 'test', state: 'alert' }
      },
      {
        method: 'DELETE',
        path: '/signalk/v2/api/notifications/test-id'
      },
      {
        method: 'POST',
        path: '/signalk/v2/api/notifications/test-id/silence'
      },
      {
        method: 'POST',
        path: '/signalk/v2/api/notifications/test-id/acknowledge'
      }
    ]

    for (const { method, path, body } of endpoints) {
      it(`${method} ${path} rejects unauthenticated requests`, async function () {
        const status = await fetchEndpoint(method, path, undefined, body)
        status.should.equal(
          401,
          `${method} ${path}: expected 401, got ${status}`
        )
      })
    }
  })
})
