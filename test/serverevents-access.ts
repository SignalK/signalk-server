import chai from 'chai'
import { freeport } from './ts-servertestutilities'
import {
  startServerP,
  getAdminToken,
  getReadOnlyToken,
  WsPromiser
} from './servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(chai as any).Should()

// `?serverevents=all` bootstraps a connection with server state. Non-admin
// connections may only receive the types the admin UI renders for every user
// (vessel identity, dashboard statistics, login status); server configuration
// and source/priority state are admin-only.

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// SERVERSTATISTICS and PROVIDERSTATUS are also allowed for non-admins, but a
// freshly started server has not emitted them yet, so they never reach the
// bootstrap replay here and cannot be asserted on.
const NON_ADMIN = ['VESSEL_INFO', 'RECEIVE_LOGIN_STATUS']
const ADMIN_ONLY = [
  'DEBUG_SETTINGS',
  'HISTORYPROVIDERS',
  'PRIORITYOVERRIDES',
  'SOURCEALIASES',
  'PRIORITYGROUPS',
  'PRIORITYDEFAULTS',
  'MULTISOURCEPATHS',
  'RECONCILEDGROUPS'
]

async function receivedTypes(url: string): Promise<Set<string>> {
  const promiser = new WsPromiser(url)
  await promiser.nextMsg() // hello
  await delay(600)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = promiser.parsedMessages()
  promiser.close()
  return new Set(
    messages.filter((m) => m && typeof m.type === 'string').map((m) => m.type)
  )
}

describe('Server events websocket access', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let port: number
  let adminToken: string
  let readToken: string

  before(async function () {
    this.timeout(90000)
    port = await freeport()
    server = await startServerP(port, true)
    adminToken = await getAdminToken(server)
    readToken = await getReadOnlyToken(server)
  })

  after(async function () {
    await server.stop()
  })

  function streamUrl(token?: string): string {
    const base =
      `ws://0.0.0.0:${port}/signalk/v1/stream` +
      '?serverevents=all&subscribe=none&sendCachedValues=false'
    return token ? `${base}&token=${token}` : base
  }

  it('withholds server configuration from an anonymous client', async function () {
    const types = await receivedTypes(streamUrl())
    ADMIN_ONLY.forEach((type) => types.has(type).should.equal(false, type))
  })

  it('withholds server configuration from a non-admin user', async function () {
    const types = await receivedTypes(streamUrl(readToken))
    ADMIN_ONLY.forEach((type) => types.has(type).should.equal(false, type))
  })

  it('still sends a non-admin user what the admin UI renders for everyone', async function () {
    const types = await receivedTypes(streamUrl(readToken))
    NON_ADMIN.forEach((type) => types.has(type).should.equal(true, type))
  })

  it('sends everything to an admin user', async function () {
    const types = await receivedTypes(streamUrl(adminToken))
    ADMIN_ONLY.forEach((type) => types.has(type).should.equal(true, type))
    NON_ADMIN.forEach((type) => types.has(type).should.equal(true, type))
  })
})
