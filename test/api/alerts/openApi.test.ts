import { expect } from 'chai'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { AlertsApi, type AlertsApplication } from '../../../src/api/alerts'
import { alertsApiRecord } from '../../../src/api/alerts/openApi'
import { FakeApp } from './helpers/fakeApp'

/** Only the parts of the document these tests read. */
interface AlertsOpenApiDoc {
  servers: { url: string }[]
  paths: Record<string, Record<string, unknown>>
  components: { schemas: Record<string, { required?: string[] }> }
}

const doc = alertsApiRecord.apiDoc as unknown as AlertsOpenApiDoc

describe('alerts OpenAPI document', () => {
  let tempDir: string
  let api: AlertsApi
  let app: FakeApp

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alerts-openapi-'))
    app = new FakeApp(tempDir)
    api = new AlertsApi(app as unknown as AlertsApplication)
    await api.start()
  })

  afterEach(async () => {
    await api.stop()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('serves under the path it documents', () => {
    expect(alertsApiRecord.name).to.equal('alerts')
    expect(doc.servers[0].url).to.equal(alertsApiRecord.path)
  })

  it('documents every route the API registers, and no others', () => {
    const served = Array.from(app.routes.keys())
      .map((route) => {
        const [method, url] = route.split(' ')
        const relative = url.slice(alertsApiRecord.path.length) || '/'
        return `${method} ${relative.replace(':id', '{id}')}`
      })
      .sort()

    const documented = Object.entries(doc.paths)
      .flatMap(([url, operations]) =>
        Object.keys(operations as object).map(
          (method) => `${method.toUpperCase()} ${url}`
        )
      )
      .sort()

    expect(documented).to.deep.equal(served)
  })

  it('describes what a failed request returns', () => {
    expect(doc.components.schemas.ErrorResponse.required).to.have.members([
      'state',
      'statusCode',
      'message'
    ])
  })
})
