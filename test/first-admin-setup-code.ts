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
    const writeSync = fs.writeSync
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(fs as any).writeSync = (
      fd: number,
      data: unknown,
      ...rest: unknown[]
    ) => {
      const match = /setup code (\w+)/.exec(String(data))
      if (match) {
        setupCode = match[1]
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (writeSync as any)(fd, data, ...rest)
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(fs as any).writeSync = writeSync
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

  it('keeps the setup code out of the server log the Admin UI shows', () => {
    const log = server.app.logging.getLog() as { row: string }[]
    expect(log.some(({ row }) => row.includes(setupCode!))).to.equal(false)
  })

  it('asks only internet visitors for the setup code', async () => {
    expect((await loginStatusFrom(LAN_ADDRESS)).setupCodeRequired).to.equal(
      undefined
    )
    expect(
      (await loginStatusFrom(INTERNET_ADDRESS)).setupCodeRequired
    ).to.equal(true)
  })

  it('is not fooled by a local address added in front of the real one', async () => {
    expect(
      (await loginStatusFrom(`${LAN_ADDRESS}, ${INTERNET_ADDRESS}`))
        .setupCodeRequired
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
