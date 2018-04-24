const { getAdminPublic, getAppPath, getPluginConfigPublic } = require('./get')

/* globals describe test expect */

const app = {
  config: {
    appPath: '/Users/user/node/signalk-server-node/'
  }
}
describe('getAppPath', () => {
  test('returns module install path from app', () => {
    expect(getAppPath(app)).toBe('/Users/user/node/signalk-server-node/')
  })
})
describe('getAdminPublic', () => {
  test('returns admin ui public dir', () => {
    expect(getAdminPublic(app)).toBe(
      '/Users/user/node/signalk-server-node/node_modules/@signalk/admin-ui/public'
    )
  })
})
describe('getPluginConfigPublic', () => {
  test('returns plugin config public dir', () => {
    expect(getPluginConfigPublic(app)).toBe(
      '/Users/user/node/signalk-server-node/node_modules/@signalk/plugin-config/public'
    )
  })
})
