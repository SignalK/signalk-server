import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const putModule = require('../../src/put')
const requestResponse = require('../../src/requestResponse')
const skConfig = require('../../src/config/config')

type TestApp = {
  intervals: NodeJS.Timeout[]
  config: {
    baseDeltaEditor: {
      getMeta: (_context: string, _path: string) => Record<string, unknown>
      setMeta: (_context: string, _path: string, _value: unknown) => void
      removeMeta: (_context: string, _path: string) => void
    }
    baseDeltas: Record<string, unknown>
    hasOldDefaults: boolean
    settings: Record<string, unknown>
  }
  signalk: { self: Record<string, unknown> }
  interfaces: Record<string, unknown>
  securityStrategy: { shouldAllowPut: (...args: unknown[]) => boolean }
  handleMessage: (...args: unknown[]) => void
  put: (...args: unknown[]) => void
  delete: (...args: unknown[]) => void
  registerActionHandler?: typeof putModule.registerActionHandler
  deRegisterActionHandler?: typeof putModule.deRegisterActionHandler
}

describe('put', () => {
  let app: TestApp
  let handledMessages: unknown[]
  let writeBaseDeltasFileOriginal: typeof skConfig.writeBaseDeltasFile
  let readDefaultsFileOriginal: typeof skConfig.readDefaultsFile
  let writeDefaultsFileOriginal: typeof skConfig.writeDefaultsFile

  beforeEach(() => {
    writeBaseDeltasFileOriginal = skConfig.writeBaseDeltasFile
    readDefaultsFileOriginal = skConfig.readDefaultsFile
    writeDefaultsFileOriginal = skConfig.writeDefaultsFile

    skConfig.writeBaseDeltasFile = () => Promise.resolve()
    skConfig.readDefaultsFile = () => ({})
    skConfig.writeDefaultsFile = (_app: unknown, _data: unknown, cb: (err?: Error | null) => void) => cb(null)

    handledMessages = []
    app = {
      intervals: [],
      config: {
        baseDeltaEditor: {
          getMeta: () => ({}),
          setMeta: () => {},
          removeMeta: () => {}
        },
        baseDeltas: {},
        hasOldDefaults: false,
        settings: {}
      },
      signalk: { self: {} },
      interfaces: {},
      securityStrategy: { shouldAllowPut: () => true },
      handleMessage: (...args: unknown[]) => {
        handledMessages.push(args)
      },
      put: () => {},
      delete: () => {}
    }

    putModule.start(app)
  })

  afterEach(() => {
    app.intervals.forEach((interval) => clearInterval(interval))
    requestResponse.resetRequests()
    skConfig.writeBaseDeltasFile = writeBaseDeltasFileOriginal
    skConfig.readDefaultsFile = readDefaultsFileOriginal
    skConfig.writeDefaultsFile = writeDefaultsFileOriginal
  })

  it('denies put when security strategy forbids', async () => {
    app.securityStrategy.shouldAllowPut = () => false
    const reply = await putModule.putPath(
      app,
      'vessels.self',
      'navigation.speedOverGround',
      { value: 1 },
      { skPrincipal: { identifier: 'user' } }
    )

    expect(reply.statusCode).to.equal(403)
  })

  it('uses action handler for a specific source', async () => {
    const handler = () => ({ state: 'SUCCESS', message: 'ok' })
    const unregister = putModule.registerActionHandler(
      'vessels.self',
      'navigation.speedOverGround',
      'src1',
      handler
    )

    try {
      const reply = await putModule.putPath(
        app,
        'vessels.self',
        'navigation.speedOverGround',
        { value: 1, source: 'src1' },
        { skPrincipal: { identifier: 'user' } }
      )

      expect(reply.statusCode).to.equal(200)
      expect(reply.message).to.equal('ok')
    } finally {
      unregister()
    }
  })

  it('rejects when multiple sources exist and no source is provided', async () => {
    const unregister1 = putModule.registerActionHandler(
      'vessels.self',
      'navigation.courseOverGroundTrue',
      'src1',
      () => ({ state: 'SUCCESS' })
    )
    const unregister2 = putModule.registerActionHandler(
      'vessels.self',
      'navigation.courseOverGroundTrue',
      'src2',
      () => ({ state: 'SUCCESS' })
    )

    try {
      const reply = await putModule.putPath(
        app,
        'vessels.self',
        'navigation.courseOverGroundTrue',
        { value: 2 },
        { skPrincipal: { identifier: 'user' } }
      )

      expect(reply.statusCode).to.equal(400)
      expect(reply.message).to.match(/multiple sources/i)
    } finally {
      unregister1()
      unregister2()
    }
  })

  it('routes to websocket handler when available', async () => {
    app.interfaces = {
      ws: {
        canHandlePut: () => true,
        handlePut: async () => ({ state: 'COMPLETED', statusCode: 202 })
      }
    }

    const reply = await putModule.putPath(
      app,
      'vessels.self',
      'navigation.speedOverGround',
      { value: 3 },
      { skPrincipal: { identifier: 'user' } }
    )

    expect(reply.statusCode).to.equal(202)
  })

  it('updates notification state through put handler', async () => {
    app.signalk.self = {
      notifications: {
        anchor: {
          value: { state: 'alert', method: ['sound'] },
          $source: 'test-source'
        }
      }
    }

    const reply = await putModule.putPath(
      app,
      'vessels.self',
      'notifications.anchor.state',
      { value: 'normal' },
      { skPrincipal: { identifier: 'user' } }
    )

    expect(reply.statusCode).to.equal(200)
    expect(handledMessages).to.have.length(1)
    const delta = handledMessages[0][1] as {
      updates: Array<{ values: Array<{ path: string }> }>
    }
    expect(delta.updates[0].values[0].path).to.equal('notifications.anchor')
  })

  it('returns not found for missing notifications', async () => {
    app.signalk.self = {
      notifications: {}
    }

    const reply = await putModule.putPath(
      app,
      'vessels.self',
      'notifications.anchor.state',
      { value: 'normal' },
      { skPrincipal: { identifier: 'user' } }
    )

    expect(reply.statusCode).to.equal(404)
  })

  it('returns 405 for unsupported notification fields', async () => {
    app.signalk.self = {
      notifications: {
        anchor: {
          value: { state: 'alert', method: ['sound'] },
          $source: 'test-source'
        }
      }
    }

    const reply = await putModule.putPath(
      app,
      'vessels.self',
      'notifications.anchor.severity',
      { value: 'normal' },
      { skPrincipal: { identifier: 'user' } }
    )

    expect(reply.statusCode).to.equal(405)
  })

  it('returns 405 when ws cannot handle put and no handler exists', async () => {
    app.interfaces = {
      ws: {
        canHandlePut: () => false
      }
    }

    const reply = await putModule.putPath(
      app,
      'vessels.self',
      'navigation.speedOverGround',
      { value: 3 },
      { skPrincipal: { identifier: 'user' } }
    )

    expect(reply.statusCode).to.equal(405)
    expect(reply.message).to.match(/not supported/i)
  })

  it('returns pending for meta put and persists base deltas', async () => {
    let setMetaArgs: unknown[] | undefined
    let writeCalled = false

    app.config.baseDeltaEditor.getMeta = () => ({ units: 'm/s', zones: [] })
    app.config.baseDeltaEditor.setMeta = (...args: unknown[]) => {
      setMetaArgs = args
    }
    skConfig.writeBaseDeltasFile = () => {
      writeCalled = true
      return Promise.resolve()
    }

    const reply = await putModule.putPath(
      app,
      'vessels.self',
      'navigation.speedOverGround.meta.zones',
      { value: [] },
      { skPrincipal: { identifier: 'user' } }
    )

    expect(reply.state).to.equal('PENDING')
    expect(reply.action).to.have.property('href')
    expect(setMetaArgs).to.deep.equal([
      'vessels.self',
      'navigation.speedOverGround',
      { units: 'm/s', zones: null }
    ])
    expect(writeCalled).to.equal(true)
    expect(handledMessages).to.have.length(1)
  })

  it('removes meta properties via delete and persists base deltas', async () => {
    let setMetaArgs: unknown[] | undefined
    let removeMetaArgs: unknown[] | undefined
    let writeCalled = false

    app.config.baseDeltaEditor.getMeta = () => ({ displayName: 'SOG' })
    app.config.baseDeltaEditor.setMeta = (...args: unknown[]) => {
      setMetaArgs = args
    }
    app.config.baseDeltaEditor.removeMeta = (...args: unknown[]) => {
      removeMetaArgs = args
    }
    skConfig.writeBaseDeltasFile = () => {
      writeCalled = true
      return Promise.resolve()
    }

    const reply = await putModule.deletePath(
      app,
      'vessels.self',
      'navigation.speedOverGround.meta.displayName',
      { skPrincipal: { identifier: 'user' } }
    )

    expect(reply.state).to.equal('PENDING')
    expect(reply.action).to.have.property('href')
    expect(setMetaArgs).to.deep.equal([
      'vessels.self',
      'navigation.speedOverGround',
      {}
    ])
    expect(removeMetaArgs).to.deep.equal([
      'vessels.self',
      'navigation.speedOverGround'
    ])
    expect(writeCalled).to.equal(true)
    expect(handledMessages).to.have.length(1)
  })

  it('returns 405 when delete does not support path', async () => {
    const reply = await putModule.deletePath(
      app,
      'vessels.self',
      'navigation.speedOverGround',
      { skPrincipal: { identifier: 'user' } }
    )

    expect(reply.statusCode).to.equal(405)
    expect(reply.message).to.match(/not supported/i)
  })

  it('returns 404 when deleting missing meta property', async () => {
    app.config.baseDeltaEditor.getMeta = () => ({})

    const reply = await putModule.deletePath(
      app,
      'vessels.self',
      'navigation.speedOverGround.meta.displayName',
      { skPrincipal: { identifier: 'user' } }
    )

    expect(reply.statusCode).to.equal(404)
  })

  it('maps action handler failure to 502', async () => {
    const unregister = putModule.registerActionHandler(
      'vessels.self',
      'navigation.speedOverGround',
      'src1',
      () => ({ state: 'FAILURE', message: 'nope' })
    )

    try {
      const reply = await putModule.putPath(
        app,
        'vessels.self',
        'navigation.speedOverGround',
        { value: 1, source: 'src1' },
        { skPrincipal: { identifier: 'user' } }
      )

      expect(reply.statusCode).to.equal(502)
      expect(reply.message).to.equal('nope')
    } finally {
      unregister()
    }
  })

  it('writes old defaults when file is missing', async () => {
    app.config.hasOldDefaults = true
    const updates: Array<{ state: string; statusCode: number | null }> = []
    const written: unknown[] = []

    skConfig.readDefaultsFile = () => {
      const error = new Error('missing') as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    }
    skConfig.writeDefaultsFile = (_app: unknown, data: unknown, cb: (err?: Error | null) => void) => {
      written.push(data)
      cb(null)
    }

    const reply = await putModule.putPath(
      app,
      'vessels.self',
      'navigation.speedOverGround.meta.units',
      { value: 'm/s' },
      { skPrincipal: { identifier: 'user' } },
      undefined,
      (update) => updates.push(update)
    )

    expect(reply.state).to.equal('PENDING')
    expect(written).to.have.length(1)
    expect(written[0]).to.deep.equal({
      vessels: { self: { navigation: { speedOverGround: { meta: { units: 'm/s' } } } } }
    })
    expect(updates.some((update) => update.statusCode === 200)).to.equal(true)
  })

  it('reports failure when defaults file read fails', async () => {
    app.config.hasOldDefaults = true
    const updates: Array<{ state: string; statusCode: number | null; message?: string | null }> = []
    const errors: unknown[] = []
    const errorSpy = console.error

    console.error = (...args: unknown[]) => {
      errors.push(args)
    }

    skConfig.readDefaultsFile = () => {
      throw new Error('boom')
    }

    try {
      await putModule.putPath(
        app,
        'vessels.self',
        'navigation.speedOverGround.meta.units',
        { value: 'm/s' },
        { skPrincipal: { identifier: 'user' } },
        undefined,
        (update) => updates.push(update)
      )
    } finally {
      console.error = errorSpy
    }

    expect(errors).to.have.length(1)
    expect(updates.some((update) => update.statusCode === 502)).to.equal(true)
    expect(updates.some((update) => update.message === 'Unable to read defaults file')).to.equal(true)
  })
})
