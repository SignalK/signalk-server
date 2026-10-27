// Builds the large demo assets that are not kept in git: the Waddenzee ENC
// as vector MBTiles plus its raw S-57 cells, a coastline clipped to the
// area, and the Netherlands tidal current dataset. They land in ./assets,
// laid out like the server's config directory, for the Dockerfile to copy.
//
// The ENC conversion runs charts-provider-simple in a throwaway Signal K
// server on this machine, because the converter is the plugin's own
// GDAL/tippecanoe pipeline in containers. That needs Docker or Podman here
// (a GitHub runner has Docker), but not on the Fly machine.
//
// Usage: node build-assets.ts <signalk-server version>

import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const HERE = import.meta.dirname
const BUILD = join(HERE, '.build')
const ASSETS = join(HERE, 'assets')
const PORT = 3999
const BASE = `http://127.0.0.1:${PORT}`
const PLUGIN = `${BASE}/plugins/signalk-charts-provider-simple`

const ENC_SET = 'Waddenzee'
const ENC_CELLS = Array.from(
  { length: 13 },
  (_, i) => `1R7WAD${String(i + 1).padStart(2, '0')}`
)
const COASTLINE_URL =
  'https://github.com/macjl/signalk-distance-to-shore-world-coastline/releases/download/v2026.06.03-1/world-display-z0-z11-runtime-z12.mbtiles.zip'
const COASTLINE_ZIP_ENTRY = 'world-display-z0-z11-runtime-z12.mbtiles'
const COASTLINE_MAX_ZOOM = 12
const TIDAL_SOURCE = 'utcef_netherlands'
// Runs the ENC converter's containers during the build only, so it is not
// one of the demo's own plugins in config/package.json
const SIGNALK_CONTAINER_VERSION = '1.36.1'
// west, south, east, north
const AREA = [4.6, 52.8, 5.95, 53.6] as const

const CONVERSION_TIMEOUT_MS = 60 * 60 * 1000
const POLL_MS = 10_000

const skVersion = process.argv[2]?.replace(/^v/, '')
if (!skVersion) {
  console.error('usage: node build-assets.ts <signalk-server version>')
  process.exit(1)
}

function run(cmd: string, args: string[], cwd = BUILD): void {
  execFileSync(cmd, args, { cwd, stdio: 'inherit' })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!res.ok)
    throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

function pinnedVersion(name: string): string {
  const pkg = JSON.parse(
    readFileSync(join(HERE, 'config', 'package.json'), 'utf8')
  ) as {
    dependencies: Record<string, string>
  }
  const version = pkg.dependencies[name]
  if (!version) throw new Error(`${name} is not pinned in config/package.json`)
  return version
}

function tileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}

function tileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
  )
}

async function buildCoastline(): Promise<void> {
  const zip = join(BUILD, 'coastline.zip')
  run('curl', ['-fsSL', '-o', zip, COASTLINE_URL])
  run('unzip', ['-o', zip, COASTLINE_ZIP_ENTRY])

  const out = join(ASSETS, 'charts-simple', 'wadden-coastline.mbtiles')
  rmSync(out, { force: true })
  const [west, south, east, north] = AREA
  const db = new DatabaseSync(out)
  db.exec(`ATTACH DATABASE '${join(BUILD, COASTLINE_ZIP_ENTRY)}' AS world`)
  db.exec('CREATE TABLE metadata (name TEXT, value TEXT)')
  db.exec(
    'CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)'
  )
  db.exec(
    'CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)'
  )
  db.exec('INSERT INTO metadata SELECT name, value FROM world.metadata')
  const setMeta = db.prepare('UPDATE metadata SET value = ? WHERE name = ?')
  setMeta.run(`${west},${south},${east},${north}`, 'bounds')
  setMeta.run(`${(west + east) / 2},${(south + north) / 2},10`, 'center')
  setMeta.run('Distance To Shore Coastline - Wadden Sea', 'name')
  const copy = db.prepare(
    `INSERT INTO tiles SELECT zoom_level, tile_column, tile_row, tile_data FROM world.tiles
     WHERE zoom_level = ? AND tile_column BETWEEN ? AND ? AND tile_row BETWEEN ? AND ?`
  )
  for (let z = 0; z <= COASTLINE_MAX_ZOOM; z++) {
    const last = 2 ** z - 1
    // MBTiles rows count from the south (TMS)
    copy.run(
      z,
      tileX(west, z),
      tileX(east, z),
      last - tileY(south, z),
      last - tileY(north, z)
    )
  }
  db.close()
  rmSync(join(BUILD, COASTLINE_ZIP_ENTRY))
  rmSync(zip)
}

function prepareServer(): string {
  const serverDir = join(BUILD, 'server')
  const configDir = join(BUILD, 'config')
  mkdirSync(serverDir, { recursive: true })
  mkdirSync(join(configDir, 'plugin-config-data'), { recursive: true })
  // Without a package.json of its own npm would install into the repository's
  writeFileSync(
    join(serverDir, 'package.json'),
    JSON.stringify({ name: 'demo-asset-server', private: true })
  )
  run(
    'npm',
    ['install', '--no-audit', '--no-fund', `signalk-server@${skVersion}`],
    serverDir
  )
  writeFileSync(
    join(configDir, 'package.json'),
    JSON.stringify({
      name: 'demo-asset-builder',
      private: true,
      dependencies: {
        'signalk-charts-provider-simple': pinnedVersion(
          'signalk-charts-provider-simple'
        ),
        'signalk-tidal-currents': pinnedVersion('signalk-tidal-currents'),
        'signalk-container': SIGNALK_CONTAINER_VERSION
      }
    })
  )
  run('npm', ['install', '--no-audit', '--no-fund'], configDir)
  for (const id of [
    'signalk-charts-provider-simple',
    'signalk-tidal-currents',
    'signalk-container'
  ]) {
    writeFileSync(
      join(configDir, 'plugin-config-data', `${id}.json`),
      JSON.stringify({ enabled: true, configuration: {} })
    )
  }
  return configDir
}

function startServer(configDir: string): ChildProcess {
  const server = spawn(
    join(BUILD, 'server', 'node_modules', '.bin', 'signalk-server'),
    ['-c', configDir],
    {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'inherit', 'inherit']
    }
  )
  server.on('exit', (code) => {
    if (code !== null && code !== 0)
      console.error(`signalk-server exited with ${code}`)
  })
  return server
}

/** A failure that waiting longer cannot cure */
class BuildFailure extends Error {}

async function waitFor(
  what: string,
  done: () => Promise<boolean>,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if (await done()) return
    } catch (error) {
      if (error instanceof BuildFailure) throw error
      // not up yet
    }
    await sleep(POLL_MS)
  }
  throw new Error(`timed out waiting for ${what}`)
}

interface CatalogStatus {
  busy: boolean
  status: string
  detail?: { phase: string; sectionLabel?: string }
}

async function convertEnc(configDir: string): Promise<void> {
  const { id } = await request<{ id: string }>(
    'POST',
    `${PLUGIN}/custom-catalogs`,
    { name: ENC_SET }
  )
  await request('PUT', `${PLUGIN}/custom-catalogs/${id}`, {
    selectedUnitIds: ENC_CELLS
  })
  await request('POST', `${PLUGIN}/custom-catalogs/${id}/download-convert`)
  await waitFor(
    'the ENC conversion',
    async () => {
      const s = await request<CatalogStatus>(
        'GET',
        `${PLUGIN}/custom-catalogs/${id}/status`
      )
      console.log(
        `ENC: ${s.detail?.phase ?? s.status} ${s.detail?.sectionLabel ?? ''}`
      )
      if (s.detail?.phase === 'failed')
        throw new BuildFailure('ENC conversion failed')
      return !s.busy && s.status === 'converted'
    },
    CONVERSION_TIMEOUT_MS
  )

  cpSync(
    join(configDir, 'charts-simple', `${ENC_SET}.mbtiles`),
    join(ASSETS, 'charts-simple', `${ENC_SET}.mbtiles`)
  )
  const cells = join(
    configDir,
    'plugin-config-data',
    'signalk-charts-provider-simple',
    'chart-set-cache',
    ENC_SET,
    'cells'
  )
  for (const cell of readdirSync(cells)) {
    cpSync(join(cells, cell, 'raw'), join(ASSETS, 'enc-cells', cell), {
      recursive: true
    })
  }
}

interface DownloadJob {
  state: 'queued' | 'active' | 'done' | 'error'
  error?: string
}

async function downloadTidalCurrents(configDir: string): Promise<void> {
  const dataDir = join(
    configDir,
    'plugin-config-data',
    'signalk-tidal-currents'
  )
  const downloads = `${BASE}/plugins/signalk-tidal-currents/downloads`
  const { id } = await request<{ id: string }>('POST', downloads, {
    sourceId: TIDAL_SOURCE
  })
  await waitFor(
    'the tidal current dataset',
    async () => {
      const job = await request<DownloadJob>('GET', `${downloads}/${id}`)
      if (job.state === 'error')
        throw new BuildFailure(`tidal current download failed: ${job.error}`)
      return job.state === 'done'
    },
    5 * 60 * 1000
  )
  const target = join(ASSETS, 'plugin-config-data', 'signalk-tidal-currents')
  cpSync(join(dataDir, 'utcef'), join(target, 'utcef'), { recursive: true })
  cpSync(
    join(dataDir, 'install-manifest.json'),
    join(target, 'install-manifest.json')
  )
}

rmSync(BUILD, { recursive: true, force: true })
rmSync(ASSETS, { recursive: true, force: true })
mkdirSync(BUILD, { recursive: true })
mkdirSync(join(ASSETS, 'charts-simple'), { recursive: true })

await buildCoastline()
const configDir = prepareServer()
const server = startServer(configDir)
try {
  await waitFor(
    'signalk-server',
    async () => (await fetch(`${BASE}/signalk`)).ok,
    5 * 60 * 1000
  )
  await waitFor(
    'charts-provider-simple',
    async () => (await fetch(`${PLUGIN}/custom-catalogs`)).ok,
    5 * 60 * 1000
  )
  await convertEnc(configDir)
  await downloadTidalCurrents(configDir)
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve))
    server.kill('SIGINT')
    await exited
  }
}
rmSync(BUILD, { recursive: true, force: true })
console.log(`assets ready in ${ASSETS}`)
