const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
const _ = require('lodash')
const assert = require('assert')
const freeport = require('freeport-promise')
const { startServerP, WsPromiser, sendDelta } = require('./servertestutilities')
const fetch = require('node-fetch')

describe('Delete Requests', () => {
  let server, port, deltaUrl, url

  before(async () => {
    port = await freeport()
    url = `http://localhost:${port}`
    deltaUrl = 'http://localhost:' + port + '/signalk/v1/api/_test/delta'
    server = await startServerP(port, false, { settings: {disableSchemaMetaDeltas: true} })
  })

  after(async function () {
    await server.stop()
  })


  it('HTTP delete to unhandled path fails', async function () {
    await sendDelta({
      context: 'vesssels.self',
      updates: [
        {
          values: [
            {
              path: 'navigation.logTrip',
              value: 43374
            }
          ]
        }
      ]
    }, deltaUrl)
   
    const result = await fetch(
      `${url}/signalk/v1/api/vessels/self/navigation/logTrip`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    result.status.should.equal(405)
  })

  it('HTTP successful DELETE', async function () {
    let result = await fetch(
      `${url}/signalk/v1/api/vessels/self/navigation/logTrip/meta/displayName`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: 'My Log Trip'
        })
      }
    )

    result.status.should.equal(202)

    result = await fetch(
      `${url}/signalk/v1/api/vessels/self/navigation/logTrip/meta/displayName`)
    result.status.should.equal(200)
    let name = await result.json()
    name.should.equal('My Log Trip')

    result = await fetch(
      `${url}/signalk/v1/api/vessels/self/navigation/logTrip/meta/displayName`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    result.status.should.equal(202)

    result = await fetch(
      `${url}/signalk/v1/api/vessels/self/navigation/logTrip/meta/displayName`)
    result.status.should.equal(404)
  })

  it('WS delete to unhandled path fails', async function () {
    const ws = new WsPromiser(
      'ws://localhost:' + port + '/signalk/v1/stream?subsribe=none'
    )

    let msg = await ws.nextMsg()

    ws.send({
      context: 'vessels.self',
      delete: {
        path: 'navigation.logTrip'
      }
    })

    msg = await ws.nextMsg()
    msg.should.not.equal('timeout')
    const response = JSON.parse(msg)
    response.should.have.property('statusCode')
    response.statusCode.should.equal(405)
  })

  it('WS successful DELETE', async function () {
    let result = await fetch(
      `${url}/signalk/v1/api/vessels/self/navigation/logTrip/meta/displayName`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: 'My Log Trip'
        })
      }
    )
    
    result.status.should.equal(202)
    
    result = await fetch(
      `${url}/signalk/v1/api/vessels/self/navigation/logTrip/meta/displayName`)
    result.status.should.equal(200)
    let name = await result.json()
    name.should.equal('My Log Trip')

    const ws = new WsPromiser(
      'ws://localhost:' + port + '/signalk/v1/stream?subsribe=none'
    )
    
    let msg = await ws.nextMsg()

    ws.send({
      context: 'vessels.self',
      delete: {
        path: 'navigation.logTrip.meta.displayName'
      }
    })

    msg = await ws.nthMessage(4)
    msg.should.not.equal('timeout')
    const response = JSON.parse(msg)
    response.should.have.property('statusCode')
    response.statusCode.should.equal(202)

    result = await fetch(
      `${url}/signalk/v1/api/vessels/self/navigation/logTrip/meta/displayName`)
    result.status.should.equal(404)
  })
})
