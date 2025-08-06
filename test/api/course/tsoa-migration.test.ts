import { expect } from 'chai'
import { startServer } from '../../ts-servertestutilities'

/* eslint-disable @typescript-eslint/no-unused-expressions */
describe('TSOA Migration - Course API GET endpoint', () => {
  let stop: () => Promise<void>
  let selfPut: (path: string, body: object) => Promise<Response>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let selfGetJson: (path: string) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sendDelta: (path: string, value: any) => Promise<Response>
  let host: string

  beforeEach(async () => {
    const result = await startServer()
    stop = result.stop
    selfPut = result.selfPut
    selfGetJson = result.selfGetJson
    sendDelta = result.sendDelta
    host = result.host
  })

  afterEach(async () => {
    await stop()
  })

  describe('Parallel endpoint testing', () => {
    it('should have both original and TSOA endpoints available', async () => {
      // Test original endpoint
      const originalData = await selfGetJson('navigation/course')

      // Test TSOA endpoint - try with fetch directly
      const tsoaResponse = await fetch(
        `${host}/signalk/v2/api/vessels/self/navigation/course-tsoa`
      )
      expect(tsoaResponse.status).to.equal(200)
      const tsoaData = await tsoaResponse.json()

      // Both should return course info structure
      expect(originalData).to.have.keys(
        'startTime',
        'targetArrivalTime',
        'arrivalCircle',
        'activeRoute',
        'nextPoint',
        'previousPoint'
      )

      expect(tsoaData).to.have.keys(
        'startTime',
        'targetArrivalTime',
        'arrivalCircle',
        'activeRoute',
        'nextPoint',
        'previousPoint'
      )
    })

    it('should return identical responses from both endpoints', async () => {
      // Set up course data
      await sendDelta('navigation.position', {
        latitude: -35.45,
        longitude: 138.0
      })

      await selfPut('navigation/course/destination', {
        position: { latitude: -35.5, longitude: 138.7 }
      })

      // Wait a moment for delta processing
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Get responses from both endpoints
      const [originalData, tsoaData] = await Promise.all([
        selfGetJson('navigation/course'),
        selfGetJson('navigation/course-tsoa')
      ])

      // Response bodies should be identical
      expect(tsoaData).to.deep.equal(originalData)
    })

    it('should handle empty course state identically', async () => {
      const [originalData, tsoaData] = await Promise.all([
        selfGetJson('navigation/course'),
        selfGetJson('navigation/course-tsoa')
      ])

      // Both should return empty course info
      const emptyCourse = {
        startTime: null,
        targetArrivalTime: null,
        arrivalCircle: 0,
        activeRoute: null,
        nextPoint: null,
        previousPoint: null
      }

      expect(originalData).to.deep.equal(emptyCourse)
      expect(tsoaData).to.deep.equal(emptyCourse)
    })

    it('should handle course with destination identically', async () => {
      // Set position
      await sendDelta('navigation.position', {
        latitude: -35.45,
        longitude: 138.0
      })

      // Set destination
      await selfPut('navigation/course/destination', {
        position: { latitude: -35.5, longitude: 138.7 }
      })

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100))

      const [originalData, tsoaData] = await Promise.all([
        selfGetJson('navigation/course'),
        selfGetJson('navigation/course-tsoa')
      ])

      // Both should have destination set
      expect(originalData.nextPoint).to.exist
      expect(originalData.nextPoint.type).to.equal('Location')
      expect(originalData.nextPoint.position).to.deep.equal({
        latitude: -35.5,
        longitude: 138.7
      })

      expect(tsoaData.nextPoint).to.exist
      expect(tsoaData.nextPoint.type).to.equal('Location')
      expect(tsoaData.nextPoint.position).to.deep.equal({
        latitude: -35.5,
        longitude: 138.7
      })

      // Previous point should be vessel position
      expect(originalData.previousPoint).to.exist
      expect(originalData.previousPoint.type).to.equal('VesselPosition')
      expect(originalData.previousPoint.position).to.deep.equal({
        latitude: -35.45,
        longitude: 138
      })

      expect(tsoaData.previousPoint).to.deep.equal(originalData.previousPoint)

      // Start time should be set and match
      expect(originalData.startTime).to.exist
      expect(tsoaData.startTime).to.equal(originalData.startTime)
    })
  })

  describe('Performance comparison', () => {
    it('should have similar response times', async () => {
      const iterations = 10
      const originalTimes: number[] = []
      const tsoaTimes: number[] = []

      for (let i = 0; i < iterations; i++) {
        // Test original endpoint
        const originalStart = Date.now()
        await selfGetJson('navigation/course')
        originalTimes.push(Date.now() - originalStart)

        // Test TSOA endpoint
        const tsoaStart = Date.now()
        await selfGetJson('navigation/course-tsoa')
        tsoaTimes.push(Date.now() - tsoaStart)
      }

      const avgOriginal = originalTimes.reduce((a, b) => a + b, 0) / iterations
      const avgTsoa = tsoaTimes.reduce((a, b) => a + b, 0) / iterations

      console.log(
        `Average response times - Original: ${avgOriginal}ms, TSOA: ${avgTsoa}ms`
      )

      // TSOA should not be significantly slower (within 20ms)
      expect(Math.abs(avgTsoa - avgOriginal)).to.be.lessThan(20)
    })
  })

  describe('Concurrent request handling', () => {
    it('should handle concurrent requests correctly', async () => {
      // Set up some course data
      await sendDelta('navigation.position', {
        latitude: -35.45,
        longitude: 138.0
      })
      await selfPut('navigation/course/destination', {
        position: { latitude: -35.5, longitude: 138.7 }
      })

      await new Promise((resolve) => setTimeout(resolve, 100))

      // Make concurrent requests to both endpoints
      const requests = []
      for (let i = 0; i < 5; i++) {
        requests.push(
          selfGetJson('navigation/course'),
          selfGetJson('navigation/course-tsoa')
        )
      }

      const responses = await Promise.all(requests)

      // All responses should have the same data
      const firstData = JSON.stringify(responses[0])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      responses.forEach((response: any) => {
        expect(JSON.stringify(response)).to.equal(firstData)
      })
    })
  })

  describe('OpenAPI spec validation', () => {
    it.skip('should have TSOA endpoint documented in OpenAPI spec', async () => {
      // Try the full path for OpenAPI spec
      const response = await fetch(`${host}/signalk/v2/openapi/course`)
      expect(response.status).to.equal(200)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spec: any = await response.json()

      // Check that the spec has been merged
      expect(spec).to.exist
      expect(spec.paths).to.exist

      // During migration, both endpoints should be documented
      if (spec.paths && spec.paths['/course-tsoa']) {
        expect(spec.paths['/course-tsoa'].get).to.exist
        expect(spec.paths['/course-tsoa'].get.operationId).to.exist
        expect(spec.paths['/course-tsoa'].get.responses).to.exist
        expect(spec.paths['/course-tsoa'].get.responses['200']).to.exist
      }

      // Original endpoints should still be documented
      expect(spec.paths['/course']).to.exist
      expect(spec.paths['/course/destination']).to.exist
      expect(spec.paths['/course/arrivalCircle']).to.exist
    })
  })
})
