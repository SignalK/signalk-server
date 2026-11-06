import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import DeltaEditor from '../src/deltaeditor'

describe('DeltaEditor save', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deltaeditor-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('completes overlapping saves and keeps the latest state', async () => {
    const file = path.join(dir, 'baseDeltas.json')
    const editor = new DeltaEditor()
    const paths = ['navigation.state', 'environment.mode', 'design.length']

    await Promise.all(
      paths.map((p) => {
        editor.setMeta('vessels.self', p, { timeout: 900 })
        return editor.save(file)
      })
    )

    const reloaded = new DeltaEditor()
    reloaded.load(file)
    for (const p of paths) {
      expect(reloaded.getMeta('vessels.self', p)).to.deep.equal({
        timeout: 900
      })
    }
    expect(fs.readdirSync(dir)).to.deep.equal(['baseDeltas.json'])
  })
})
