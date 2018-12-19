const path = require('path')
const { flow, get, partial, partialRight, unary } = require('lodash/fp')

const appPath = path.normalize(__dirname + '/../../')
const addModulesPath = unary(partial(path.join, _, 'node_modules/'))
const appModules = addModules(appPath)

// Return the appPath from an app object.
const getAppPath = get('config.appPath')

// Build path to the public dir of a module. getInstalledPathSync(moduleName, { local: true })
const getModulePublic = moduleName =>
  flow(getAppPath, addModules, partialRight(path.join, [moduleName, 'public']))

module.exports = {
  addModulesPath,
  appModules,
  appPath,
  getAppPath,
  getModulePublic
}
