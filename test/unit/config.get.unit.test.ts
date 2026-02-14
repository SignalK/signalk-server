import { expect } from 'chai'
import { createRequire } from 'module'
import path from 'path'

const require = createRequire(import.meta.url)
const configGet = require('../../src/config/get')

describe('config/get', () => {
  it('returns appPath from config', () => {
    const app = { config: { appPath: '/tmp/signalk' } }
    expect(configGet.getAppPath(app)).to.equal('/tmp/signalk')
  })

  it('builds module public path from appPath', () => {
    const app = { config: { appPath: '/tmp/signalk' } }
    const getModulePublic = configGet.getModulePublic('demo-module')

    const result = getModulePublic(app)
    const expected = path.join(
      '/tmp/signalk',
      'node_modules',
      'demo-module',
      'public'
    )

    expect(result).to.equal(expected)
  })

  it('exports app module path helpers', () => {
    const expectedModules =
      path.join(configGet.appPath, 'node_modules') + path.sep
    expect(configGet.appModules).to.equal(expectedModules)
  })
})
