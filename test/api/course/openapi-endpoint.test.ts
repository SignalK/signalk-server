/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { startServer } from '../../ts-servertestutilities'

describe('Course API OpenAPI endpoint', () => {
  let stop: () => Promise<void>
  let host: string

  beforeEach(async () => {
    const result = await startServer()
    stop = result.stop
    host = result.host
  })

  afterEach(async () => {
    await stop()
  })

  it('should serve merged OpenAPI spec with both TSOA and static endpoints', async () => {
    const response = await fetch(`${host}/skServer/openapi/course`)
    expect(response.status).to.equal(200)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spec: any = await response.json()

    // Check that spec has merged content
    expect(spec).to.exist
    expect(spec.info).to.exist
    expect(spec.info.title).to.equal('Course API')
    expect(spec.info.description).to.include('Hybrid: TSOA + Static')

    // Check paths exist
    expect(spec.paths).to.exist

    // Original GET endpoint should be replaced with TSOA version
    expect(spec.paths['/course']).to.exist
    expect(spec.paths['/course'].get).to.exist
    expect(spec.paths['/course'].get.operationId).to.equal('getCourseInfo')

    // Other methods should still exist from static spec
    expect(spec.paths['/course/destination']).to.exist
    expect(spec.paths['/course/destination'].put).to.exist
    expect(spec.paths['/course/arrivalCircle']).to.exist
    expect(spec.paths['/course/activeRoute']).to.exist

    // During migration, test endpoint should also exist
    expect(spec.paths['/course-tsoa']).to.exist
    expect(spec.paths['/course-tsoa'].get).to.exist

    // Check that CourseInfo schema is present
    if (spec.components && spec.components.schemas) {
      expect(spec.components.schemas.CourseInfo).to.exist
    }
  })

  it('should have proper servers configuration', async () => {
    const response = await fetch(`${host}/skServer/openapi/course`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spec: any = await response.json()

    expect(spec.servers).to.exist
    expect(spec.servers).to.be.an('array')
    expect(spec.servers[0]).to.exist
    expect(spec.servers[0].url).to.equal(
      '/signalk/v2/api/vessels/self/navigation'
    )
  })
})
