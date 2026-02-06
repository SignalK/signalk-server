import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { atomicWriteFile, atomicWriteFileSync } from '../../src/atomicWrite'

describe('atomicWrite', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signalk-atomic-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('writes files atomically with sync helper', () => {
    const filePath = path.join(tempDir, 'data.json')
    const tmpPath = filePath + '.tmp'

    atomicWriteFileSync(filePath, '{"ok":true}')

    expect(fs.readFileSync(filePath, 'utf8')).to.equal('{"ok":true}')
    expect(fs.existsSync(tmpPath)).to.equal(false)
  })

  it('cleans up temp file on sync failure', () => {
    const filePath = path.join(tempDir, 'data.json')
    const tmpPath = filePath + '.tmp'
    const originalRename = fs.renameSync

    fs.renameSync = () => {
      throw new Error('rename failed')
    }

    try {
      expect(() => atomicWriteFileSync(filePath, 'boom')).to.throw(
        'rename failed'
      )
    } finally {
      fs.renameSync = originalRename
    }

    expect(fs.existsSync(tmpPath)).to.equal(false)
  })

  it('cleans up temp file on async failure', async () => {
    const filePath = path.join(tempDir, 'data.json')
    const tmpPath = filePath + '.tmp'
    const originalRename = fs.promises.rename

    fs.promises.rename = async () => {
      throw new Error('rename failed')
    }

    try {
      await atomicWriteFile(filePath, 'boom')
      throw new Error('Expected failure')
    } catch (error) {
      expect((error as Error).message).to.equal('rename failed')
    } finally {
      fs.promises.rename = originalRename
    }

    expect(fs.existsSync(tmpPath)).to.equal(false)
  })
})
