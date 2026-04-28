/**
 * WebSocket stress test for Signal K Server.
 *
 * Replicates the event-loop stall described in
 * https://github.com/SignalK/signalk-server/issues/2624
 *
 * Usage:
 *   npx ts-node --transpile-only tools/ws-stress-test.ts [options]
 *
 * Options:
 *   --url <base>          Server base URL          (default: http://localhost:3000)
 *   --clients <n>         Number of WS clients     (default: 10)
 *   --subscriptions <n>   Subscriptions per client (default: 5)
 *   --http-interval <ms>  HTTP poll interval       (default: 5000)
 *   --duration <s>        Run duration in seconds  (default: unlimited)
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const http = require('http') as typeof import('http')
const https = require('https') as typeof import('https')
const WebSocket = require('ws') as typeof import('ws')
const minimist = require('minimist') as typeof import('minimist')

const args = minimist(process.argv.slice(2), {
  default: {
    url: 'http://localhost:3000',
    clients: 10,
    subscriptions: 5,
    'http-interval': 5000,
    duration: 0,
  },
})

const BASE_URL: string = args.url.replace(/\/$/, '')
const NUM_CLIENTS: number = Number(args.clients)
const SUBS_PER_CLIENT: number = Number(args.subscriptions)
const HTTP_INTERVAL: number = Number(args['http-interval'])
const DURATION: number = Number(args.duration)

const API_PATH = '/signalk/v1/api/vessels/self/'
const WS_PATH = '/signalk/v1/stream?subscribe=none'

// ── Stats ──────────────────────────────────────────────────────────────

interface ClientStats {
  id: number
  deltasReceived: number
  lastDeltaAt: number
}

const clientStats: ClientStats[] = []
const httpLatencies: number[] = []
let httpPollCount = 0
let httpErrorCount = 0
const startTime = Date.now()

// ── Helpers ────────────────────────────────────────────────────────────

function httpGet(url: string): Promise<{ body: string; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now()
    const get = url.startsWith('https') ? https.get : http.get
    const req = get(url, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        resolve({
          body: Buffer.concat(chunks).toString(),
          durationMs: Date.now() - t0,
        })
      })
    })
    req.on('error', reject)
    req.setTimeout(30_000, () => {
      req.destroy(new Error('HTTP timeout after 30 s'))
    })
  })
}

function pickRandomItems<T>(arr: T[], n: number): T[] {
  const copy = arr.slice()
  const result: T[] = []
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length)
    result.push(copy.splice(idx, 1)[0])
  }
  return result
}

function randomPeriod(): number {
  // 500 – 5000 ms, rounded to 100
  return Math.round((500 + Math.random() * 4500) / 100) * 100
}

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

// ── Discover paths ─────────────────────────────────────────────────────

async function discoverPaths(): Promise<string[]> {
  console.log(`Fetching available paths from ${BASE_URL}${API_PATH} …`)
  const { body } = await httpGet(`${BASE_URL}${API_PATH}`)
  const tree = JSON.parse(body)

  const paths: string[] = []
  function walk(obj: unknown, prefix: string) {
    if (obj === null || typeof obj !== 'object') return
    const record = obj as Record<string, unknown>
    if ('value' in record) {
      paths.push(prefix)
      return
    }
    for (const key of Object.keys(record)) {
      walk(record[key], prefix ? `${prefix}.${key}` : key)
    }
  }
  walk(tree, '')
  console.log(`  Found ${paths.length} paths`)
  return paths
}

// ── WebSocket client ───────────────────────────────────────────────────

function createClient(
  id: number,
  paths: string[],
  subsCount: number
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const wsUrl = BASE_URL.replace(/^http/, 'ws') + WS_PATH
    const ws = new WebSocket(wsUrl)

    const stats: ClientStats = { id, deltasReceived: 0, lastDeltaAt: 0 }
    clientStats.push(stats)

    ws.on('open', () => {
      // Send subscription messages — each with policy=fixed and a random period
      const selectedPaths = pickRandomItems(paths, subsCount)
      const subscribeMsg = {
        context: 'vessels.self',
        subscribe: selectedPaths.map((p) => ({
          path: p,
          policy: 'fixed',
          period: randomPeriod(),
        })),
      }
      ws.send(JSON.stringify(subscribeMsg))
      resolve(ws)
    })

    ws.on('message', () => {
      stats.deltasReceived++
      stats.lastDeltaAt = Date.now()
    })

    ws.on('error', (err) => {
      console.error(`  [WS ${id}] error: ${err.message}`)
      reject(err)
    })

    ws.on('close', () => {
      // intentional close during shutdown — ignore
    })
  })
}

// ── HTTP poller ────────────────────────────────────────────────────────

let httpTimer: ReturnType<typeof setInterval> | undefined

function startHttpPoller() {
  const poll = async () => {
    try {
      const { durationMs } = await httpGet(`${BASE_URL}${API_PATH}`)
      httpLatencies.push(durationMs)
      httpPollCount++
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
      console.log(`  [HTTP +${elapsed}s] ${API_PATH} — ${fmtMs(durationMs)}`)
    } catch (err: unknown) {
      httpErrorCount++
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  [HTTP] error: ${msg}`)
    }
  }
  // first poll immediately
  poll()
  httpTimer = setInterval(poll, HTTP_INTERVAL)
}

// ── Summary ────────────────────────────────────────────────────────────

function printSummary() {
  const totalElapsed = Date.now() - startTime
  console.log('\n' + '═'.repeat(60))
  console.log('  STRESS TEST SUMMARY')
  console.log('═'.repeat(60))
  console.log(`  Duration:       ${fmtMs(totalElapsed)}`)
  console.log(`  WS clients:     ${NUM_CLIENTS}`)
  console.log(`  Subs/client:    ${SUBS_PER_CLIENT}`)
  console.log()

  // WS stats
  let totalDeltas = 0
  let clientsWithData = 0
  for (const s of clientStats) {
    totalDeltas += s.deltasReceived
    if (s.deltasReceived > 0) clientsWithData++
  }
  console.log('  WebSocket')
  console.log(`    Total deltas received:    ${totalDeltas}`)
  console.log(
    `    Clients that received data: ${clientsWithData}/${clientStats.length}`
  )
  if (clientStats.length > 0) {
    const perClient = clientStats.map((c) => c.deltasReceived)
    perClient.sort((a, b) => a - b)
    console.log(
      `    Deltas/client min/med/max: ${perClient[0]} / ${perClient[Math.floor(perClient.length / 2)]} / ${perClient[perClient.length - 1]}`
    )
  }

  // HTTP stats
  console.log()
  console.log('  HTTP API latency')
  console.log(`    Polls:   ${httpPollCount}  (errors: ${httpErrorCount})`)
  if (httpLatencies.length > 0) {
    const sorted = httpLatencies.slice().sort((a, b) => a - b)
    console.log(`    Min:     ${fmtMs(sorted[0])}`)
    console.log(`    Median:  ${fmtMs(percentile(sorted, 50))}`)
    console.log(`    p95:     ${fmtMs(percentile(sorted, 95))}`)
    console.log(`    p99:     ${fmtMs(percentile(sorted, 99))}`)
    console.log(`    Max:     ${fmtMs(sorted[sorted.length - 1])}`)
  }
  console.log('═'.repeat(60))
}

// ── Main ───────────────────────────────────────────────────────────────

const sockets: WebSocket[] = []

async function main() {
  console.log(
    `Signal K WS stress test — ${NUM_CLIENTS} clients × ${SUBS_PER_CLIENT} subs`
  )
  console.log(`Server: ${BASE_URL}`)
  console.log()

  const paths = await discoverPaths()
  if (paths.length === 0) {
    console.error('No paths found — is the server running with data?')
    process.exit(1)
  }

  const subsCount = Math.min(SUBS_PER_CLIENT, paths.length)

  console.log(`\nConnecting ${NUM_CLIENTS} WebSocket clients …`)
  for (let i = 0; i < NUM_CLIENTS; i++) {
    try {
      const ws = await createClient(i, paths, subsCount)
      sockets.push(ws)
    } catch {
      console.error(`  Failed to connect client ${i}`)
    }
  }
  console.log(`  ${sockets.length} clients connected\n`)

  // Verify data is flowing after a short warmup
  setTimeout(() => {
    const receiving = clientStats.filter((c) => c.deltasReceived > 0).length
    console.log(
      `  [Check] ${receiving}/${clientStats.length} clients receiving data`
    )
    if (receiving === 0) {
      console.warn('  ⚠ No clients are receiving data — check subscriptions')
    }
  }, 5000)

  startHttpPoller()

  if (DURATION > 0) {
    setTimeout(() => {
      console.log(`\nDuration limit (${DURATION}s) reached — stopping.`)
      shutdown()
    }, DURATION * 1000)
  }
}

function shutdown() {
  if (httpTimer) clearInterval(httpTimer)
  for (const ws of sockets) {
    try {
      ws.close()
    } catch {
      // ignore
    }
  }
  printSummary()
  process.exit(0)
}

process.on('SIGINT', () => {
  console.log('\nInterrupted — shutting down …')
  shutdown()
})
process.on('SIGTERM', shutdown)

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
