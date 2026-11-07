import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import DeltaEditor from '../src/deltaeditor'

type WriteFile = typeof fs.promises.writeFile

describe('DeltaEditor save', () => {
  let dir: string
  let file: string
  const originalWriteFile = fs.promises.writeFile

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deltaeditor-'))
    file = path.join(dir, 'baseDeltas.json')
  })

  afterEach(() => {
    fs.promises.writeFile = originalWriteFile
    fs.rmSync(dir, { recursive: true, force: true })
  })

  // Unordered writes only lose data when the first finishes after the
  // second, which real disk timing rarely produces, so the test decides when
  // the first one completes.
  const holdFirstWrite = () => {
    const events: string[] = []
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let writes = 0
    fs.promises.writeFile = (async (...args: Parameters<WriteFile>) => {
      const n = ++writes
      events.push(`start ${n}`)
      if (n === 1) await held
      await originalWriteFile(...args)
      events.push(`end ${n}`)
    }) as WriteFile
    return { events, release }
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

  it('starts a save to the same file only after the previous one', async () => {
    const { events, release } = holdFirstWrite()
    const first = new DeltaEditor()
    const second = new DeltaEditor()
    first.setMeta('vessels.self', 'navigation.state', { timeout: 900 })
    second.setMeta('vessels.self', 'environment.mode', { timeout: 0 })

    const saves = [first.save(file), second.save(file)]
    await flush()
    expect(events).to.deep.equal(['start 1'])

    release()
    await Promise.all(saves)
    expect(events).to.deep.equal(['start 1', 'end 1', 'start 2', 'end 2'])
    const reloaded = new DeltaEditor()
    reloaded.load(file)
    expect(reloaded.getMeta('vessels.self', 'environment.mode')).to.deep.equal({
      timeout: 0
    })
    expect(fs.readdirSync(dir)).to.deep.equal(['baseDeltas.json'])
  })

  it('writes the deltas as they were when save was called', async () => {
    const { release } = holdFirstWrite()
    const editor = new DeltaEditor()
    editor.setMeta('vessels.self', 'navigation.state', { timeout: 900 })

    const saved = editor.save(file)
    editor.setMeta('vessels.self', 'navigation.state', { timeout: 5 })
    release()
    await saved

    const reloaded = new DeltaEditor()
    reloaded.load(file)
    expect(reloaded.getMeta('vessels.self', 'navigation.state')).to.deep.equal({
      timeout: 900
    })
  })
})
