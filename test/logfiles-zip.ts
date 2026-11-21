import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { Open } from 'unzipper'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logfiles = require('../dist/interfaces/logfiles')

describe('Admin log ZIP download', () => {
  let configPath: string
  let server: Server
  let baseUrl: string

  beforeEach(async () => {
    configPath = await mkdtemp(path.join(os.tmpdir(), 'signalk-log-zip-'))
    await writeFile(path.join(configPath, 'settings.json'), '{}')
    await writeFile(path.join(configPath, 'security-secret.key'), 'dummy')
    const app = Object.assign(express(), {
      config: { configPath, settings: {}, vesselName: 'Test Boat' },
      securityStrategy: { addAdminMiddleware: () => undefined }
    })
    logfiles(app).start()
    server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/skServer`
  })

  afterEach(async () => {
    try {
      await server?.[Symbol.asyncDispose]()
    } finally {
      await rm(configPath, { recursive: true, force: true })
    }
  })

  async function download() {
    const res = await fetch(`${baseUrl}/ziplogs`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/zip')
    const disposition = res.headers.get('content-disposition') ?? ''
    const match =
      /^attachment; filename="(sk-logs-Test_Boat-\d{4}(?:-\d{2}){4})\.zip"$/.exec(
        disposition
      )
    assert.ok(match, disposition)
    const zip = await Open.buffer(Buffer.from(await res.arrayBuffer()))
    return { folder: match[1], files: zip.files }
  }

  it('archives exactly the listed logs under the download name', async () => {
    const logs = [
      'skserver-raw_2026-01-01T01.log',
      'skserver-raw_2026-01-01T02.log'
    ]
    for (const name of logs) await writeFile(path.join(configPath, name), name)
    const res = await fetch(`${baseUrl}/logfiles/`)
    assert.equal(res.status, 200)
    const listed = await res.json()
    assert.ok(Array.isArray(listed))
    assert.deepEqual(listed.sort(), logs)

    const { folder, files } = await download()
    assert.deepEqual(
      files.map((file) => file.path).sort(),
      listed.map((name) => `${folder}/${name}`)
    )
  })

  it('returns a valid empty ZIP when the log list is empty', async () => {
    const res = await fetch(`${baseUrl}/logfiles/`)
    assert.deepEqual(await res.json(), [])
    assert.deepEqual((await download()).files, [])
  })

  it('skips a directory with a matching log name', async () => {
    const dir = path.join(configPath, 'skserver-raw_2026-01-01T01.log')
    await mkdir(dir)
    await writeFile(path.join(dir, 'settings.json'), '{}')
    assert.deepEqual((await download()).files, [])
  })
})
