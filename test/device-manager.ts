import chai from 'chai'
import jwt from 'jsonwebtoken'
import type { StringValue } from 'ms'
import path from 'path'
import { rimraf } from 'rimraf'
import { freeport } from './ts-servertestutilities'
import {
  startServerP,
  getAdminToken,
  getReadOnlyToken
} from './servertestutilities'

const expect = chai.expect
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(chai as any).Should()

describe('Device Manager', function () {
  let url: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
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

  function createDeviceToken(
    clientId: string,
    opts?: { expiresIn?: string }
  ): string {
    const jwtOpts: jwt.SignOptions = {}
    if (opts?.expiresIn) {
      jwtOpts.expiresIn = opts.expiresIn as StringValue
    }
    return jwt.sign({ device: clientId }, secretKey, jwtOpts)
  }

  before(async function () {
    this.timeout(20000)
    const port = await freeport()
    url = `http://0.0.0.0:${port}`
    server = await startServerP(port, true)
    adminToken = await getAdminToken(server)
    readToken = await getReadOnlyToken(server)
    secretKey = server.app.securityStrategy.securityConfig.secretKey
  })

  after(async function () {
    await server.stop()
  })

  describe('?token= HTTP auth', function () {
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

      config.devices = config.devices.filter(
        (d: { clientId: string }) => d.clientId !== 'token-auth-test-device'
      )
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
      expect(devices).to.be.an('array')
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
  })

  describe('Dashboard redirect', function () {
    let redirectDeviceToken: string

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

    it('does not redirect device without dashboard', async function () {
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

    it('does not redirect user tokens', async function () {
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
        path.join(
          process.env.SIGNALK_NODE_CONFIG_DIR as string,
          'applicationData',
          'devices'
        )
      )
    })

    it('device can write and read own applicationData', async function () {
      const data = { dashboard: 'helm', gauges: [1, 2, 3] }
      const postResult = await fetch(
        `${url}/signalk/v1/applicationData/device/${deviceClientId}/testapp/1.0.0`,
        {
          method: 'POST',
          headers: {
            ...tokenHeaders(deviceToken),
            'Content-Type': 'application/json'
          },
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
          headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
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
  })

  describe('Plugin route permissions', function () {
    it('registers and enforces route permissions', async function () {
      const config = server.app.securityStrategy.securityConfig
      config.devices = config.devices || []
      const clientId = 'route-perm-test-device'
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

      config.devices = config.devices.filter(
        (d: { clientId: string }) => d.clientId !== clientId
      )
    })

    it('denies readonly device access to readwrite routes', async function () {
      const config = server.app.securityStrategy.securityConfig
      config.devices = config.devices || []
      const clientId = 'route-perm-ro-device'
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

      config.devices = config.devices.filter(
        (d: { clientId: string }) => d.clientId !== clientId
      )
    })
  })
})

describe('DeviceTracker', function () {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const DeviceTracker = (require('../dist/deviceTracker') as any).DeviceTracker

  it('tracks connect and disconnect', function () {
    const events: unknown[] = []
    const tracker = new DeviceTracker((e: unknown) => events.push(e))

    tracker.onConnect('device-1', '10.0.0.1')
    let state = tracker.getState('device-1')
    expect(state.isConnected).to.be.true
    expect(state.connectionCount).to.equal(1)
    expect(state.lastIp).to.equal('10.0.0.1')

    tracker.onDisconnect('device-1')
    state = tracker.getState('device-1')
    expect(state.isConnected).to.be.false
    expect(state.connectionCount).to.equal(0)

    tracker.destroy()
  })

  it('tracks multiple connections', function () {
    const tracker = new DeviceTracker(() => {})

    tracker.onConnect('device-2', '10.0.0.1')
    tracker.onConnect('device-2', '10.0.0.1')
    let state = tracker.getState('device-2')
    expect(state.connectionCount).to.equal(2)
    expect(state.isConnected).to.be.true

    tracker.onDisconnect('device-2')
    state = tracker.getState('device-2')
    expect(state.connectionCount).to.equal(1)
    expect(state.isConnected).to.be.true

    tracker.onDisconnect('device-2')
    state = tracker.getState('device-2')
    expect(state.connectionCount).to.equal(0)
    expect(state.isConnected).to.be.false

    tracker.destroy()
  })

  it('tracks HTTP activity', function () {
    const tracker = new DeviceTracker(() => {})

    tracker.onActivity('device-3', '10.0.0.5')
    const state = tracker.getState('device-3')
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
    const tracker = new DeviceTracker(() => {})

    tracker.onConnect('device-5', '10.0.0.1')
    tracker.setPluginData('my-plugin', 'device-5', {
      firmware: '2.1.0',
      board: 'esp32'
    })

    const data = tracker.getPluginData('my-plugin', 'device-5')
    expect(data).to.deep.equal({ firmware: '2.1.0', board: 'esp32' })

    expect(tracker.getPluginData('other-plugin', 'device-5')).to.be.undefined

    tracker.destroy()
  })

  it('emits state change events', function () {
    const events: unknown[] = []
    const tracker = new DeviceTracker((e: unknown) => events.push(e))

    tracker.onConnect('device-6', '10.0.0.1')
    expect(events).to.have.lengthOf(1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connectEvent = events[0] as any
    expect(connectEvent.type).to.equal('DEVICE_STATUS_CHANGE')
    expect(connectEvent.data.clientId).to.equal('device-6')
    expect(connectEvent.data.connected).to.be.true

    tracker.onDisconnect('device-6')
    expect(events).to.have.lengthOf(2)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const disconnectEvent = events[1] as any
    expect(disconnectEvent.type).to.equal('DEVICE_STATUS_CHANGE')
    expect(disconnectEvent.data.clientId).to.equal('device-6')
    expect(disconnectEvent.data.connected).to.be.false

    tracker.destroy()
  })
})
