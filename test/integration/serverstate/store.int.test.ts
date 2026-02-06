import { expect } from 'chai'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { Store, SERVERSTATEDIRNAME } from '../../../src/serverstate/store'
import type { WithConfig } from '../../../src/app'

describe('Store', () => {
  let tempDir = ''
  let store: Store
  const storePath = 'unit-test'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signalk-store-'))
    const server = {
      config: {
        configPath: tempDir
      }
    } as unknown as WithConfig

    store = new Store(server, storePath)
  })

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('writes and reads JSON data', async () => {
    const payload = { a: 1, nested: { b: 'c' } }

    await store.write(payload)
    const result = await store.read()

    expect(result).to.deep.equal(payload)
  })

  it('creates the serverState directory path', async () => {
    await store.write({ ok: true })

    const directoryPath = path.join(
      tempDir,
      SERVERSTATEDIRNAME,
      storePath
    )

    const stats = await fs.stat(directoryPath)
    expect(stats.isDirectory()).to.equal(true)
  })

  it('supports custom file names', async () => {
    const server = {
      config: {
        configPath: tempDir
      }
    } as unknown as WithConfig

    const customStore = new Store(server, storePath, 'custom.json')
    const payload = { custom: true }

    await customStore.write(payload)
    const result = await customStore.read()

    expect(result).to.deep.equal(payload)
  })
})
