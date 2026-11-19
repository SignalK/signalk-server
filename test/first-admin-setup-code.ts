import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { freeport, SERVER_START_TIMEOUT } from './ts-servertestutilities'
import { startServerP } from './servertestutilities'

const LAN_ADDRESS = '192.168.1.20'
const INTERNET_ADDRESS = '203.0.113.7'

describe('Setup code for the first admin account', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let url: string
  let configDir: string
  let setupCode: string | undefined
  const originalConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR

  before(async function () {
    this.timeout(SERVER_START_TIMEOUT)
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-setup-code-'))
    const port = await freeport()
    url = `http://127.0.0.1:${port}`
    const log = console.log
    console.log = (...args: unknown[]) => {
      const match = /setup code (\w+)/.exec(String(args[0]))
      if (match) {
        setupCode = match[1]
      }
      log(...args)
    }
    try {
      server = await startServerP(
        port,
        false,
        { settings: { trustProxy: true } },
        undefined,
        configDir
      )
    } finally {
      console.log = log
    }
  })

  after(async function () {
    await server.stop()
    fs.rmSync(configDir, { recursive: true, force: true })
    if (originalConfigDir === undefined) {
      delete process.env.SIGNALK_NODE_CONFIG_DIR
    } else {
      process.env.SIGNALK_NODE_CONFIG_DIR = originalConfigDir
    }
  })

  const loginStatusFrom = async (address: string) =>
    (
      await fetch(`${url}/skServer/loginStatus`, {
        headers: { 'X-Forwarded-For': address }
      })
    ).json()

  const enableSecurityFrom = (address: string, body: object) =>
    fetch(`${url}/skServer/enableSecurity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': address
      },
      body: JSON.stringify({ userId: 'admin', password: 'secret', ...body })
    })

  it('prints a setup code when the server starts without users', () => {
    expect(setupCode).to.match(/^[0-9a-f]{12}$/)
  })

  it('asks only internet visitors for the setup code', async () => {
    expect((await loginStatusFrom(LAN_ADDRESS)).setupCodeRequired).to.equal(
      undefined
    )
    expect(
      (await loginStatusFrom(INTERNET_ADDRESS)).setupCodeRequired
    ).to.equal(true)
  })

  it('refuses an internet visitor without the right setup code', async () => {
    let res = await enableSecurityFrom(INTERNET_ADDRESS, {})
    expect(res.status).to.equal(403)
    res = await enableSecurityFrom(INTERNET_ADDRESS, {
      setupCode: '000000000000'
    })
    expect(res.status).to.equal(403)
    expect(server.app.securityStrategy.isDummy()).to.equal(true)
  })

  it('creates the admin for an internet visitor with the setup code', async () => {
    const res = await enableSecurityFrom(INTERNET_ADDRESS, {
      setupCode: ` ${setupCode!.toUpperCase()} `
    })
    expect(res.status).to.equal(200)
    expect(await res.text()).to.equal('Security enabled')
  })
})
