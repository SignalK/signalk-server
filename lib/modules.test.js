const chai = require('chai')
const _ = require('lodash')
const { modulesWithKeyword } = require('./modules')
const { load } = require('./config/config')

const app = { get: () => {} }
load(app)

const expectedModules = [
  '@signalk/freeboard-sk',
  '@signalk/instrumentpanel',
  '@signalk/maptracker',
  '@signalk/playground',
  '@signalk/sailgauge',
  '@signalk/simplegauges'
]

describe('modulesWithKeyword', () => {
  it('returns a list of modules', () => {
    const moduleList = modulesWithKeyword(app, 'signalk-webapp')
    chai.expect(_.map(moduleList, 'module')).to.eql(expectedModules)
  })
})
