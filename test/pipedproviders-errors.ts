import { expect } from 'chai'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pipedProviders } from '../src/pipedproviders'

// A connection whose pipeline cannot be built -- for instance because
// canboatjs refuses its `quirks` option -- must not fail silently: it is
// reported as that connection's error, which the Dashboard shows, and the
// other connections still start.
describe('piped providers: a pipeline that fails to build', () => {
  let dir: string
  let throwing: string
  let passing: string

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-piped-'))
    throwing = path.join(dir, 'throwing.js')
    fs.writeFileSync(
      throwing,
      `module.exports = function () {
        throw new Error("Invalid quirks option: 'vhf' is not a device")
      }`
    )
    passing = path.join(dir, 'passing.js')
    fs.writeFileSync(
      passing,
      `const { PassThrough } = require('stream')
      module.exports = function () { return new PassThrough({ objectMode: true }) }`
    )
  })

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function mockApp(pipedProvidersConfig: unknown[]) {
    const errors: { id: string; msg: string }[] = []
    const emitter = new EventEmitter()
    const app = Object.assign(emitter, {
      config: { settings: { pipedProviders: pipedProvidersConfig } },
      propertyValues: {
        emitPropertyValue: () => {},
        onPropertyValues: () => {}
      },
      wrappedEmitter: { bindMethodsById: () => ({}) },
      handleMessage: () => {},
      setProviderError: (id: string, msg: string) => errors.push({ id, msg }),
      providers: []
    })
    return { app, errors }
  }

  it('reports the error on the connection and starts the others', () => {
    const { app, errors } = mockApp([
      { id: 'n2k', pipeElements: [{ type: throwing }] },
      { id: 'other', pipeElements: [{ type: passing }] }
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const started = pipedProviders(app as any).start()

    expect(errors).to.deep.equal([
      { id: 'n2k', msg: "Invalid quirks option: 'vhf' is not a device" }
    ])
    const ids = (started as unknown as { id: string }[]).map((p) => p.id)
    expect(ids).to.deep.equal(['other'])
  })
})
