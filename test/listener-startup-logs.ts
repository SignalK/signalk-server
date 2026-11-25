import { expect } from 'chai'
import { spawn } from 'node:child_process'
import { createServer, AddressInfo, Server } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { freeport } from './ts-servertestutilities'

async function inheritedListener() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return server
}

async function runServer(inherited: boolean, ssl: boolean) {
  const configDir = mkdtempSync(path.join(tmpdir(), 'sk-listener-log-'))
  const listeners: Server[] = []
  try {
    if (inherited) {
      listeners.push(await inheritedListener())
      if (ssl) listeners.push(await inheritedListener())
    }
    const port = await freeport()
    let sslport = await freeport()
    while (sslport === port) sslport = await freeport()
    const primaryPort = inherited
      ? (listeners[0].address() as AddressInfo).port
      : ssl
        ? sslport
        : port
    const redirectPort =
      inherited && ssl ? (listeners[1].address() as AddressInfo).port : port
    const child = spawn(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        path.join(__dirname, 'fixtures/listener-log-server.ts'),
        ssl ? 'ssl' : 'http'
      ],
      {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          LISTEN_FDS: String(listeners.length),
          SIGNALK_NODE_CONFIG_DIR: configDir,
          TEST_HTTP_PORT: String(port),
          TEST_HTTPS_PORT: String(sslport),
          PORT: '',
          SSLPORT: ''
        },
        stdio: [
          'ignore',
          'pipe',
          'pipe',
          ...listeners.map(
            (server) =>
              (server as unknown as { _handle: { fd: number } })._handle.fd
          )
        ],
        timeout: 90000
      }
    )
    let output = ''
    child.stdout!.on('data', (data: Buffer) => {
      output += data.toString()
    })
    child.stderr!.on('data', (data: Buffer) => {
      output += data.toString()
    })
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
    expect(code, output).to.equal(0)
    expect(output).to.include(`"port":${primaryPort}`)
    if (ssl) expect(output).to.include(`"port":${redirectPort}`)
    return { output, primaryPort, redirectPort }
  } finally {
    for (const listener of listeners) listener.close()
    rmSync(configDir, { recursive: true, force: true })
  }
}

describe('Listener startup logs', function () {
  it('reports the TCP ports for ordinary HTTPS and redirect listeners', async () => {
    const { output, primaryPort, redirectPort } = await runServer(false, true)
    expect(output).to.include(
      `signalk-server running at 0.0.0.0:${primaryPort}`
    )
    expect(output).to.include(`Redirect server running on port ${redirectPort}`)
  })

  const inheritedIt = process.platform === 'win32' ? it.skip : it
  inheritedIt(
    'identifies a systemd HTTP socket instead of an object',
    async () => {
      const { output } = await runServer(true, false)
      expect(output).not.to.include('[object Object]')
      expect(output).to.include('signalk-server running on systemd socket fd 3')
    }
  )

  inheritedIt(
    'identifies both inherited HTTPS and redirect sockets',
    async () => {
      const { output } = await runServer(true, true)
      expect(output).not.to.include('[object Object]')
      expect(output).to.include('signalk-server running on systemd socket fd 3')
      expect(output).to.include(
        'Redirect server running on systemd socket fd 4'
      )
    }
  )
})
