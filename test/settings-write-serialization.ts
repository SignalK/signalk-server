import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeSettingsFile } from '../src/config/config'
import { ConfigApp } from '../src/config/config'

// Minimal app shape writeSettingsFile needs: a config dir and argv.s.
function makeApp(configPath: string): ConfigApp {
  return { config: { configPath }, argv: {} } as unknown as ConfigApp
}

function writeP(app: ConfigApp, settings: object): Promise<void> {
  return new Promise((resolve, reject) => {
    writeSettingsFile(app, settings, (err: unknown) =>
      err ? reject(err) : resolve()
    )
  })
}

describe('writeSettingsFile serialization', () => {
  let dir: string
  let savedSettingsEnv: string | undefined

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-settings-'))
    // getSettingsFilename honours SIGNALK_NODE_SETTINGS over configPath;
    // clear it so writes land in the temp dir (and never clobber a real
    // settings file), restoring it afterwards.
    savedSettingsEnv = process.env.SIGNALK_NODE_SETTINGS
    delete process.env.SIGNALK_NODE_SETTINGS
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    if (savedSettingsEnv === undefined) {
      delete process.env.SIGNALK_NODE_SETTINGS
    } else {
      process.env.SIGNALK_NODE_SETTINGS = savedSettingsEnv
    }
  })

  it('runs concurrent writes without corrupting settings.json', async () => {
    const app = makeApp(dir)
    // Fire many overlapping writes with distinct payloads.
    const N = 25
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        writeP(app, { interfaces: {}, marker: i })
      )
    )
    // The file must be complete, valid JSON (never a half-written mix), and
    // because each payload is snapshotted at call time the queue applies
    // them in enqueue order — so the last one deterministically wins.
    const raw = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')
    const parsed = JSON.parse(raw) as { marker: number }
    expect(parsed.marker).to.equal(N - 1)
  })

  it('preserves call order: the last enqueued write wins on disk', async () => {
    const app = makeApp(dir)
    const N = 15
    // Await sequentially-enqueued (but internally queued) writes; the queue
    // must apply them in order so the final on-disk value is the last one.
    for (let i = 0; i < N; i++) {
      await writeP(app, { interfaces: {}, marker: i })
    }
    const parsed = JSON.parse(
      fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')
    ) as { marker: number }
    expect(parsed.marker).to.equal(N - 1)
  })

  it('pins each write to the state at call time, not at write time', async () => {
    const app = makeApp(dir)
    // Caller mutates the same object after enqueuing: the persisted value
    // must reflect the snapshot taken when writeSettingsFile was called.
    const settings = { interfaces: {}, marker: 'first' } as {
      interfaces: object
      marker: string
    }
    const p = writeP(app, settings)
    settings.marker = 'mutated-after-call'
    await p
    const parsed = JSON.parse(
      fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')
    ) as { marker: string }
    expect(parsed.marker).to.equal('first')
  })

  it('a failing write does not wedge later writes', async () => {
    const app = makeApp(dir)
    // Point the first write at a path that cannot be created (parent is a
    // file, not a dir) to force a failure, then a good write must still land.
    const badApp = makeApp(path.join(dir, 'nope', 'deeper'))
    fs.writeFileSync(path.join(dir, 'nope'), 'x')
    let failed = false
    await writeP(badApp, { interfaces: {}, marker: 0 }).catch(() => {
      failed = true
    })
    expect(failed).to.equal(true)
    // Subsequent write on the healthy app still succeeds, writing both the
    // priorities and settings files (the failure was at the priorities
    // phase, which is written first, so this also proves the chain recovers).
    await writeP(app, { interfaces: {}, marker: 99 })
    const parsed = JSON.parse(
      fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')
    ) as { marker: number }
    expect(parsed.marker).to.equal(99)
    expect(fs.existsSync(path.join(dir, 'priorities.json'))).to.equal(true)
  })

  it('serializes the priorities-file phase in call order too', async () => {
    const app = makeApp(dir)
    const N = 12
    // priorityGroups is split out into priorities.json; the last enqueued
    // write must win there as well, proving the priorities phase is queued.
    for (let i = 0; i < N; i++) {
      await writeP(app, {
        interfaces: {},
        priorityGroups: [{ id: `group${i}`, priorities: [] }]
      })
    }
    const priorities = JSON.parse(
      fs.readFileSync(path.join(dir, 'priorities.json'), 'utf8')
    ) as { priorityGroups: Array<{ id: string }> }
    expect(priorities.priorityGroups.map((g) => g.id)).to.deep.equal([
      `group${N - 1}`
    ])
  })

  it('routes a synchronous stringify failure through the callback', async () => {
    const app = makeApp(dir)
    // A circular reference makes JSON.stringify throw during the synchronous
    // snapshot; the error must reach the caller via cb, not escape.
    const circular: Record<string, unknown> = { interfaces: {} }
    circular.self = circular
    let caught: unknown
    await writeP(app, circular).catch((e) => {
      caught = e
    })
    expect(caught).to.be.an('error')
    // The queue is not wedged: a normal write still lands.
    await writeP(app, { interfaces: {}, marker: 7 })
    const parsed = JSON.parse(
      fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')
    ) as { marker: number }
    expect(parsed.marker).to.equal(7)
  })
})
