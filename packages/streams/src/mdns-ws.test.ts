import { expect } from 'chai'
import { WebSocketServer } from 'ws'
import { Writable } from 'stream'
import MdnsWs from './mdns-ws'
import { createMockApp, createDebugStub } from './test-helpers'

const SK_HELLO = JSON.stringify({
  name: 'test-server',
  version: '2.0.0',
  roles: ['master'],
  self: 'vessels.urn:mrn:imo:mmsi:123456789'
})

function createSkWsServer(): Promise<{
  wss: InstanceType<typeof WebSocketServer>
  port: number
  close: () => Promise<void>
}> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer(
      {
        port: 0,
        host: '127.0.0.1',
        path: '/signalk/v1/stream'
      },
      () => {
        const addr = wss.address() as { port: number }
        resolve({
          wss,
          port: addr.port,
          close: () =>
            new Promise<void>((res) => {
              wss.clients.forEach((c: { close: () => void }) => c.close())
              wss.close(() => res())
            })
        })
      }
    )

    wss.on('connection', (ws: { send: (data: string) => void }) => {
      ws.send(SK_HELLO)
    })
  })
}

function createSink(): {
  chunks: unknown[]
  writable: InstanceType<typeof Writable>
} {
  const chunks: unknown[] = []
  const writable = new Writable({
    objectMode: true,
    write(chunk: unknown, _encoding: string, callback: () => void) {
      chunks.push(chunk)
      writable.emit('data-received', chunk)
      callback()
    }
  })
  return { chunks, writable }
}

describe('MdnsWs', () => {
  it('sets provider status on successful connection', function (done) {
    this.timeout(10000)
    let server: Awaited<ReturnType<typeof createSkWsServer>>

    createSkWsServer().then((s) => {
      server = s
      const app = createMockApp()
      const mdns = new MdnsWs({
        app,
        providerId: 'test-mdns',
        host: '127.0.0.1',
        port: server.port,
        createDebug: createDebugStub()
      })

      mdns.pipe(createSink().writable)

      const check = setInterval(() => {
        if (app.providerStatuses.some((s) => s.msg.includes('connected'))) {
          clearInterval(check)
          mdns.destroy()
          server.close().then(() => done())
        }
      }, 100)
    })
  })

  it('sets provider error on connection failure', function (done) {
    this.timeout(10000)
    const app = createMockApp()
    const mdns = new MdnsWs({
      app,
      providerId: 'test-mdns',
      host: '127.0.0.1',
      port: 1,
      createDebug: createDebugStub()
    })

    mdns.pipe(createSink().writable)

    const check = setInterval(() => {
      if (app.providerErrors.length > 0) {
        clearInterval(check)
        expect(app.providerErrors[0]!.id).to.equal('test-mdns')
        mdns.destroy()
        done()
      }
    }, 100)
  })

  it('detects disconnect when server closes', function (done) {
    this.timeout(10000)
    let server: Awaited<ReturnType<typeof createSkWsServer>>

    createSkWsServer().then((s) => {
      server = s
      const app = createMockApp()
      const mdns = new MdnsWs({
        app,
        providerId: 'test-mdns',
        host: '127.0.0.1',
        port: server.port,
        createDebug: createDebugStub()
      })

      mdns.pipe(createSink().writable)

      const checkConnected = setInterval(() => {
        if (app.providerStatuses.some((s) => s.msg.includes('connected'))) {
          clearInterval(checkConnected)

          server.close().then(() => {
            const checkDisconnect = setInterval(() => {
              if (
                app.providerErrors.some((e) => e.msg.includes('disconnect'))
              ) {
                clearInterval(checkDisconnect)
                mdns.destroy()
                done()
              }
            }, 100)
          })
        }
      }, 100)
    })
  })

  it('receives delta data through the stream', function (done) {
    this.timeout(10000)
    let server: Awaited<ReturnType<typeof createSkWsServer>>

    createSkWsServer().then((s) => {
      server = s

      server.wss.on('connection', (ws: { send: (data: string) => void }) => {
        setTimeout(() => {
          ws.send(
            JSON.stringify({
              context: 'vessels.urn:mrn:imo:mmsi:123456789',
              updates: [
                {
                  values: [{ path: 'navigation.speedOverGround', value: 3.5 }],
                  source: { label: 'test' }
                }
              ]
            })
          )
        }, 200)
      })

      const app = createMockApp()
      const mdns = new MdnsWs({
        app,
        providerId: 'test-mdns',
        host: '127.0.0.1',
        port: server.port,
        createDebug: createDebugStub()
      })

      const { chunks, writable } = createSink()
      mdns.pipe(writable)

      interface DeltaChunk {
        updates?: Array<{
          values?: Array<{ path: string }>
          $source?: string
        }>
      }

      writable.on('data-received', () => {
        const delta = chunks.find(
          (c) =>
            (c as DeltaChunk)?.updates?.[0]?.values?.[0]?.path ===
            'navigation.speedOverGround'
        )
        if (delta) {
          expect((delta as DeltaChunk).updates![0]!['$source']).to.include(
            'test-mdns'
          )
          mdns.destroy()
          server.close().then(() => done())
        }
      })
    })
  })
})
