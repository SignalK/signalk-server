const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
const _ = require('lodash')
const freeport = require('freeport-promise')
const Server = require('../dist')
const { WsPromiser } = require('./servertestutilities')

const testDeltaDate = new Date('2018-08-09T14:07:29.695Z')
const testDelta = {
  updates: [
    {
      timestamp: '2018-08-09T14:07:29.695Z',
      values: [
        { path: 'performance.velocityMadeGood', value: 0.16641505293384623 },
        {
          path: 'performance.beatAngleVelocityMadeGood',
          value: 0.16641505293384623
        }
      ],
      $source: 'test-source'
    }
  ]
}

const dummyHistoryProvider = app => {
  return {
    streamHistory: (cookie, options, onDelta) => {
      setTimeout(() => {
        testDelta.context = `vessels.${app.selfId}`
        onDelta(testDelta)
      }, 100)
      return () => {}
    },
    getHistory: (date, path, cb) => {
      testDelta.context = `vessels.${app.selfId}`
      if (date.getTime() === testDeltaDate.getTime()) {
        cb([testDelta])
      } else {
        cb([])
      }
    },
    hasAnyData: (options, cb) => {
      cb(options.startTime.getTime() === testDeltaDate.getTime())
    }
  }
}

describe('History', _ => {
  let server, url, port

  before(async function () {
    port = await freeport()
    url = `http://0.0.0.0:${port}`
    const serverApp = new Server({
      config: {
        settings: {
          port,
          interfaces: {
            plugins: false
          }
        }
      }
    })
    server = await serverApp.start()
    server.app.registerHistoryProvider(dummyHistoryProvider(server.app))
  })

  after(async function () {
    await server.stop()
  })

  it('startTime subscription works', async function () {
    const wsPromiser = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/playback?subscribe=self&startTime=2018-08-09T14:07:29.695Z&metaDeltas=none`
    )
    let msg = await wsPromiser.nextMsg()
    msg.should.not.equal('timeout')
    JSON.parse(msg)

    msg = await wsPromiser.nextMsg()
    msg.should.not.equal('timeout')
    const delta = JSON.parse(msg)
    delta.updates[0].values[0].path.should.equal('performance.velocityMadeGood')

    msg = await wsPromiser.nextMsg()
    msg.should.equal('timeout')
  })

  it('REST time request works', async function () {
    const result = await fetch(
      `${url}/signalk/v1/api/snapshot/vessels/self?time=2018-08-09T14:07:29.695Z`
    )
    result.status.should.equal(200)
    const json = await result.json()
    json.should.have.nested.property('performance.velocityMadeGood')
  })

  it('REST time request with no data  works', async function () {
    const result = await fetch(
      `${url}/signalk/v1/api/snapshot/vessels/self?time=2018-08-09T14:07:29.694Z`
    )
    result.status.should.equal(404)
  })
})
