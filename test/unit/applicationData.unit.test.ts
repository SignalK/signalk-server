import { expect } from 'chai'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)

type RequestLike = {
  params: Record<string, string>
  body?: unknown
  query?: Record<string, string>
}

type ResponseLike = {
  statusCode: number
  payload: unknown
  status: (code: number) => ResponseLike
  send: (payload?: unknown) => ResponseLike
  sendStatus: (code: number) => ResponseLike
  json: (payload: unknown) => ResponseLike
}

type Handler = (req: RequestLike, res: ResponseLike) => void

type AppLike = {
  config: { configPath: string }
  securityStrategy: {
    isDummy: () => boolean
    addAdminWriteMiddleware: (path: string) => void
    addWriteMiddleware: (path: string) => void
  }
  post: (paths: string[] | string, handler: Handler) => void
  get: (paths: string[] | string, handler: Handler) => void
}

describe('applicationData interface', () => {
  let app: AppLike
  let getRoutes: Record<string, Handler>
  let postRoutes: Record<string, Handler>
  let tempDir: string

  const makeRes = () => {
    const res = {
      statusCode: 200,
      payload: undefined as unknown,
      status(code: number) {
        this.statusCode = code
        return this
      },
      send(payload?: unknown) {
        this.payload = payload
        return this
      },
      sendStatus(code: number) {
        this.statusCode = code
        return this
      },
      json(payload: unknown) {
        this.payload = payload
        return this
      }
    }
    return res
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signalk-appdata-'))
    getRoutes = {}
    postRoutes = {}
    app = {
      config: { configPath: tempDir },
      securityStrategy: {
        isDummy: () => false,
        addAdminWriteMiddleware: () => undefined,
        addWriteMiddleware: () => undefined
      },
      post: (paths: string[] | string, handler: Handler) => {
        const list = Array.isArray(paths) ? paths : [paths]
        list.forEach((path) => {
          postRoutes[path] = handler
        })
      },
      get: (paths: string[] | string, handler: Handler) => {
        const list = Array.isArray(paths) ? paths : [paths]
        list.forEach((path) => {
          getRoutes[path] = handler
        })
      }
    }
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('rejects invalid app id and version', () => {
    const applicationData = require('../../src/interfaces/applicationData')
    applicationData(app)

    const resInvalidId = makeRes()
    postRoutes['/signalk/v1/applicationData/global/:appid/:version'](
      { params: { appid: 'invalid/app', version: '1.0.0' } },
      resInvalidId
    )
    expect(resInvalidId.statusCode).to.equal(400)

    const resInvalidVersion = makeRes()
    postRoutes['/signalk/v1/applicationData/global/:appid/:version'](
      { params: { appid: 'ok', version: 'not-a-version' } },
      resInvalidVersion
    )
    expect(resInvalidVersion.statusCode).to.equal(400)
  })

  it('blocks prototype pollution paths and patches', () => {
    const applicationData = require('../../src/interfaces/applicationData')
    applicationData(app)

    const resPath = makeRes()
    postRoutes['/signalk/v1/applicationData/global/:appid/:version/*'](
      {
        params: { appid: 'app', version: '1.0.0', 0: '__proto__/x' },
        body: { value: 1 }
      },
      resPath
    )
    expect(resPath.statusCode).to.equal(400)

    const resPatch = makeRes()
    postRoutes['/signalk/v1/applicationData/global/:appid/:version'](
      {
        params: { appid: 'app', version: '1.0.0' },
        body: [{ op: 'add', path: '/__proto__/x', value: 1 }]
      },
      resPatch
    )
    expect(resPatch.statusCode).to.equal(400)
  })

  it('saves and retrieves application data', async () => {
    const applicationData = require('../../src/interfaces/applicationData')
    applicationData(app)

    const resPost = makeRes()
    await new Promise<void>((resolve) => {
      resPost.json = (payload: unknown) => {
        resPost.payload = payload
        resolve()
        return resPost
      }

      postRoutes['/signalk/v1/applicationData/global/:appid/:version'](
        {
          params: { appid: 'app', version: '1.0.0' },
          body: { value: 1 }
        },
        resPost
      )
    })
    expect(resPost.payload).to.equal('ApplicationData saved')

    const resGet = makeRes()
    getRoutes['/signalk/v1/applicationData/global/:appid/:version'](
      { params: { appid: 'app', version: '1.0.0' }, query: {} },
      resGet
    )
    expect(resGet.payload).to.deep.equal({ value: 1 })
  })

  it('lists versions and returns 404 when missing', async () => {
    const applicationData = require('../../src/interfaces/applicationData')
    applicationData(app)

    const resMissing = makeRes()
    getRoutes['/signalk/v1/applicationData/global/:appid'](
      { params: { appid: 'app' } },
      resMissing
    )
    expect(resMissing.statusCode).to.equal(404)

    const resPost = makeRes()
    await new Promise<void>((resolve) => {
      resPost.json = (payload: unknown) => {
        resPost.payload = payload
        resolve()
        return resPost
      }

      postRoutes['/signalk/v1/applicationData/global/:appid/:version'](
        {
          params: { appid: 'app', version: '1.0.0' },
          body: { value: 1 }
        },
        resPost
      )
    })

    const resList = makeRes()
    getRoutes['/signalk/v1/applicationData/global/:appid'](
      { params: { appid: 'app' } },
      resList
    )
    expect(resList.payload).to.deep.equal(['1.0.0'])
  })
})
