import assert from 'assert'
import net from 'net'
import { ConnectionTracker } from '../src/connectionTracker'

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as net.AddressInfo).port)
    })
  })
}

function connect(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => resolve(socket))
    socket.once('error', reject)
  })
}

const SHORT_GRACE_MS = 50
// Long enough that close() finishing early proves it did not wait it out.
const LONG_GRACE_MS = 10000
const CLOSE_BUDGET_MS = 1000

describe('ConnectionTracker', () => {
  it('destroys connections still open after the grace period', async () => {
    const server = net.createServer()
    const tracker = new ConnectionTracker(server)
    const client = await connect(await listen(server))
    const clientClosed = new Promise((resolve) => client.once('close', resolve))

    const t0 = Date.now()
    await new Promise<void>((resolve) => tracker.close(SHORT_GRACE_MS, resolve))
    await clientClosed
    assert(Date.now() - t0 < CLOSE_BUDGET_MS)
  })

  it('closes at once when no connection is open', async () => {
    const server = net.createServer()
    const tracker = new ConnectionTracker(server)
    const client = await connect(await listen(server))
    await new Promise((resolve) => {
      client.once('close', resolve)
      client.end()
    })

    const t0 = Date.now()
    await new Promise<void>((resolve) => tracker.close(LONG_GRACE_MS, resolve))
    assert(Date.now() - t0 < CLOSE_BUDGET_MS)
  })
})
