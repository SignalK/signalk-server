import { expect } from 'chai'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const DeltaEditor = require('../../src/deltaeditor')

type DeltaEditorInstance = {
  deltas: Array<{ updates: Array<{ values: unknown[] }> }>
  setValue: (context: string, path: string, value: unknown) => void
  getValue: (context: string, path: string) => unknown
  removeValue: (context: string, path: string) => void
  setMeta: (context: string, path: string, meta: unknown) => void
  getMeta: (context: string, path: string) => unknown
  removeMeta: (context: string, path: string) => void
  load: (filePath: string) => void
  saveSync: (filePath: string) => void
  save: (filePath: string) => Promise<void>
}

describe('DeltaEditor', () => {
  let editor: DeltaEditorInstance

  beforeEach(() => {
    editor = new DeltaEditor() as DeltaEditorInstance
  })

  it('merges top-level values and cleans up empty deltas', () => {
    editor.setValue('vessels.self', 'name', 'Test Vessel')
    editor.setValue('vessels.self', 'mmsi', 123456789)

    expect(editor.getValue('vessels.self', 'name')).to.equal('Test Vessel')
    expect(editor.getValue('vessels.self', 'mmsi')).to.equal(123456789)
    expect(editor.deltas).to.have.length(1)

    editor.removeValue('vessels.self', 'name')
    expect(editor.getValue('vessels.self', 'name')).to.equal(undefined)
    expect(editor.getValue('vessels.self', 'mmsi')).to.equal(123456789)
    expect(editor.deltas).to.have.length(1)

    editor.removeValue('vessels.self', 'mmsi')
    expect(editor.deltas).to.have.length(0)
  })

  it('stores dotted paths in values array', () => {
    editor.setValue('vessels.self', 'navigation.speedOverGround', 5)
    editor.setValue('vessels.self', 'navigation.courseOverGroundTrue', 1.5)

    expect(
      editor.getValue('vessels.self', 'navigation.speedOverGround')
    ).to.equal(5)
    expect(
      editor.getValue('vessels.self', 'navigation.courseOverGroundTrue')
    ).to.equal(1.5)
    expect(editor.deltas).to.have.length(1)
    expect(editor.deltas[0].updates[0].values).to.have.length(2)

    editor.setValue('vessels.self', 'navigation.speedOverGround', undefined)
    expect(
      editor.getValue('vessels.self', 'navigation.speedOverGround')
    ).to.equal(undefined)
    expect(editor.deltas[0].updates[0].values).to.have.length(1)

    editor.removeValue('vessels.self', 'navigation.courseOverGroundTrue')
    expect(editor.deltas).to.have.length(0)
  })

  it('sets and removes meta entries', () => {
    const metaValue = { units: 'm/s', displayName: 'Speed Over Ground' }
    editor.setMeta('vessels.self', 'navigation.speedOverGround', metaValue)

    expect(
      editor.getMeta('vessels.self', 'navigation.speedOverGround')
    ).to.deep.equal(metaValue)

    editor.removeMeta('vessels.self', 'navigation.speedOverGround')
    expect(
      editor.getMeta('vessels.self', 'navigation.speedOverGround')
    ).to.equal(null)
    expect(editor.deltas).to.have.length(0)
  })

  it('loads and saves delta arrays', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'signalk-deltaeditor-')
    )
    const inputPath = path.join(tempDir, 'input.json')
    const outputPath = path.join(tempDir, 'output.json')
    const asyncPath = path.join(tempDir, 'async.json')
    const deltas = [
      {
        context: 'vessels.self',
        updates: [
          {
            values: [
              {
                path: 'navigation.speedOverGround',
                value: 2.5
              }
            ]
          }
        ]
      }
    ]

    fs.writeFileSync(inputPath, JSON.stringify(deltas), 'utf8')

    try {
      editor.load(inputPath)
      expect(editor.deltas).to.deep.equal(deltas)

      editor.saveSync(outputPath)
      const saved = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
      expect(saved).to.deep.equal(deltas)

      await editor.save(asyncPath)
      const savedAsync = JSON.parse(fs.readFileSync(asyncPath, 'utf8'))
      expect(savedAsync).to.deep.equal(deltas)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('rejects non-array delta files on load', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'signalk-deltaeditor-')
    )
    const inputPath = path.join(tempDir, 'input.json')

    fs.writeFileSync(
      inputPath,
      JSON.stringify({ context: 'vessels.self' }),
      'utf8'
    )

    try {
      expect(() => editor.load(inputPath)).to.throw(
        'should contain an array of deltas'
      )
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
