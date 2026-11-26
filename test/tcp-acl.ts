import { expect } from 'chai'
import { connect, Socket } from 'net'
import { freeport } from './ts-servertestutilities'
import { startServerP } from './servertestutilities'

const COLLECT_MS = 300

const securityConfig = {
  allow_readonly: true,
  acls: [
    {
      context: 'vessels.self',
      resources: [
        {
          paths: ['environment.*'],
          permissions: [{ subject: 'any', permission: 'read' }]
        },
        {
          paths: ['*'],
          permissions: [{ subject: 'adminuser', permission: 'read' }]
        }
      ]
    }
  ]
}

const delta = (path: string, value: unknown) => ({
  context: 'vessels.self',
  updates: [{ values: [{ path, value }] }]
})

describe('TCP stream with ACLs', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let tcpPort: number
  let socket: Socket | undefined

  before(async function () {
    const port = await freeport()
    tcpPort = await freeport()
    process.env.TCPSTREAMPORT = String(tcpPort)
    try {
      server = await startServerP(port, true, {}, securityConfig)
    } finally {
      delete process.env.TCPSTREAMPORT
    }
  })

  afterEach(function () {
    socket?.destroy()
  })

  after(async function () {
    await server.stop()
  })

  it('applies read ACLs to cached and live deltas', async function () {
    server.app.handleMessage('test', delta('navigation.speedOverGround', 1))
    server.app.handleMessage('test', delta('environment.depth.belowKeel', 1))

    const lines: string[] = []
    let buffer = ''
    socket = connect(tcpPort, '127.0.0.1')
    socket.on('data', (data) => {
      buffer += data.toString()
      const parts = buffer.split('\r\n')
      buffer = parts.pop() ?? ''
      lines.push(...parts)
    })
    await new Promise((resolve) => socket!.once('connect', resolve))

    socket.write(
      JSON.stringify({ context: 'vessels.self', subscribe: [{ path: '*' }] }) +
        '\r\n'
    )
    await new Promise((resolve) => setTimeout(resolve, COLLECT_MS))

    server.app.handleMessage('test', delta('navigation.speedOverGround', 2))
    server.app.handleMessage('test', delta('environment.depth.belowKeel', 2))
    await new Promise((resolve) => setTimeout(resolve, COLLECT_MS))

    const values = lines
      .map((line) => JSON.parse(line))
      .filter((msg) => msg.updates)
      .flatMap((msg) =>
        msg.updates.flatMap(
          (update: { values: { path: string; value: unknown }[] }) =>
            update.values
        )
      )

    expect(values.map((v) => v.path)).to.not.include(
      'navigation.speedOverGround'
    )
    expect(values).to.deep.include({
      path: 'environment.depth.belowKeel',
      value: 1
    })
    expect(values).to.deep.include({
      path: 'environment.depth.belowKeel',
      value: 2
    })
  })
})
