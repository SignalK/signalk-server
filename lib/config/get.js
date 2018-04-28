const path = require('path')
const { flow, get, partialRight } = require('lodash/fp')

const appPath = path.normalize(__dirname + '/../../')
const addModules = partialRight(path.join, ['node_modules/'])
const appModules = addModules(appPath)

// Return the appPath from an app object.
const getAppPath = get('config.appPath')

// Build path to the public dir of a module. getInstalledPathSync(moduleName, { local: true })
const getModulePublic = moduleName =>
  flow(getAppPath, addModules, partialRight(path.join, [moduleName, 'public']))

module.exports = {
  appModules,
  appPath,
  getAppPath,
  getModulePublic
}
