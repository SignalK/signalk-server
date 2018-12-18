const chai = require('chai')
const {
  getAppPath,
  getAppModules,
  getModulePath,
  getModulePublic
} = require('./get')

const app = { config: { appPath: '/foo' } }

describe('getAppPath', () => {
  it('Get the appPath value from app config.', () => {
    chai.expect(getAppPath(app)).to.equal('/foo')
  })
})
describe('getAppModules', () => {
  it('Get the appPath value from app config.', () => {
    chai.expect(getAppModules(app)).to.equal('/foo/node_modules/')
  })
})

describe('getModulePath', () => {
  it('creates path to module file or dir', () => {
    const filepath = getModulePath('README.md', 'signalk-webapp')(app)
    chai.expect(filepath).to.equal('/foo/node_modules/signalk-webapp/README.md')
    chai
      .expect(getModulePath('README.md', 'signalk-webapp', app))
      .to.equal('/foo/node_modules/signalk-webapp/README.md')
  })
})
describe('getModulePublic', () => {
  it('creates path to module public dir', () => {
    const filepath = getModulePublic('signalk-webapp')(app)
    chai.expect(filepath).to.equal('/foo/node_modules/signalk-webapp/public')
  })
})
