const _ = require('lodash')
const assert = require('assert')
const freeport = require('freeport-promise')
const WebSocket = require('ws')
const rp = require('request-promise')
const startServerP = require('./servertestutilities').startServerP

describe('Metadata retrieval', () => {
  let serverP, port
  const defaultsDotJson = {
    vessels: {
      self: {
        navigation: {
          courseOverGroundTrue: {
            meta: {
              description: 'Overload in default.json',
              timeout: 60,
              units: 'deg'
            }
          }
        },
        sensors: {
          mySensor: {
            meta: {
              displayName: 'My sensor',
              units: 'ratio'
            }
          }
        }
      }
    }
  }

  before(() => {
    serverP = freeport().then(p => {
      port = p
      return startServerP(p, defaultsDotJson)
    })
  })

  after(done => {
    serverP.then(server => server.stop()).then(() => {
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
  it('valid .../meta works', () => {
    return getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/self/navigation/courseOverGroundTrue/meta`
    ).then(result => {
      assert.equal(result.description, 'Overload in default.json')
    })
  })

  it('valid .../meta works', () => {
    return getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/self/navigation/courseOverGroundTrue/meta`
    ).then(result => {
      assert.equal(result.timeout, 60)
    })
  })

  it('valid .../meta works', () => {
    return getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/self/sensors/mySensor/meta`
    ).then(result => {
      assert.equal(result.displayName, 'My sensor')
    })
  })

  it('valid .../meta works', () => {
    return getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/self/sensors/mySensor/meta`
    ).then(result => {
      assert.equal(result.units, 'ratio')
    })
  })

  it('valid .../units works', () => {
    return getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/foo/navigation/headingTrue/meta/units`
    ).then(result => {
      assert.equal(result, 'rad')
    })
  })

  it('valid .../units works', () => {
    return getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/self/navigation/courseOverGroundTrue/meta/units`
    ).then(result => {
      assert.equal(result, 'deg')
    })
  })

  it('valid .../units works', () => {
    return getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/self/sensors/mySensor/meta/units`
    ).then(result => {
      assert.equal(result, 'ratio')
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

  it('invalid .../units returns error', done => {
    getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/self/sensors/mySensor1/meta/units`
    ).catch(reason => {
      assert.equal(reason.statusCode, 404)
      done()
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
