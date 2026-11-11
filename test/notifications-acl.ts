import { expect } from 'chai'
import { freeport } from './ts-servertestutilities'
import {
  startServerP,
  getWriteToken,
  getAdminToken,
  getToken,
  NOPASSWORD_USER_NAME
} from './servertestutilities'

const NOTIFICATIONS = '/signalk/v2/api/notifications'
const ALARM = { state: 'alarm', message: 'Test alarm' }

// only the nopassword admin may put to notifications; writeuser (readwrite)
// and adminuser (admin) may only read them
const securityConfig = {
  acls: [
    {
      context: 'vessels.self',
      resources: [
        {
          paths: ['notifications'],
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

describe('Notifications API with ACLs', function () {
  let url: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let allowedToken: string
  let deniedTokens: Record<string, string>

  before(async function () {
    const port = await freeport()
    url = `http://0.0.0.0:${port}`
    server = await startServerP(port, true, {}, securityConfig)
    allowedToken = getToken(server, NOPASSWORD_USER_NAME)
    deniedTokens = {
      readwrite: await getWriteToken(server),
      admin: await getAdminToken(server)
    }
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
    return fetch(`${url}${NOTIFICATIONS}${path}`, {
      method,
      headers: {
        Cookie: `JAUTHENTICATION=${token}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    })
  }

  async function raiseAlarm(): Promise<string> {
    const result = await request('POST', '', allowedToken, ALARM)
    expect(result.status).to.equal(200)
    return ((await result.json()) as { id: string }).id
  }

  it('lets a user with put permission raise, acknowledge and clear', async function () {
    const id = await raiseAlarm()
    expect(
      (await request('POST', `/${id}/acknowledge`, allowedToken)).status
    ).to.equal(200)
    expect((await request('DELETE', `/${id}`, allowedToken)).status).to.equal(
      200
    )
  })

  for (const role of ['readwrite', 'admin']) {
    it(`refuses every write to a${role === 'admin' ? 'n' : ''} ${role} user without put permission`, async function () {
      const deniedToken = deniedTokens[role]
      const id = await raiseAlarm()
      const writes: Array<[string, string, object?]> = [
        ['POST', '', ALARM],
        ['POST', '/mob'],
        ['PUT', `/${id}`, { message: 'Changed' }],
        ['POST', `/${id}/acknowledge`],
        ['POST', `/${id}/silence`],
        ['POST', '/acknowledgeAll'],
        ['POST', '/silenceAll'],
        ['DELETE', `/${id}`]
      ]
      for (const [method, path, body] of writes) {
        const result = await request(method, path, deniedToken, body)
        expect(result.status, `${method} ${path}`).to.equal(403)
      }
      const alarm = await request('GET', `/${id}`, deniedToken)
      expect(alarm.status).to.equal(200)
      expect(
        ((await alarm.json()) as { value: { message: string } }).value.message
      ).to.equal(ALARM.message)
    })
  }
})
