import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { atomicWriteFile, atomicWriteFileSync } from '../src/atomicWrite'

describe('atomicWrite', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('persists the last write when many writes overlap', async () => {
    const OVERLAPPING_WRITES = 25
    const file = path.join(dir, 'config.json')

    await Promise.all(
      Array.from({ length: OVERLAPPING_WRITES }, (_, i) =>
        atomicWriteFile(file, `content-${i}`)
      )
    )

    expect(fs.readFileSync(file, 'utf8')).to.equal(
      `content-${OVERLAPPING_WRITES - 1}`
    )
    expect(fs.readdirSync(dir)).to.deep.equal(['config.json'])
  })

  it('keeps writes to different paths independent', async () => {
    const a = path.join(dir, 'a.json')
    const b = path.join(dir, 'b.json')

    await Promise.all([
      atomicWriteFile(a, 'a-1'),
      atomicWriteFile(b, 'b-1'),
      atomicWriteFile(a, 'a-2')
    ])

    expect(fs.readFileSync(a, 'utf8')).to.equal('a-2')
    expect(fs.readFileSync(b, 'utf8')).to.equal('b-1')
    expect(fs.readdirSync(dir).sort()).to.deep.equal(['a.json', 'b.json'])
  })

  it('rejects the failing write and recovers for later writes', async () => {
    const missingDir = path.join(dir, 'missing')
    const file = path.join(missingDir, 'config.json')

    try {
      await atomicWriteFile(file, 'first')
      expect.fail('expected the write to reject')
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).to.equal('ENOENT')
    }

    fs.mkdirSync(missingDir)
    await atomicWriteFile(file, 'second')

    expect(fs.readFileSync(file, 'utf8')).to.equal('second')
    expect(fs.readdirSync(missingDir)).to.deep.equal(['config.json'])
  })

  it('atomicWriteFileSync writes content and leaves no temp file', () => {
    const file = path.join(dir, 'config.json')

    atomicWriteFileSync(file, 'sync-content')

    expect(fs.readFileSync(file, 'utf8')).to.equal('sync-content')
    expect(fs.readdirSync(dir)).to.deep.equal(['config.json'])
  })
})
