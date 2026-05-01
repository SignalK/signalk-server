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
