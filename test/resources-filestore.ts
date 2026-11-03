import chai from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { FileStore } from '../packages/resources-provider-plugin/src/filestorage'
chai.should()

const TRAVERSAL_IDS = ['../outside.json', '../../outside.json', '..', '.', '']

describe('Resources provider FileStore', () => {
  let basePath: string
  let store: FileStore
  const outsideFile = () => path.join(basePath, 'resources', 'outside.json')

  beforeEach(async () => {
    basePath = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-filestore-'))
    store = new FileStore('resources-provider', () => {})
    await store.init({
      basePath,
      settings: { standard: { notes: true } }
    })
    fs.writeFileSync(outsideFile(), JSON.stringify({ secret: 'value' }))
  })

  afterEach(() => fs.rmSync(basePath, { recursive: true, force: true }))

  it('reads a resource inside its type directory', async () => {
    await store.setResource({ type: 'notes', id: 'note1', value: { a: 1 } })
    const note = await store.getResource('notes', 'note1')
    note.should.include({ a: 1 })
  })

  for (const id of TRAVERSAL_IDS) {
    it(`refuses to read id ${JSON.stringify(id)}`, async () => {
      await store
        .getResource('notes', id)
        .then(() => chai.assert.fail('read outside notes directory'))
        .catch((e: Error) => e.message.should.match(/Invalid resource id/))
    })
  }

  it('refuses to write outside the type directory', async () => {
    await store
      .setResource({ type: 'notes', id: '../written.json', value: { a: 1 } })
      .then(() => chai.assert.fail('wrote outside notes directory'))
      .catch((e: Error) => e.message.should.match(/Invalid resource id/))
    fs.existsSync(
      path.join(basePath, 'resources', 'written.json')
    ).should.equal(false)
  })

  it('refuses to delete outside the type directory', async () => {
    await store
      .setResource({ type: 'notes', id: '../outside.json', value: null })
      .then(() => chai.assert.fail('deleted outside notes directory'))
      .catch((e: Error) => e.message.should.match(/Invalid resource id/))
    fs.existsSync(outsideFile()).should.equal(true)
  })
})
