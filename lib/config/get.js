const path = require('path')
const { curry, flow, get, partialRight, unary } = require('lodash/fp')

const appPath = path.normalize(__dirname + '/../../')
const addModulesPath = str => path.join(str, 'node_modules/')
const appModules = addModulesPath(appPath)

// Return the appPath from an app object.
const getAppPath = get('config.appPath')
const getAppModules = flow(getAppPath, addModulesPath)

const getModulePath = curry((filename, moduleName, app) =>
  flow(getAppModules, partialRight(path.join, [moduleName, filename]))(app)
)

const getAppModuleInfo = getModulePath('package.json')
// Build path to the public dir of a module. getInstalledPathSync(moduleName, { local: true })
const getModulePublic = getModulePath('public')

module.exports = {
  addModulesPath,
  appModules,
  appPath,
  getAppPath,
  getAppModuleInfo,
  getAppModules,
  getModulePath,
  getModulePublic
}
