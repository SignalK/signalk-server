import chai from 'chai'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import os from 'os'
import path from 'path'
import { rimraf } from 'rimraf'
import WebSocket from 'ws'
import { freeport, SERVER_START_TIMEOUT } from './ts-servertestutilities'
import {
  startServerP,
  startServerFromConfigP,
  getAdminToken,
  getReadOnlyToken,
  serverTestConfigDirectory
} from './servertestutilities'
import {
  DeviceTracker,
  type DeviceStateEvent,
  userAgentOf
} from '../src/deviceTracker'

const expect = chai.expect

interface TestServer {
  app: {
    securityStrategy: {
      securityConfig: {
        secretKey: string
        devices: Array<{ clientId: string } & Record<string, unknown>>
      }
      registerPluginRoutePermissions: (
        pluginId: string,
        permissions: Array<{ method: string; path: string; permission: string }>
      ) => void
    }
    deviceTracker: DeviceTracker
  }
  stop: () => Promise<void>
}

describe('Device Manager', function () {
  let url: string
  let server: TestServer
  let adminToken: string
  let readToken: string
  let secretKey: string

  function adminHeaders() {
    return {
      Cookie: `JAUTHENTICATION=${adminToken}`,
      'Content-Type': 'application/json'
    }
  }

  function tokenHeaders(token: string) {
    return {
      Cookie: `JAUTHENTICATION=${token}`,
      'Content-Type': 'application/json'
    }
  }

  function createDeviceToken(clientId: string): string {
    return jwt.sign({ device: clientId }, secretKey)
  }

  before(async function () {
    this.timeout(SERVER_START_TIMEOUT)
    const port = await freeport()
    url = `http://0.0.0.0:${port}`
    server = await startServerP(port, true)
    adminToken = await getAdminToken(server)
    readToken = await getReadOnlyToken(server)
    secretKey = server.app.securityStrategy.securityConfig.secretKey
  })

  after(async function () {
    // Remove devices created through the API so no device state persists in
    // the shared test security config beyond this suite.
    const res = await fetch(`${url}/skServer/security/devices`, {
      headers: adminHeaders()
    })
    if (res.ok) {
      const devices = await res.json()
      for (const d of devices) {
        await fetch(`${url}/skServer/security/devices/${d.clientId}`, {
          method: 'DELETE',
          headers: adminHeaders()
        })
      }
    }
    await server.stop()
  })

  describe('?token= HTTP auth', function () {
    afterEach(function () {
      const config = server.app.securityStrategy.securityConfig
      config.devices = (config.devices || []).filter(
        (d: { clientId: string }) => d.clientId !== 'token-auth-test-device'
      )
    })

    it('authenticates via query parameter', async function () {
      const result = await fetch(
        `${url}/skServer/loginStatus?token=${adminToken}`
      )
      expect(result.status).to.equal(200)
      const body = await result.json()
      expect(body.status).to.equal('loggedIn')
    })

    it('rejects invalid token in query parameter', async function () {
      const result = await fetch(
        `${url}/skServer/loginStatus?token=invalid.jwt.token`
      )
      expect(result.status).to.equal(200)
      const body = await result.json()
      expect(body.status).to.equal('notLoggedIn')
    })

    it('authenticates device token via query parameter', async function () {
      const config = server.app.securityStrategy.securityConfig
      config.devices = config.devices || []
      config.devices.push({
        clientId: 'token-auth-test-device',
        permissions: 'readonly',
        config: {},
        description: 'token auth test',
        requestedPermissions: ''
      })

      const deviceToken = createDeviceToken('token-auth-test-device')
      const result = await fetch(
        `${url}/skServer/loginStatus?token=${deviceToken}`
      )
      expect(result.status).to.equal(200)
      const body = await result.json()
      expect(body.status).to.equal('loggedIn')
      expect(body.userLevel).to.equal('readonly')
    })
  })

  describe('Device CRUD', function () {
    it('rejects unauthenticated device list', async function () {
      const result = await fetch(`${url}/skServer/security/devices`)
      expect(result.status).to.equal(401)
    })

    it('rejects non-admin device list', async function () {
      const result = await fetch(`${url}/skServer/security/devices`, {
        headers: tokenHeaders(readToken)
      })
      expect(result.status).to.equal(401)
    })

    it('returns empty device list', async function () {
      const result = await fetch(`${url}/skServer/security/devices`, {
        headers: adminHeaders()
      })
      expect(result.status).to.equal(200)
      const devices = await result.json()
      expect(devices).to.be.an('array').that.is.empty
    })

    it('creates a device', async function () {
      const result = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'Test Helm Display',
          permissions: 'readonly'
        })
      })
      expect(result.status).to.equal(200)
      const body = await result.json()
      expect(body.clientId).to.be.a('string')
      expect(body.token).to.be.a('string')

      const decoded = jwt.decode(body.token) as { device: string }
      expect(decoded.device).to.equal(body.clientId)
    })

    it('creates a device with dashboard', async function () {
      const result = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'Nav iPad',
          permissions: 'readonly',
          dashboard: { mode: 'redirect', url: '/@signalk/freeboard-sk/' }
        })
      })
      expect(result.status).to.equal(200)
      const body = await result.json()

      const listResult = await fetch(`${url}/skServer/security/devices`, {
        headers: adminHeaders()
      })
      const devices = await listResult.json()
      const device = devices.find(
        (d: { clientId: string }) => d.clientId === body.clientId
      )
      expect(device).to.exist
      expect(device.displayName).to.equal('Nav iPad')
      expect(device.dashboard.mode).to.equal('redirect')
      expect(device.dashboard.url).to.equal('/@signalk/freeboard-sk/')
    })

    it('rejects a device with an invalid dashboard', async function () {
      const result = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'Bad Dashboard',
          permissions: 'readonly',
          dashboard: { mode: 'popup', url: 42 }
        })
      })
      expect(result.status).to.equal(400)
    })

    it('rejects a device with a non-string expiration', async function () {
      const result = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'Bad Expiration',
          permissions: 'readonly',
          expiration: { days: 1 }
        })
      })
      expect(result.status).to.equal(400)
    })

    it('updates a device', async function () {
      const createResult = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'Before Update',
          permissions: 'readonly'
        })
      })
      const { clientId } = await createResult.json()

      const updateResult = await fetch(
        `${url}/skServer/security/devices/${clientId}`,
        {
          method: 'PUT',
          headers: adminHeaders(),
          body: JSON.stringify({
            displayName: 'After Update',
            permissions: 'readwrite',
            dashboard: { mode: 'metadata', metadata: { layout: 'helm' } }
          })
        }
      )
      expect(updateResult.status).to.equal(200)

      const listResult = await fetch(`${url}/skServer/security/devices`, {
        headers: adminHeaders()
      })
      const devices = await listResult.json()
      const device = devices.find(
        (d: { clientId: string }) => d.clientId === clientId
      )
      expect(device.displayName).to.equal('After Update')
      expect(device.permissions).to.equal('readwrite')
      expect(device.dashboard.mode).to.equal('metadata')
    })

    it('deletes a device', async function () {
      const createResult = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'To Delete',
          permissions: 'readonly'
        })
      })
      const { clientId } = await createResult.json()

      const deleteResult = await fetch(
        `${url}/skServer/security/devices/${clientId}`,
        {
          method: 'DELETE',
          headers: adminHeaders()
        }
      )
      expect(deleteResult.status).to.equal(200)

      const listResult = await fetch(`${url}/skServer/security/devices`, {
        headers: adminHeaders()
      })
      const devices = await listResult.json()
      expect(devices.find((d: { clientId: string }) => d.clientId === clientId))
        .to.be.undefined
    })
  })

  describe('Token regeneration', function () {
    it('regenerates a valid token for an existing device', async function () {
      const createResult = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'Token Regen Test',
          permissions: 'readwrite'
        })
      })
      const { clientId } = await createResult.json()

      const regenResult = await fetch(
        `${url}/skServer/security/devices/${clientId}/token`,
        {
          method: 'POST',
          headers: adminHeaders()
        }
      )
      expect(regenResult.status).to.equal(200)
      const { token } = await regenResult.json()
      expect(token).to.be.a('string')

      const decoded = jwt.decode(token) as { device: string }
      expect(decoded.device).to.equal(clientId)

      const statusResult = await fetch(
        `${url}/skServer/loginStatus?token=${token}`
      )
      const status = await statusResult.json()
      expect(status.status).to.equal('loggedIn')
    })

    it('revokes earlier tokens when a token is regenerated', async function () {
      const createResult = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'Token Revoke Test',
          permissions: 'readonly'
        })
      })
      const { clientId, token: originalToken } = await createResult.json()

      const regenerate = async (): Promise<string> => {
        const result = await fetch(
          `${url}/skServer/security/devices/${clientId}/token`,
          { method: 'POST', headers: adminHeaders() }
        )
        return (await result.json()).token
      }
      const loginStatus = async (token: string): Promise<string> => {
        const result = await fetch(`${url}/skServer/loginStatus?token=${token}`)
        return (await result.json()).status
      }

      const firstRegenerated = await regenerate()
      const secondRegenerated = await regenerate()

      expect(await loginStatus(originalToken)).to.equal('notLoggedIn')
      expect(await loginStatus(firstRegenerated)).to.equal('notLoggedIn')
      expect(await loginStatus(secondRegenerated)).to.equal('loggedIn')
    })

    it('reports an expired device as expired, not missing', async function () {
      const config = server.app.securityStrategy.securityConfig
      config.devices = config.devices || []
      config.devices.push({
        clientId: 'expired-token-device',
        permissions: 'readonly',
        config: {},
        description: 'expired token test',
        requestedPermissions: '',
        tokenExpiry: Math.floor(Date.now() / 1000) - 60
      })

      const result = await fetch(
        `${url}/skServer/security/devices/expired-token-device/token`,
        {
          method: 'POST',
          headers: adminHeaders()
        }
      )
      expect(result.status).to.equal(409)
      const body = await result.json()
      expect(body.error).to.include('expired')
    })

    it('returns 404 for nonexistent device', async function () {
      const result = await fetch(
        `${url}/skServer/security/devices/nonexistent-id/token`,
        {
          method: 'POST',
          headers: adminHeaders()
        }
      )
      expect(result.status).to.equal(404)
    })

    it('rejects non-admin request', async function () {
      const result = await fetch(
        `${url}/skServer/security/devices/any-id/token`,
        {
          method: 'POST',
          headers: tokenHeaders(readToken)
        }
      )
      expect(result.status).to.equal(401)
    })
  })

  describe('loginStatus device identity', function () {
    let deviceClientId: string
    let deviceToken: string

    before(async function () {
      const result = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'LoginStatus Test Device',
          permissions: 'readonly',
          dashboard: {
            mode: 'metadata',
            metadata: { layout: 'helm', theme: 'dark' }
          }
        })
      })
      const body = await result.json()
      deviceClientId = body.clientId
      deviceToken = body.token
    })

    it('returns device identity in loginStatus', async function () {
      const result = await fetch(
        `${url}/skServer/loginStatus?token=${deviceToken}`
      )
      expect(result.status).to.equal(200)
      const body = await result.json()
      expect(body.status).to.equal('loggedIn')
      expect(body.principalType).to.equal('device')
      expect(body.deviceId).to.equal(deviceClientId)
      expect(body.deviceName).to.equal('LoginStatus Test Device')
      expect(body.deviceDashboard).to.deep.include({ mode: 'metadata' })
      expect(body.deviceDashboard.metadata).to.deep.equal({
        layout: 'helm',
        theme: 'dark'
      })
    })

    it('does not describe a user as a device that shares its name', async function () {
      const config = server.app.securityStrategy.securityConfig
      config.devices = config.devices || []
      config.devices.push({
        clientId: 'testuser',
        permissions: 'readonly',
        config: {},
        description: 'shares the read-only user name',
        requestedPermissions: ''
      })
      try {
        const result = await fetch(`${url}/skServer/loginStatus`, {
          headers: tokenHeaders(readToken)
        })
        const body = await result.json()
        expect(body.username).to.equal('testuser')
        expect(body).not.to.have.property('principalType')
        expect(body).not.to.have.property('deviceId')
      } finally {
        config.devices = config.devices.filter((d) => d.clientId !== 'testuser')
      }
    })
  })

  describe('WebSocket device tracking', function () {
    function openStream(token: string): Promise<WebSocket> {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(
          `${url.replace('http', 'ws')}/signalk/v1/stream?subscribe=none`,
          { headers: { Cookie: `JAUTHENTICATION=${token}` } }
        )
        ws.once('message', () => resolve(ws))
        ws.once('error', reject)
      })
    }

    it('tracks device connections but not user connections', async function () {
      const createResult = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'WebSocket Tracking Test',
          permissions: 'readonly'
        })
      })
      const { clientId, token } = await createResult.json()
      const adminUsername = (jwt.decode(adminToken) as { id: string }).id
      const tracker = server.app.deviceTracker

      const userSocket = await openStream(adminToken)
      const deviceSocket = await openStream(token)
      try {
        expect(tracker.getState(adminUsername)).to.be.undefined
        expect(tracker.getState(clientId)?.isConnected).to.equal(true)
      } finally {
        userSocket.close()
        deviceSocket.close()
      }
    })
  })

  describe('Dashboard redirect', function () {
    let redirectDeviceToken: string
    let redirectDeviceId: string

    before(async function () {
      const result = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'Redirect Test',
          permissions: 'readonly',
          dashboard: { mode: 'redirect', url: '@signalk/freeboard-sk/' }
        })
      })
      const body = await result.json()
      redirectDeviceToken = body.token
      redirectDeviceId = body.clientId
    })

    it('does not redirect a token with an invalid signature', async function () {
      const forged = jwt.sign({ device: redirectDeviceId }, 'not-the-secret')
      const result = await fetch(`${url}/?token=${forged}`, {
        redirect: 'manual'
      })
      expect(result.status).to.equal(302)
      const location = result.headers.get('location')
      expect(location).to.not.include('freeboard')
    })

    it('redirects device with dashboard to assigned URL', async function () {
      const result = await fetch(`${url}/?token=${redirectDeviceToken}`, {
        redirect: 'manual'
      })
      expect(result.status).to.equal(302)
      const location = result.headers.get('location')
      expect(location).to.include('/@signalk/freeboard-sk/')
      expect(location).to.include(`token=${redirectDeviceToken}`)
    })

    it('redirects device without dashboard to default location', async function () {
      const createResult = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'No Dashboard',
          permissions: 'readonly'
        })
      })
      const { token } = await createResult.json()

      const result = await fetch(`${url}/?token=${token}`, {
        redirect: 'manual'
      })
      expect(result.status).to.equal(302)
      const location = result.headers.get('location')
      expect(location).to.not.include('freeboard')
    })

    it('does not redirect to a backslash protocol-relative URL', async function () {
      const createResult = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'Backslash Dashboard',
          permissions: 'readonly',
          dashboard: { mode: 'redirect', url: '/\\evil.example' }
        })
      })
      const { token } = await createResult.json()

      const result = await fetch(`${url}/?token=${token}`, {
        redirect: 'manual'
      })
      expect(result.status).to.equal(302)
      const location = result.headers.get('location')
      expect(location).to.not.include('evil.example')
    })

    it('redirects user tokens to default location', async function () {
      const result = await fetch(`${url}/?token=${adminToken}`, {
        redirect: 'manual'
      })
      expect(result.status).to.equal(302)
      const location = result.headers.get('location')
      expect(location).to.not.include('freeboard')
    })
  })

  describe('Device-scoped applicationData', function () {
    let deviceClientId: string
    let deviceToken: string
    let otherDeviceToken: string

    before(async function () {
      const result = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'AppData Device',
          permissions: 'readwrite'
        })
      })
      const body = await result.json()
      deviceClientId = body.clientId
      deviceToken = body.token

      const result2 = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'Other Device',
          permissions: 'readwrite'
        })
      })
      const body2 = await result2.json()
      otherDeviceToken = body2.token
    })

    beforeEach(async function () {
      await rimraf(
        path.join(serverTestConfigDirectory(), 'applicationData', 'devices')
      )
    })

    it('device can write and read own applicationData', async function () {
      const data = { dashboard: 'helm', gauges: [1, 2, 3] }
      const postResult = await fetch(
        `${url}/signalk/v1/applicationData/device/${deviceClientId}/testapp/1.0.0`,
        {
          method: 'POST',
          headers: tokenHeaders(deviceToken),
          body: JSON.stringify(data)
        }
      )
      expect(postResult.status).to.equal(200)

      const getResult = await fetch(
        `${url}/signalk/v1/applicationData/device/${deviceClientId}/testapp/1.0.0`,
        { headers: tokenHeaders(deviceToken) }
      )
      expect(getResult.status).to.equal(200)
      const body = await getResult.json()
      expect(body).to.deep.equal(data)
    })

    it('readonly device cannot write own applicationData', async function () {
      const createResult = await fetch(`${url}/skServer/security/devices`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'Readonly AppData Device',
          permissions: 'readonly'
        })
      })
      const { clientId, token } = await createResult.json()
      const result = await fetch(
        `${url}/signalk/v1/applicationData/device/${clientId}/testapp/1.0.0`,
        {
          method: 'POST',
          headers: tokenHeaders(token),
          body: JSON.stringify({ dashboard: 'helm' })
        }
      )
      expect(result.status).to.equal(401)
    })

    it('device cannot access another device scope', async function () {
      const result = await fetch(
        `${url}/signalk/v1/applicationData/device/${deviceClientId}/testapp/1.0.0`,
        { headers: tokenHeaders(otherDeviceToken) }
      )
      expect(result.status).to.equal(403)
    })

    it('admin can access any device scope', async function () {
      const data = { config: 'admin-written' }
      const postResult = await fetch(
        `${url}/signalk/v1/applicationData/device/${deviceClientId}/testapp/1.0.0`,
        {
          method: 'POST',
          headers: adminHeaders(),
          body: JSON.stringify(data)
        }
      )
      expect(postResult.status).to.equal(200)

      const getResult = await fetch(
        `${url}/signalk/v1/applicationData/device/${deviceClientId}/testapp/1.0.0`,
        { headers: adminHeaders() }
      )
      expect(getResult.status).to.equal(200)
      const body = await getResult.json()
      expect(body).to.deep.equal(data)
    })

    it('unauthenticated request is rejected', async function () {
      const result = await fetch(
        `${url}/signalk/v1/applicationData/device/${deviceClientId}/testapp/1.0.0`
      )
      expect(result.status).to.equal(401)
    })

    it('rejects device identifiers that escape the devices directory', async function () {
      // An admin passes the ownership check for any device identifier, so
      // the identifier itself must be a single path segment. Express decodes
      // %2F inside a route parameter.
      for (const deviceId of ['%2E%2E%2Fglobal', '..%2F..%2Fescaped']) {
        const base = `${url}/signalk/v1/applicationData/device/${deviceId}/testapp`
        const postResult = await fetch(`${base}/1.0.0`, {
          method: 'POST',
          headers: adminHeaders(),
          body: JSON.stringify({ escaped: true })
        })
        expect(postResult.status, `POST ${deviceId}`).to.equal(400)
        const listResult = await fetch(base, { headers: adminHeaders() })
        expect(listResult.status, `GET ${deviceId}`).to.equal(400)
      }
    })
  })

  describe('Plugin route permissions', function () {
    const createdDeviceIds: string[] = []

    afterEach(function () {
      const config = server.app.securityStrategy.securityConfig
      config.devices = (config.devices || []).filter(
        (d: { clientId: string }) => !createdDeviceIds.includes(d.clientId)
      )
      createdDeviceIds.length = 0
    })

    it('registers and enforces route permissions', async function () {
      const config = server.app.securityStrategy.securityConfig
      config.devices = config.devices || []
      const clientId = 'route-perm-test-device'
      createdDeviceIds.push(clientId)
      config.devices.push({
        clientId,
        permissions: 'readwrite',
        config: {},
        description: 'route perm test',
        requestedPermissions: ''
      })

      server.app.securityStrategy.registerPluginRoutePermissions(
        'test-plugin',
        [
          { method: 'GET', path: '/status', permission: 'readonly' },
          { method: 'POST', path: '/data', permission: 'readwrite' }
        ]
      )

      const rwToken = createDeviceToken(clientId)

      const statusResult = await fetch(
        `${url}/plugins/test-plugin/status?token=${rwToken}`
      )
      expect(statusResult.status).to.not.equal(401)

      const dataResult = await fetch(
        `${url}/plugins/test-plugin/data?token=${rwToken}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      )
      expect(dataResult.status).to.not.equal(401)
    })

    it('denies readonly device access to readwrite routes', async function () {
      const config = server.app.securityStrategy.securityConfig
      config.devices = config.devices || []
      const clientId = 'route-perm-ro-device'
      createdDeviceIds.push(clientId)
      config.devices.push({
        clientId,
        permissions: 'readonly',
        config: {},
        description: 'readonly device',
        requestedPermissions: ''
      })

      server.app.securityStrategy.registerPluginRoutePermissions(
        'test-plugin-rw',
        [{ method: 'POST', path: '/data', permission: 'readwrite' }]
      )

      const roToken = createDeviceToken(clientId)

      const result = await fetch(
        `${url}/plugins/test-plugin-rw/data?token=${roToken}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      )
      expect(result.status).to.equal(401)
    })
  })
})

describe('Device identity', function () {
  const SENSESP_UA = 'SensESP/3.6.1'
  const DEVICE_INFO = {
    hardware: 'ESP32-C6',
    hardwareVersion: 'v0.2',
    software: 'SensESP',
    softwareVersion: '3.6.1'
  }

  let url: string
  let server: TestServer
  let adminToken: string

  function adminHeaders() {
    return {
      Cookie: `JAUTHENTICATION=${adminToken}`,
      'Content-Type': 'application/json'
    }
  }

  async function listDevices(): Promise<Array<Record<string, unknown>>> {
    const res = await fetch(`${url}/skServer/security/devices`, {
      headers: adminHeaders()
    })
    return res.json()
  }

  async function findDevice(
    clientId: string
  ): Promise<Record<string, unknown> | undefined> {
    return (await listDevices()).find((d) => d.clientId === clientId)
  }

  async function requestAndApprove(
    clientId: string,
    body: Record<string, unknown>
  ): Promise<string> {
    const requestResult = await fetch(`${url}/signalk/v1/access/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': SENSESP_UA
      },
      body: JSON.stringify({ clientId, description: 'identity test', ...body })
    })
    expect(requestResult.status).to.equal(202)
    const { href } = await requestResult.json()
    const approveResult = await fetch(
      `${url}/skServer/security/access/requests/${clientId}/approved`,
      {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ expiration: '1y', permissions: 'readonly' })
      }
    )
    expect(approveResult.status).to.equal(200)
    const status = await (await fetch(`${url}${href}`)).json()
    return status.accessRequest.token
  }

  before(async function () {
    this.timeout(SERVER_START_TIMEOUT)
    const port = await freeport()
    url = `http://0.0.0.0:${port}`
    server = await startServerP(
      port,
      true,
      {},
      {
        allowDeviceAccessRequests: true
      }
    )
    adminToken = await getAdminToken(server)
  })

  after(async function () {
    for (const d of await listDevices()) {
      await fetch(`${url}/skServer/security/devices/${d.clientId}`, {
        method: 'DELETE',
        headers: adminHeaders()
      })
    }
    await server.stop()
  })

  it('stores the device object and User-Agent of an access request', async function () {
    await requestAndApprove('identity-request', { device: DEVICE_INFO })

    const device = await findDevice('identity-request')
    expect(device?.deviceInfo).to.deep.equal(DEVICE_INFO)
    expect(
      (device?.registrationInfo as { userAgent?: string }).userAgent
    ).to.equal(SENSESP_UA)
  })

  it('accepts an access request without a device object', async function () {
    await requestAndApprove('identity-none', {})

    const device = await findDevice('identity-none')
    expect(device?.deviceInfo).to.be.undefined
  })

  it('rejects an access request with an invalid device object', async function () {
    const result = await fetch(`${url}/signalk/v1/access/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'identity-invalid',
        description: 'identity test',
        device: { software: 42 }
      })
    })
    expect(result.status).to.equal(400)
  })

  it('lets a device update fields of its device object', async function () {
    const token = await requestAndApprove('identity-update', {
      device: DEVICE_INFO
    })

    const result = await fetch(`${url}/skServer/device/info`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ softwareVersion: '3.7.0' })
    })
    expect(result.status).to.equal(200)

    const device = await findDevice('identity-update')
    expect(device?.deviceInfo).to.deep.equal({
      ...DEVICE_INFO,
      softwareVersion: '3.7.0'
    })
  })

  it('rejects an invalid device object update', async function () {
    const token = await requestAndApprove('identity-update-invalid', {})

    const result = await fetch(`${url}/skServer/device/info`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ softwareVersion: 'x'.repeat(129) })
    })
    expect(result.status).to.equal(400)
  })

  it('lets only devices report device info', async function () {
    const result = await fetch(`${url}/skServer/device/info`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify(DEVICE_INFO)
    })
    expect(result.status).to.equal(403)
  })

  it('keeps the device object out of admin updates', async function () {
    await requestAndApprove('identity-admin', { device: DEVICE_INFO })

    const result = await fetch(
      `${url}/skServer/security/devices/identity-admin`,
      {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({
          displayName: 'Renamed',
          deviceInfo: { software: 'Spoofed' }
        })
      }
    )
    expect(result.status).to.equal(200)

    const device = await findDevice('identity-admin')
    expect(device?.displayName).to.equal('Renamed')
    expect(device?.deviceInfo).to.deep.equal(DEVICE_INFO)
  })

  it('reports the User-Agent of the latest HTTP request', async function () {
    const token = await requestAndApprove('identity-http', {})

    await fetch(`${url}/skServer/loginStatus`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'espOS/0.23.0'
      }
    })

    const device = await findDevice('identity-http')
    expect(device?.userAgent).to.equal('espOS/0.23.0')
  })

  it('reports the User-Agent of a WebSocket connection', async function () {
    const token = await requestAndApprove('identity-ws', {})

    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(
        `${url.replace('http', 'ws')}/signalk/v1/stream?subscribe=none`,
        {
          headers: {
            Cookie: `JAUTHENTICATION=${token}`,
            'User-Agent': 'ESP32 Websocket Client'
          }
        }
      )
      socket.once('message', () => resolve(socket))
      socket.once('error', reject)
    })
    try {
      expect(
        server.app.deviceTracker.getState('identity-ws')?.userAgent
      ).to.equal('ESP32 Websocket Client')
    } finally {
      ws.close()
    }
  })
})

// A file-backed security config is read from disk on every request and
// saved asynchronously, so overlapping requests are possible only here.
describe('Device token regeneration with a file-backed security config', function () {
  this.timeout(SERVER_START_TIMEOUT)

  const SECRET_KEY = 'device-token-regeneration-secret'
  const ADMIN_USERNAME = 'regeneration-admin'
  const DEVICE_ID = 'regeneration-device'

  let url: string
  let server: { stop: () => Promise<void> } | undefined
  let configDir: string | undefined

  before(async function () {
    const port = await freeport()
    url = `http://localhost:${port}`
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-device-token-'))
    fs.writeFileSync(
      path.join(configDir, 'settings.json'),
      JSON.stringify({
        port,
        interfaces: { plugins: false },
        pipedProviders: [],
        security: { strategy: './tokensecurity' }
      })
    )
    fs.writeFileSync(
      path.join(configDir, 'security.json'),
      JSON.stringify({
        secretKey: SECRET_KEY,
        users: [{ username: ADMIN_USERNAME, type: 'admin' }],
        devices: [
          {
            clientId: DEVICE_ID,
            permissions: 'readonly',
            config: {},
            description: 'regeneration test',
            requestedPermissions: ''
          }
        ]
      })
    )
    server = await startServerFromConfigP(configDir)
  })

  after(async function () {
    try {
      await server?.stop()
    } finally {
      if (configDir !== undefined) {
        await rimraf(configDir)
      }
    }
  })

  it('issues distinct versions to concurrent regenerations', async function () {
    const adminToken = jwt.sign({ id: ADMIN_USERNAME }, SECRET_KEY)
    const regenerate = async (): Promise<string> => {
      const result = await fetch(
        `${url}/skServer/security/devices/${DEVICE_ID}/token`,
        {
          method: 'POST',
          headers: { Cookie: `JAUTHENTICATION=${adminToken}` }
        }
      )
      expect(result.status).to.equal(200)
      return (await result.json()).token
    }
    const loginStatus = async (token: string): Promise<string> => {
      const result = await fetch(`${url}/skServer/loginStatus?token=${token}`)
      return (await result.json()).status
    }

    const tokens = await Promise.all([regenerate(), regenerate()])
    const versions = tokens.map(
      (token) => (jwt.decode(token) as { ver: number }).ver
    )
    expect(versions).to.have.members([1, 2])

    const [latest, earlier] =
      versions[0] > versions[1] ? tokens : [tokens[1], tokens[0]]
    expect(await loginStatus(latest)).to.equal('loggedIn')
    expect(await loginStatus(earlier)).to.equal('notLoggedIn')
  })
})

describe('DeviceTracker', function () {
  interface AdminDeviceEvent {
    type: string
    data: Partial<DeviceStateEvent>
  }

  it('tracks connect and disconnect', function () {
    const events: AdminDeviceEvent[] = []
    const tracker = new DeviceTracker((e) => events.push(e as AdminDeviceEvent))

    tracker.onConnect('device-1', '10.0.0.1')
    let state = tracker.getState('device-1')!
    expect(state.isConnected).to.be.true
    expect(state.connectionCount).to.equal(1)
    expect(state.lastIp).to.equal('10.0.0.1')

    tracker.onDisconnect('device-1')
    state = tracker.getState('device-1')!
    expect(state.isConnected).to.be.false
    expect(state.connectionCount).to.equal(0)

    tracker.destroy()
  })

  it('tracks multiple connections', function () {
    const events: AdminDeviceEvent[] = []
    const tracker = new DeviceTracker((e) => events.push(e as AdminDeviceEvent))

    tracker.onConnect('device-2', '10.0.0.1')
    tracker.onConnect('device-2', '10.0.0.1')
    let state = tracker.getState('device-2')!
    expect(state.connectionCount).to.equal(2)
    expect(state.isConnected).to.be.true
    expect(events, 'second connection emits no extra event').to.have.lengthOf(1)

    tracker.onDisconnect('device-2')
    state = tracker.getState('device-2')!
    expect(state.connectionCount).to.equal(1)
    expect(state.isConnected).to.be.true
    expect(
      events,
      'intermediate disconnect emits no disconnected event'
    ).to.have.lengthOf(1)

    tracker.onDisconnect('device-2')
    state = tracker.getState('device-2')!
    expect(state.connectionCount).to.equal(0)
    expect(state.isConnected).to.be.false
    expect(events).to.have.lengthOf(2)
    expect(events[1].data.connected).to.be.false

    tracker.destroy()
  })

  it('records the User-Agent and caps its length', function () {
    const events: AdminDeviceEvent[] = []
    const tracker = new DeviceTracker((e) => events.push(e as AdminDeviceEvent))

    tracker.onConnect('device-ua', '10.0.0.1', 'SensESP/3.6.1')
    expect(tracker.getState('device-ua')?.userAgent).to.equal('SensESP/3.6.1')
    expect(events[0].data.userAgent).to.equal('SensESP/3.6.1')

    tracker.onActivity('device-ua', '10.0.0.1', 'espOS/0.23.0')
    expect(tracker.getState('device-ua')?.userAgent).to.equal('espOS/0.23.0')

    expect(userAgentOf({ 'user-agent': 'a'.repeat(300) })).to.have.lengthOf(256)
    expect(userAgentOf({})).to.be.undefined

    tracker.destroy()
  })

  it('tracks HTTP activity', function () {
    const tracker = new DeviceTracker(() => {})

    tracker.onActivity('device-3', '10.0.0.5')
    const state = tracker.getState('device-3')!
    expect(state.isConnected).to.be.true
    expect(state.connectionCount).to.equal(0)
    expect(state.lastIp).to.equal('10.0.0.5')

    tracker.destroy()
  })

  it('removes device state', function () {
    const tracker = new DeviceTracker(() => {})

    tracker.onConnect('device-4', '10.0.0.1')
    expect(tracker.getState('device-4')).to.exist

    tracker.onDeviceRemoved('device-4')
    expect(tracker.getState('device-4')).to.be.undefined

    tracker.destroy()
  })

  it('stores and retrieves plugin data', function () {
    const events: AdminDeviceEvent[] = []
    const tracker = new DeviceTracker((e) => events.push(e as AdminDeviceEvent))

    tracker.onConnect('device-5', '10.0.0.1')
    tracker.setPluginData('my-plugin', 'device-5', {
      firmware: '2.1.0',
      board: 'esp32'
    })

    const data = tracker.getPluginData('my-plugin', 'device-5')
    expect(data).to.deep.equal({ firmware: '2.1.0', board: 'esp32' })

    expect(tracker.getPluginData('other-plugin', 'device-5')).to.be.undefined

    expect(events, 'setPluginData emits a status change').to.have.lengthOf(2)
    expect(events[1].type).to.equal('DEVICE_STATUS_CHANGE')
    expect(events[1].data.clientId).to.equal('device-5')

    tracker.destroy()
  })

  it('emits state change events', function () {
    const events: AdminDeviceEvent[] = []
    const tracker = new DeviceTracker((e) => events.push(e as AdminDeviceEvent))

    tracker.onConnect('device-6', '10.0.0.1')
    expect(events).to.have.lengthOf(1)
    const connectEvent = events[0]
    expect(connectEvent.type).to.equal('DEVICE_STATUS_CHANGE')
    expect(connectEvent.data.clientId).to.equal('device-6')
    expect(connectEvent.data.connected).to.be.true

    tracker.onDisconnect('device-6')
    expect(events).to.have.lengthOf(2)
    const disconnectEvent = events[1]
    expect(disconnectEvent.type).to.equal('DEVICE_STATUS_CHANGE')
    expect(disconnectEvent.data.clientId).to.equal('device-6')
    expect(disconnectEvent.data.connected).to.be.false

    tracker.destroy()
  })
})
