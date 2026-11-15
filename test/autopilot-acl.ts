import { expect } from 'chai'
import { freeport } from './ts-servertestutilities'
import {
  startServerP,
  getWriteToken,
  getToken,
  NOPASSWORD_USER_NAME
} from './servertestutilities'

const AUTOPILOTS = '/signalk/v2/api/vessels/self/autopilots'

// only the nopassword admin may put to autopilot; writeuser may only read
const securityConfig = {
  acls: [
    {
      context: 'vessels.self',
      resources: [
        {
          paths: ['autopilot'],
          permissions: [{ subject: NOPASSWORD_USER_NAME, permission: 'put' }]
        },
        {
          paths: ['*'],
          permissions: [{ subject: 'any', permission: 'read' }]
        }
      ]
    }
  ]
}

describe('Autopilot API with ACLs', function () {
  let url: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let allowedToken: string
  let deniedToken: string

  before(async function () {
    const port = await freeport()
    url = `http://0.0.0.0:${port}`
    server = await startServerP(port, true, {}, securityConfig)
    allowedToken = getToken(server, NOPASSWORD_USER_NAME)
    deniedToken = await getWriteToken(server)
  })

  after(async function () {
    await server.stop()
  })

  function request(
    method: string,
    path: string,
    token: string,
    body?: object
  ): Promise<Response> {
    return fetch(`${url}${AUTOPILOTS}${path}`, {
      method,
      headers: {
        Cookie: `JAUTHENTICATION=${token}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    })
  }

  const writes: Array<[string, string, object?]> = [
    ['PUT', '/_default/dodge', { value: 5, units: 'deg' }],
    ['DELETE', '/_default/dodge'],
    ['POST', '/_default/engage']
  ]

  it('refuses every write to a user without put permission', async function () {
    for (const [method, path, body] of writes) {
      const result = await request(method, path, deniedToken, body)
      expect(result.status, `${method} ${path}`).to.equal(403)
    }
  })

  it('passes writes from a user with put permission to the handler', async function () {
    for (const [method, path, body] of writes) {
      const result = await request(method, path, allowedToken, body)
      expect(result.status, `${method} ${path}`).to.not.equal(403)
    }
  })
})
