const _ = require('lodash')
const assert = require('assert')
const freeport = require('freeport-promise')
const WebSocket = require('ws')
const rp = require('request-promise')
const startServerP = require('./servertestutilities').startServerP

const metaConfig = {
  defaults: {
    vessels: {
      self: {
        electrical: {
          batteries: {
            1: {
              voltage: {
                meta: {
                  testKey: 'testValue'
                }
              }
            }
          }
        }
      }
    }
  }
}

describe('Metadata retrieval', () => {
  let serverP, port

  before(() => {
    serverP = freeport().then(p => {
      port = p
      return startServerP(p, false, metaConfig)
    })
      .catch(e => {
        console.log(e)
      })
  })

  after(done => {
    serverP
      .then(server => server.stop())
      .then(() => {
        done()
      })
  })

  it('valid .../meta works', () => {
    return getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/foo/navigation/headingTrue/meta`
    ).then(result => {
      assert.equal(result.units, 'rad')
    })
  })

  it('invalid .../meta returns error', done => {
    getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/foo/navigation/headingTrueTRUE/meta`
    ).catch(reason => {
      assert.equal(reason.statusCode, 404)
      done()
    })
  })

  it('valid .../units works', () => {
    return getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/foo/navigation/headingTrue/meta/units`
    ).then(result => {
      assert.equal(result, 'rad')
    })
  })

  it('invalid .../units returns error', done => {
    getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/foo/navigation/headingTrueTRUE/meta/units`
    ).catch(reason => {
      assert.equal(reason.statusCode, 404)
      done()
    })
  })

  it('valid .../from defaults works', () => {
    return getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/self/electrical/batteries/1/voltage/meta/testKey`
    ).then(result => {
      assert.equal(result, 'testValue')
    })
  })

  it('valid .../units with defaults works', () => {
    return getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/self/electrical/batteries/1/voltage/meta/units`
    ).then(result => {
      assert.equal(result, 'V')
    })
  })

  function getUrl (url) {
    return serverP.then(_ => {
      return rp({
        url: url,
        method: 'GET',
        json: true
      })
    })
  }
})
