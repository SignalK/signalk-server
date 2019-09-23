const chai = require('chai')
const _ = require('lodash')
const fs = require('fs')
const path = require('path')
const { modulesWithKeyword } = require('./modules')

const expectedModules = [
  '@signalk/freeboard-sk',
  '@signalk/instrumentpanel',
  '@signalk/maptracker',
  '@signalk/playground',
  '@signalk/sailgauge',
  '@signalk/simplegauges'
]

const testTempDir = path.join(
  require('os').tmpdir(),
  '_skservertest_modules' + Date.now()
)

const app = {
  config: {
    appPath: path.join(__dirname + '/../'),
    configPath: testTempDir
  }
}

fs.mkdirSync(testTempDir)
const tempNodeModules = path.join(testTempDir, 'node_modules/')
fs.mkdirSync(path.join(testTempDir, 'node_modules'))
fs.mkdirSync(path.join(testTempDir, 'node_modules/@signalk'))
const configMaptrackerDirectory = path.join(
  testTempDir,
  'node_modules/@signalk/maptracker'
)
fs.mkdirSync(configMaptrackerDirectory)

const maptrackerPkg = require(path.join(
  app.config.appPath,
  'node_modules/@signalk/maptracker/package.json'
))
maptrackerPkg.version = '1000.0.0'
fs.writeFileSync(
  path.join(configMaptrackerDirectory, 'package.json'),
  JSON.stringify(maptrackerPkg)
)

describe('modulesWithKeyword', () => {
  it('returns a list of modules', () => {
    const moduleList = modulesWithKeyword(app, 'signalk-webapp')
    chai.expect(_.map(moduleList, 'module')).to.eql(expectedModules)
    chai.expect(moduleList[0].location).to.not.eql(tempNodeModules)
    chai.expect(moduleList[2].location).to.eql(tempNodeModules)
  })
})
