const path = require('path')
const { curry, flow, get, unary } = require('lodash/fp')

const appPath = path.normalize(__dirname + '/../../')
const addModulesPath = str => path.join(str, 'node_modules/')
const appModules = addModulesPath(appPath)

// Return the appPath from an app object.
const getAppPath = get('config.appPath')
const getAppModulesPath = flow(getAppPath, addModulesPath)

const getModulePath = curry((filename, moduleName, app) =>
  flow(getAppModulesPath, x => path.join(x, moduleName, filename))(app)
)

const getAppPackagePath = getModulePath('package.json')
// Build path to the public dir of a module. getInstalledPathSync(moduleName, { local: true })
const getModulePublicPathPath = getModulePath('public')

module.exports = {
  addModulesPath,
  appModules,
  appPath,
  getAppPath,
  getAppPackagePath,
  getAppModulesPath,
  getModulePath,
  getModulePublicPath
}
