const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
const _ = require('lodash')
const assert = require('assert')
//const freeport = require('freeport-promise')
//const { startServerP, WsPromiser, sendDelta } = require('./servertestutilities')

import { startServer } from './ts-servertestutilities'

const fetch = require('node-fetch')

describe('Delete Requests', () => {
  let doStop, doSendDelta, theHost, doSelfPut, doSelfGetJson, doGet, doCreateWsPromiser

  before(async () => {
    const {
      createWsPromiser,
      selfGetJson,
      selfPutV1,
      sendDelta,
      stop,
      host,
      selfGetJsonV1,
      getV1
    } = await startServer()
    doStop = stop
    doSendDelta = sendDelta
    theHost = host
    doSelfPut = selfPutV1
    doSelfGetJson = selfGetJsonV1
    doGet = getV1
    doCreateWsPromiser = createWsPromiser
  })

  after(async function () {
    await doStop()
  })

  it('HTTP delete to unhandled path fails', async function () {
    await doSendDelta('navigation.logTrip', 43374)
   
    const result = await fetch(
      `${theHost}/signalk/v1/api/vessels/self/navigation/logTrip`,
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
    let result = await doSelfPut('navigation/logTrip/meta/displayName', {
      value: 'My Log Trip'
    })

    result.status.should.equal(202)

    result = await doGet('/vessels/self/navigation/logTrip/meta/displayName')
    result.status.should.equal(200)
    let name = await result.json()
    name.should.equal('My Log Trip')

    result = await fetch(
      `${theHost}/signalk/v1/api/vessels/self/navigation/logTrip/meta/displayName`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      }
      )

    result.status.should.equal(202)

    result = await doGet('/vessels/self/navigation/logTrip/meta/displayName')
    result.status.should.equal(404)
  })
  
  it('WS delete to unhandled path fails', async function () {
    const ws = doCreateWsPromiser()

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
    let result = await doSelfPut('navigation/logTrip/meta/displayName', {
      value: 'My Log Trip'
    })
    
    result.status.should.equal(202)

    result = await doGet('/vessels/self/navigation/logTrip/meta/displayName')
    result.status.should.equal(200)
    let name = await result.json()
    name.should.equal('My Log Trip')

    const ws = doCreateWsPromiser()
    
    let msg = await ws.nextMsg()

    ws.send({
      context: 'vessels.self',
      delete: {
        path: 'navigation.logTrip.meta.displayName'
      }
    })

    await ws.nextMsg() //skip the meta delta
    msg = await ws.nextMsg()
    console.log(msg)
    msg.should.not.equal('timeout')
    const response = JSON.parse(msg)
    response.should.have.property('statusCode')
    response.statusCode.should.equal(200)

    result = await doGet('/vessels/self/navigation/logTrip/meta/displayName')
    result.status.should.equal(404)
  })
})
