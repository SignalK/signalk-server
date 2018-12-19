const path = require('path')
const { flow, get, partial, partialRight, unary } = require('lodash/fp')

const appPath = path.normalize(__dirname + '/../../')
const addModulesPath = str => path.join(str, 'node_modules/')
const appModules = addModulesPath(appPath)

// Return the appPath from an app object.
const getAppPath = get('config.appPath')

// Build path to the public dir of a module. getInstalledPathSync(moduleName, { local: true })
const getModulePublic = moduleName =>
  flow(
    getAppPath,
    addModulesPath,
    partialRight(path.join, [moduleName, 'public'])
  )

module.exports = {
  addModulesPath,
  appModules,
  appPath,
  getAppPath,
  getModulePublic
}
