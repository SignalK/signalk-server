import { expect } from 'chai'
import { createRequire } from 'module'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const { SERVERROUTESPREFIX } = require('../../src/constants')

type RequestLike = {
  params?: Record<string, string>
}

type ResponseLike = {
  status?: (code: number) => ResponseLike
  send?: (payload: unknown) => ResponseLike
  json?: (payload: unknown) => ResponseLike
  sendFile?: (filePath: string) => ResponseLike
  zip?: (args: {
    files: Array<{ path: string; name: string }>
    filename: string
  }) => void
}

type LogfilesApp = EventEmitter & {
  get: (
    route: string,
    handler: (req: RequestLike, res: ResponseLike) => void
  ) => void
  securityStrategy: { addAdminMiddleware: (route: string) => void }
  config: { vesselName?: string; vesselMMSI?: string }
}

describe('logfiles', () => {
  let tempDir: string
  let routes: Map<string, (req: RequestLike, res: ResponseLike) => void>
  let adminPaths: string[]

  const makeApp = () => {
    const app = new EventEmitter() as LogfilesApp

    routes = new Map()
    adminPaths = []

    app.get = (route, handler) => {
      routes.set(route, handler)
    }
    app.securityStrategy = {
      addAdminMiddleware: (route) => {
        adminPaths.push(route)
      }
    }
    app.config = {}

    return app
  }

  const withMockedLogging = (
    logDir: string,
    listFn: (
      app: unknown,
      cb: (err: Error | null, files?: string[]) => void
    ) => void,
    run: (logfiles: (app: LogfilesApp) => { start: () => void }) => void
  ) => {
    const loggingPath = require.resolve('@signalk/streams/logging')
    const logfilesPath = require.resolve('../../src/interfaces/logfiles')
    const originalLogging = require.cache[loggingPath]

    require.cache[loggingPath] = {
      id: loggingPath,
      filename: loggingPath,
      loaded: true,
      exports: {
        getFullLogDir: () => logDir,
        listLogFiles: listFn
      }
    }

    delete require.cache[logfilesPath]
    const logfiles = require('../../src/interfaces/logfiles')

    try {
      run(logfiles)
    } finally {
      if (originalLogging) {
        require.cache[loggingPath] = originalLogging
      } else {
        delete require.cache[loggingPath]
      }
      delete require.cache[logfilesPath]
    }
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signalk-logfiles-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('lists log files and handles list errors', () => {
    const app = makeApp()

    const originalError = console.error
    console.error = () => {}

    try {
      withMockedLogging(
        tempDir,
        (_app, cb) => cb(null, ['one.log']),
        (logfiles) => {
          logfiles(app).start()

          const handler = routes.get(`${SERVERROUTESPREFIX}/logfiles/`)
          expect(handler).to.be.a('function')
          expect(adminPaths).to.include(`${SERVERROUTESPREFIX}/logfiles/`)

          const res = {
            statusCode: 0,
            body: undefined as unknown,
            status(code: number) {
              this.statusCode = code
              return this
            },
            json(payload: unknown) {
              this.body = payload
              return this
            }
          }
          handler!({}, res)
          expect(res.body).to.deep.equal(['one.log'])
        }
      )

      withMockedLogging(
        tempDir,
        (_app, cb) => cb(new Error('fail')),
        (logfiles) => {
          logfiles(app).start()

          const handler = routes.get(`${SERVERROUTESPREFIX}/logfiles/`)
          const res = {
            statusCode: 0,
            body: undefined as unknown,
            status(code: number) {
              this.statusCode = code
              return this
            },
            json(payload: unknown) {
              this.body = payload
              return this
            }
          }
          handler!({}, res)
          expect(res.statusCode).to.equal(500)
          expect(res.body).to.equal('Error reading logfiles list')
        }
      )
    } finally {
      console.error = originalError
    }
  })

  it('validates and serves log files', () => {
    const app = makeApp()

    withMockedLogging(
      tempDir,
      (_app, cb) => cb(null, []),
      (logfiles) => {
        logfiles(app).start()

        const handler = routes.get(`${SERVERROUTESPREFIX}/logfiles/:filename`)
        expect(handler).to.be.a('function')

        let responseStatus = 0
        let responseBody: unknown
        let sentFile = ''

        const res = {
          status(code: number) {
            responseStatus = code
            return this
          },
          send(payload: unknown) {
            responseBody = payload
            return this
          },
          sendFile(filePath: string) {
            sentFile = filePath
            return this
          }
        }

        handler!({ params: { filename: '%E0%A4%A' } }, res)
        expect(responseStatus).to.equal(400)
        expect(responseBody).to.equal('Invalid filename')

        responseStatus = 0
        responseBody = undefined
        handler!({ params: { filename: '../secret.log' } }, res)
        expect(responseStatus).to.equal(400)
        expect(responseBody).to.equal('Invalid filename')

        handler!({ params: { filename: 'valid.log' } }, res)
        expect(sentFile).to.equal(path.resolve(path.join(tempDir, 'valid.log')))
      }
    )
  })

  it('creates a zip response for log files', () => {
    const app = makeApp()
    app.config.vesselName = 'Sea*Star'

    withMockedLogging(
      tempDir,
      (_app, cb) => cb(null, []),
      (logfiles) => {
        logfiles(app).start()

        const handler = routes.get(`${SERVERROUTESPREFIX}/ziplogs`)
        expect(handler).to.be.a('function')

        let zipArgs:
          | { files: Array<{ path: string; name: string }>; filename: string }
          | undefined
        const res = {
          zip: (args: {
            files: Array<{ path: string; name: string }>
            filename: string
          }) => {
            zipArgs = args
          }
        }

        handler!({}, res)

        expect(zipArgs).to.not.equal(undefined)
        expect(zipArgs!.files[0].path).to.equal(tempDir)
        expect(zipArgs!.filename).to.match(
          /^sk-logs-Sea_Star-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.zip$/
        )
        expect(zipArgs!.files[0].name).to.match(
          /^sk-logs-Sea_Star-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/
        )
      }
    )
  })
})
