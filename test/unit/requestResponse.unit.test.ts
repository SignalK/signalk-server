import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const requestResponse = require('../../src/requestResponse')

type TestApp = {
  intervals: NodeJS.Timeout[]
}

const expectReject = async (promise: Promise<unknown>, message: string) => {
  try {
    await promise
    throw new Error('Expected rejection')
  } catch (error) {
    expect((error as Error).message).to.equal(message)
  }
}

describe('requestResponse', () => {
  let app: TestApp

  beforeEach(() => {
    app = { intervals: [] }
  })

  afterEach(() => {
    app.intervals.forEach((interval) => clearInterval(interval))
    requestResponse.resetRequests()
  })

  it('creates and queries requests', async () => {
    const request = await requestResponse.createRequest(
      app,
      'put',
      {
        context: 'vessels.self',
        put: { path: 'navigation.speedOverGround', value: 1 }
      },
      'user-1',
      '127.0.0.1'
    )

    expect(request.requestId).to.be.a('string')
    expect(request.state).to.equal('PENDING')

    const reply = await requestResponse.queryRequest(request.requestId)
    expect(reply.requestId).to.equal(request.requestId)
    expect(reply.statusCode).to.equal(202)
    expect(reply.href).to.equal(`/signalk/v1/requests/${request.requestId}`)
    expect(reply.ip).to.equal('127.0.0.1')
    expect(reply.user).to.equal('user-1')
  })

  it('updates requests and notifies callbacks', async () => {
    const updates: Array<Record<string, unknown>> = []
    const request = await requestResponse.createRequest(
      app,
      'put',
      {
        context: 'vessels.self',
        put: { path: 'navigation.courseOverGroundTrue' }
      },
      'user-1',
      '127.0.0.1',
      (reply: Record<string, unknown>) => updates.push(reply)
    )

    const reply = await requestResponse.updateRequest(
      request.requestId,
      'COMPLETED',
      {
        statusCode: 200,
        data: { result: true },
        message: 'ok',
        percentComplete: 50
      }
    )

    expect(reply.state).to.equal('COMPLETED')
    expect(reply.statusCode).to.equal(200)
    expect(reply.put).to.deep.equal({ result: true })
    expect(reply.message).to.equal('ok')
    expect(updates).to.have.length(1)
    expect(updates[0]).to.deep.equal(reply)
  })

  it('filters and finds requests', async () => {
    const putRequest = await requestResponse.createRequest(app, 'put', {
      context: 'vessels.self',
      put: { path: 'electrical.switches.switch1.state' }
    })

    const deleteRequest = await requestResponse.createRequest(app, 'delete', {
      context: 'vessels.self',
      delete: { path: 'electrical.switches.switch2.state' }
    })

    await requestResponse.updateRequest(putRequest.requestId, 'COMPLETED', {
      statusCode: 200
    })

    const allPut = requestResponse.filterRequests('put', null)
    expect(allPut).to.have.length(1)

    const completedPut = requestResponse.filterRequests('put', 'COMPLETED')
    expect(completedPut).to.have.length(1)

    const found = requestResponse.findRequest(
      (request: { requestId: string }) =>
        request.requestId === deleteRequest.requestId
    )
    expect(found).to.not.equal(undefined)
    expect(found.requestId).to.equal(deleteRequest.requestId)
  })

  it('rejects missing requests', async () => {
    await expectReject(
      requestResponse.updateRequest('missing', 'COMPLETED', {}),
      'request not found'
    )
    await expectReject(requestResponse.queryRequest('missing'), 'not found')
  })
})
