const path = require('path')
const { curry, flow, get } = require('lodash/fp')
// const { getInstalledPathSync } = require('get-installed-path')

// Return the appPath from an app object.
const getAppPath = get('config.appPath')

// Build path to the public dir of a module.
const getModulePublic = curry((moduleName, app) =>
  path.join(getAppPath(app), 'node_modules', moduleName, 'public')
)
// path.join(getInstalledPathSync(moduleName, { local: true }), 'public')

// #521 Returns path to load plugin-config assets.
const getPluginConfigPublic = getModulePublic('@signalk/plugin-config')
// #524 Returns path to load admin-ui client assets.
const getAdminPublic = getModulePublic('@signalk/admin-ui')

module.exports = {
  getAdminPublic,
  getAppPath,
  getModulePublic,
  getPluginConfigPublic
}
