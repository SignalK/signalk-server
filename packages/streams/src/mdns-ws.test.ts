import { expect } from 'chai'
import { WebSocketServer } from 'ws'
import { Writable } from 'stream'
import MdnsWs from './mdns-ws'
import { createMockApp, createDebugStub } from './test-helpers'

interface DeltaChunk {
  updates?: Array<{
    values?: Array<{ path: string }>
    $source?: string
    source?: { label?: string; [key: string]: unknown }
  }>
}

const SK_HELLO = JSON.stringify({
  name: 'test-server',
  version: '2.0.0',
  roles: ['master'],
  self: 'vessels.urn:mrn:imo:mmsi:123456789'
})

type SkServer = {
  wss: InstanceType<typeof WebSocketServer>
  port: number
  close: () => Promise<void>
}

function createSkWsServer(fixedPort = 0): Promise<SkServer> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer(
      {
        port: fixedPort,
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
  const intervals: ReturnType<typeof setInterval>[] = []
  const servers: SkServer[] = []
  const mdnsInstances: MdnsWs[] = []

  function track<T extends ReturnType<typeof setInterval>>(id: T): T {
    intervals.push(id)
    return id
  }

  function trackServer(s: SkServer): SkServer {
    servers.push(s)
    return s
  }

  function trackMdns(m: MdnsWs): MdnsWs {
    mdnsInstances.push(m)
    return m
  }

  afterEach(async () => {
    while (intervals.length) {
      clearInterval(intervals.pop()!)
    }
    while (mdnsInstances.length) {
      mdnsInstances.pop()!.destroy()
    }
    while (servers.length) {
      await servers.pop()!.close()
    }
  })

  it('sets provider status on successful connection', function (done) {
    this.timeout(10000)

    createSkWsServer().then((s) => {
      trackServer(s)
      const app = createMockApp()
      const mdns = trackMdns(
        new MdnsWs({
          app,
          providerId: 'test-mdns',
          host: '127.0.0.1',
          port: s.port,
          createDebug: createDebugStub()
        })
      )

      mdns.pipe(createSink().writable)

      const check = track(
        setInterval(() => {
          if (app.providerStatuses.some((st) => st.msg.includes('connected'))) {
            clearInterval(check)
            done()
          }
        }, 100)
      )
    })
  })

  it('sets provider error on connection failure', function (done) {
    this.timeout(10000)
    const app = createMockApp()
    const mdns = trackMdns(
      new MdnsWs({
        app,
        providerId: 'test-mdns',
        host: '127.0.0.1',
        port: 1,
        createDebug: createDebugStub()
      })
    )

    mdns.pipe(createSink().writable)

    const check = track(
      setInterval(() => {
        if (app.providerErrors.length > 0) {
          clearInterval(check)
          expect(app.providerErrors[0]!.id).to.equal('test-mdns')
          done()
        }
      }, 100)
    )
  })

  it('detects disconnect when server closes', function (done) {
    this.timeout(10000)

    createSkWsServer().then((s) => {
      trackServer(s)
      const app = createMockApp()
      const mdns = trackMdns(
        new MdnsWs({
          app,
          providerId: 'test-mdns',
          host: '127.0.0.1',
          port: s.port,
          createDebug: createDebugStub()
        })
      )

      mdns.pipe(createSink().writable)

      const checkConnected = track(
        setInterval(() => {
          if (app.providerStatuses.some((st) => st.msg.includes('connected'))) {
            clearInterval(checkConnected)

            s.close().then(() => {
              const checkDisconnect = track(
                setInterval(() => {
                  if (
                    app.providerErrors.some((e) =>
                      e.msg.toLowerCase().includes('disconnect')
                    )
                  ) {
                    clearInterval(checkDisconnect)
                    done()
                  }
                }, 100)
              )
            })
          }
        }, 100)
      )
    })
  })

  it('reconnects and re-establishes data flow', function (done) {
    this.timeout(30000)

    createSkWsServer().then((s) => {
      trackServer(s)
      const app = createMockApp()
      const mdns = trackMdns(
        new MdnsWs({
          app,
          providerId: 'test-mdns',
          host: '127.0.0.1',
          port: s.port,
          createDebug: createDebugStub()
        })
      )

      const { chunks, writable } = createSink()
      mdns.pipe(writable)

      const waitForConnect = track(
        setInterval(() => {
          if (app.providerStatuses.some((st) => st.msg.includes('connected'))) {
            clearInterval(waitForConnect)
            const savedPort = s.port

            s.close().then(() => {
              const waitForDisconnect = track(
                setInterval(() => {
                  if (
                    app.providerErrors.some((e) =>
                      e.msg.toLowerCase().includes('disconnect')
                    )
                  ) {
                    clearInterval(waitForDisconnect)
                    app.providerStatuses.length = 0

                    createSkWsServer(savedPort).then((s2) => {
                      trackServer(s2)
                      s2.wss.on(
                        'connection',
                        (ws: { send: (data: string) => void }) => {
                          setTimeout(() => {
                            ws.send(
                              JSON.stringify({
                                context: 'vessels.urn:mrn:imo:mmsi:123456789',
                                updates: [
                                  {
                                    values: [
                                      {
                                        path: 'navigation.courseOverGroundTrue',
                                        value: 1.23
                                      }
                                    ],
                                    source: { label: 'test' }
                                  }
                                ]
                              })
                            )
                          }, 200)
                        }
                      )

                      const onData = () => {
                        const delta = chunks.find(
                          (c) =>
                            (c as DeltaChunk)?.updates?.[0]?.values?.[0]
                              ?.path === 'navigation.courseOverGroundTrue'
                        )
                        if (delta) {
                          writable.off('data-received', onData)
                          // Updates that already carry source identity
                          // (here `source.label === 'test'`) are passed
                          // through unchanged; stamping the local
                          // providerId would overwrite the upstream
                          // server's identity. handleMessage on the
                          // receiving side will derive $source from the
                          // remote source object.
                          const update = (delta as DeltaChunk).updates![0]!
                          expect(update.source?.label).to.equal('test')
                          done()
                        }
                      }
                      writable.on('data-received', onData)
                    })
                  }
                }, 100)
              )
            })
          }
        }, 100)
      )
    })
  })

  it('receives delta data through the stream', function (done) {
    this.timeout(10000)

    createSkWsServer().then((s) => {
      trackServer(s)

      s.wss.on('connection', (ws: { send: (data: string) => void }) => {
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
      const mdns = trackMdns(
        new MdnsWs({
          app,
          providerId: 'test-mdns',
          host: '127.0.0.1',
          port: s.port,
          createDebug: createDebugStub()
        })
      )

      const { chunks, writable } = createSink()
      mdns.pipe(writable)

      const onData = () => {
        const delta = chunks.find(
          (c) =>
            (c as DeltaChunk)?.updates?.[0]?.values?.[0]?.path ===
            'navigation.speedOverGround'
        )
        if (delta) {
          writable.off('data-received', onData)
          // Remote update arrives with `source: { label: 'test' }` —
          // identity is intact, so the provider does not stamp a local
          // $source over it (transport-agnostic source identity).
          const update = (delta as DeltaChunk).updates![0]!
          expect(update.source?.label).to.equal('test')
          done()
        }
      }
      writable.on('data-received', onData)
    })
  })
})
