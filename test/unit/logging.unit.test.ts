import { expect } from 'chai'
import { createRequire } from 'module'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const createLogger = require('../../src/logging')

describe('logging', () => {
  let tempDir: string
  let app: EventEmitter & { config: { configPath: string } }
  let logger: ReturnType<typeof createLogger>
  let originalStdoutWrite: typeof process.stdout.write
  let originalStderrWrite: typeof process.stderr.write
  let debugEnv: string | undefined
  let serverLogs: Array<{
    type: string
    data: { row: string; isError?: boolean }
  }>
  let serverEvents: Array<{
    type: string
    data: { debugEnabled: string; rememberDebug: boolean }
  }>

  const makeApp = (configPath: string) => {
    const emitter = new EventEmitter() as EventEmitter & {
      config: { configPath: string }
    }
    emitter.config = { configPath }
    return emitter
  }

  const initLogger = (configPath: string) => {
    app = makeApp(configPath)
    serverLogs = []
    serverEvents = []
    app.on('serverlog', (event) => serverLogs.push(event))
    app.on('serverevent', (event) => serverEvents.push(event))
    logger = createLogger(app)
  }

  beforeEach(() => {
    debugEnv = process.env.DEBUG
    delete process.env.DEBUG

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signalk-logging-'))

    originalStdoutWrite = process.stdout.write
    originalStderrWrite = process.stderr.write
    process.stdout.write = ((chunk: string) =>
      chunk.length > 0) as typeof process.stdout.write
    process.stderr.write = ((chunk: string) =>
      chunk.length > 0) as typeof process.stderr.write
  })

  afterEach(() => {
    process.stdout.write = originalStdoutWrite
    process.stderr.write = originalStderrWrite

    if (debugEnv) {
      process.env.DEBUG = debugEnv
    } else {
      delete process.env.DEBUG
    }

    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('captures stdout and stderr output', () => {
    initLogger(tempDir)

    process.stdout.write('hello')
    process.stderr.write('oops')

    const log = logger.getLog()
    expect(log).to.have.length(2)
    expect(log[0].row).to.equal('hello')
    expect(log[1].row).to.equal('oops')
    expect(log[1].isError).to.equal(true)
    expect(serverLogs).to.have.length(2)
  })

  it('uses DEBUG env when debug file is absent', () => {
    process.env.DEBUG = 'signalk-env'

    initLogger(tempDir)

    expect(logger.getDebugSettings()).to.deep.equal({
      debugEnabled: 'signalk-env',
      rememberDebug: false
    })
  })

  it('loads and persists debug settings', () => {
    const debugPath = path.join(tempDir, 'debug')
    fs.writeFileSync(debugPath, 'signalk-test', 'utf8')

    initLogger(tempDir)

    expect(logger.getDebugSettings()).to.deep.equal({
      debugEnabled: 'signalk-test',
      rememberDebug: true
    })

    const ok = logger.enableDebug('signalk-new')
    expect(ok).to.equal(true)
    expect(fs.readFileSync(debugPath, 'utf8')).to.equal('signalk-new')
    expect(serverEvents).to.have.length(1)
  })

  it('rejects wildcard debug enablement', () => {
    initLogger(tempDir)

    const ok = logger.enableDebug('*')

    expect(ok).to.equal(false)
    expect(serverEvents).to.have.length(0)
  })

  it('removes debug file when rememberDebug is disabled', () => {
    const debugPath = path.join(tempDir, 'debug')

    initLogger(tempDir)

    logger.enableDebug('signalk-debug')
    logger.rememberDebug(true)
    expect(fs.existsSync(debugPath)).to.equal(true)

    logger.rememberDebug(false)
    expect(fs.existsSync(debugPath)).to.equal(false)
  })

  it('trims the log buffer to the configured size', () => {
    initLogger(tempDir)

    for (let index = 0; index < 101; index += 1) {
      process.stdout.write(`line-${index}`)
    }

    const log = logger.getLog()
    expect(log).to.have.length(100)
    expect(log[0].row).to.equal('line-1')
    expect(log[99].row).to.equal('line-100')
  })

  it('adds and removes debug namespaces', () => {
    initLogger(tempDir)

    logger.addDebug('alpha')
    logger.addDebug('beta')
    logger.addDebug('beta')
    logger.removeDebug('alpha')

    expect(logger.getDebugSettings().debugEnabled).to.equal('beta')
  })

  it('disables debug when enabled string is empty', () => {
    initLogger(tempDir)

    logger.enableDebug('alpha')
    logger.enableDebug('')

    expect(logger.getDebugSettings().debugEnabled).to.equal('')
  })
})
