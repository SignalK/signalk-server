const _ = require('lodash')
const assert = require('assert')
const { freeport } = require('./ts-servertestutilities')
const fetch = require('node-fetch')
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
    serverP = freeport()
      .then((p) => {
        port = p
        return startServerP(p, false, metaConfig)
      })
      .catch((e) => {
        console.log(e)
      })
  })

  after((done) => {
    serverP
      .then((server) => server.stop())
      .then(() => {
        done()
      })
  })

  it('valid .../meta works', () => {
    return getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/foo/navigation/headingTrue/meta`
    )
      .then((r) => r.json())
      .then((result) => {
        assert.equal(result.units, 'rad')
      })
  })

  it('invalid .../meta returns error', (done) => {
    getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/foo/navigation/headingTrueTRUE/meta`
    ).then((response) => {
      assert.equal(response.status, 404)
      done()
    })
  })

  it('valid .../units works', () => {
    return getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/foo/navigation/headingTrue/meta/units`
    )
      .then((r) => r.json())
      .then((result) => {
        assert.equal(result, 'rad')
      })
  })

  it('invalid .../units returns error', (done) => {
    getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/foo/navigation/headingTrueTRUE/meta/units`
    ).then((response) => {
      assert.equal(response.status, 404)
      done()
    })
  })

  it('valid .../from defaults works', () => {
    return getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/self/electrical/batteries/1/voltage/meta/testKey`
    ) //then(r => r.json()).then(result => {
      .then((r) => r.text())
      .then((result) => {
        //assert.equal(result, 'testValue')
        console.log(result)
      })
  })

  it('valid .../units with defaults works', () => {
    return getUrl(
      `http://localhost:${port}/signalk/v1/api/vessels/self/electrical/batteries/1/voltage/meta/units`
    )
      .then((r) => r.json())
      .then((result) => {
        assert.equal(result, 'V')
      })
  })

  function getUrl(url) {
    return serverP.then((_) => fetch(url))
  }
})
