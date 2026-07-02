import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'
import { WsPromiser } from './servertestutilities'
import { Delta, hasValues, Path, Value } from '@signalk/server-api'

// Allow the per-message delivery to settle before asserting on the model.
const DELTA_SETTLE_MS = 200

const stwValuesIn = (delta: Delta, path: string): Value[] =>
  (delta.updates ?? [])
    .flatMap((u) => ('values' in u ? u.values : []))
    .filter((v) => v.path === (path as Path))
    .map((v) => v.value)

// registerDeltaInputHandler must intercept a delta BEFORE the server
// processes it — before source-priority filtering, before the delta is
// cached, and before it reaches the full data model. These tests assert
// that a handler's modifications are what the rest of the server sees.
describe('registerDeltaInputHandler ordering', () => {
  it('a handler modification reaches the full model and the unfiltered stream', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { server, sendADelta, getV1, stop } = (await startServer()) as any

    // Rewrite every speedThroughWater value to a sentinel.
    server.app.registerDeltaInputHandler(
      (delta: Delta, next: (d: Delta) => void) => {
        for (const u of delta.updates ?? []) {
          if (!('values' in u)) continue
          for (const v of u.values) {
            if (v.path === ('navigation.speedThroughWater' as Path)) {
              v.value = 42
            }
          }
        }
        next(delta)
      }
    )

    // The unfiltered stream must carry the handler's output (42), never
    // the original input value (1): handlers run before the
    // unfilteredDelta emission.
    const unfilteredValues: Value[] = []
    server.app.signalk.on('unfilteredDelta', (delta: Delta) => {
      unfilteredValues.push(
        ...stwValuesIn(delta, 'navigation.speedThroughWater')
      )
    })

    await sendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'test.src',
          values: [{ path: 'navigation.speedThroughWater', value: 1 }]
        }
      ]
    })
    await new Promise((r) => setTimeout(r, DELTA_SETTLE_MS))

    // Full model reflects the handler's rewrite (not the raw 1).
    const full = await getV1('/vessels/self/navigation/speedThroughWater').then(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => r.json()
    )
    expect(full.value).to.equal(42)

    // Unfiltered stream saw the rewrite, never the raw value.
    expect(unfilteredValues).to.include(42)
    expect(unfilteredValues).to.not.include(1)

    await stop()
  })

  it('dropping a delta (not calling next) keeps it out of the model', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { server, sendADelta, getV1, stop } = (await startServer()) as any

    server.app.registerDeltaInputHandler(
      (delta: Delta, next: (d: Delta) => void) => {
        const drop = (delta.updates ?? []).some(
          (u) =>
            'values' in u &&
            u.values.some(
              (v) => v.path === ('environment.outside.temperature' as Path)
            )
        )
        if (drop) return // do not call next -> delta dropped
        next(delta)
      }
    )

    await sendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'test.src',
          values: [{ path: 'environment.outside.temperature', value: 290 }]
        }
      ]
    })
    await new Promise((r) => setTimeout(r, DELTA_SETTLE_MS))

    const res = await getV1('/vessels/self/environment/outside/temperature')
    expect(res.status).to.equal(404)

    await stop()
  })
})

// End-to-end over a real WebSocket connection: a registered handler
// rewrites the raw value, a priority group ranks the sources, and a WS
// client on the default (priority-resolved) stream must receive the
// handler's rewritten value — proving the handler runs ahead of both
// source-priority filtering and the WebSocket fan-out.
describe('registerDeltaInputHandler ordering (WebSocket e2e)', () => {
  let stop: () => Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sendADelta: (delta: any) => Promise<Response>
  let host: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any

  before(async () => {
    const s = await startServer()
    stop = s.stop
    sendADelta = s.sendADelta
    host = s.host
    server = s.server

    server.app.registerDeltaInputHandler(
      (delta: Delta, next: (d: Delta) => void) => {
        for (const u of delta.updates ?? []) {
          if (!('values' in u)) continue
          for (const v of u.values) {
            if (v.path === ('navigation.speedThroughWater' as Path)) {
              // Mark the value so the assertion can prove the handler
              // touched it before anything downstream saw it.
              v.value = (v.value as number) + 1000
            }
          }
        }
        next(delta)
      }
    )
  })

  after(async () => {
    await stop()
  })

  it('a sourcePolicy=all WS client receives the handler-rewritten value over the wire', async () => {
    // A group ranks the corrected source above the raw one. A
    // sourcePolicy=all client reads the unfiltered stream, which is fed
    // ahead of source-priority filtering — so it must still carry the
    // handler's rewrite. Before the fix the unfiltered stream was emitted
    // before the handler ran and carried the raw value instead.
    server.app.config.settings.priorityGroups = [
      { id: 'g1', sources: ['stw.preferred', 'stw.backup'] }
    ]
    server.app.activateSourcePriorities()

    const wsUrl =
      host.replace('http', 'ws') +
      '/signalk/v1/stream?subscribe=self&sourcePolicy=all&metaDeltas=none&sendCachedValues=false'
    const ws = new WsPromiser(wsUrl)
    await ws.nthMessage(1) // hello

    await sendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'stw.preferred',
          timestamp: '2024-01-15T10:00:00.000Z',
          values: [{ path: 'navigation.speedThroughWater', value: 5 }]
        }
      ]
    })
    await ws.nthMessage(2)

    const stw = ws
      .parsedMessages()
      .slice(1)
      .flatMap((m: Delta) => m.updates ?? [])
      .flatMap((u) =>
        hasValues(u)
          ? u.values
              .filter(
                (v) => v.path === ('navigation.speedThroughWater' as Path)
              )
              .map((v) => ({ value: v.value, $source: u.$source }))
          : []
      )

    expect(stw.length).to.be.greaterThan(0)
    // 5 + 1000 from the handler, delivered over the wire.
    expect(stw[0].value).to.equal(1005)
    expect(stw[0].$source).to.equal('stw.preferred')

    ws.close()
  })
})
