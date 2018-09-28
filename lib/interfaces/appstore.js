/*
 * Copyright 2017 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

const debug = require('debug')('signalk:interfaces:appstore')
const _ = require('lodash')
const compareVersions = require('compare-versions')
const installModule = require('../modules').installModule
const findModulesWithKeyword = require('../modules').findModulesWithKeyword

module.exports = function (app) {
  var moduleInstalling = undefined
  var modulesInstalledSinceStartup = {}
  var moduleInstallQueue = []

  return {
    start: function () {
      app.post(
        [
          '/appstore/install/:name/:version',
          '/appstore/install/:org/:name/:version'
        ],
        (req, res) => {
          var name = req.params.name
          var version = req.params.version

          if (req.params.org) {
            name = req.params.org + '/' + name
          }

          findPluginsAndWebapps()
            .then(([plugins, webapps]) => {
              if (
                !plugins.find(packageNameIs(name)) &&
                !webapps.find(packageNameIs(name))
              ) {
                res.status(404)
                res.send('No such webapp or plugin available:' + name)
              } else {
                if (moduleInstalling) {
                  moduleInstallQueue.push({ name: name, version: version })
                  sendAppStoreChangedEvent()
                } else {
                  installSKModule(name, version)
                }
                res.send(`Installing ${name}...`)
              }
            })
            .catch(error => {
              console.error(error.message)
              console.error(error.stack)
              res.status(500)
              res.send('<pre>' + error.message + '</pre>')
            })
        }
      )

      app.get('/appstore/available/', (req, res) => {
        findPluginsAndWebapps()
          .then(([plugins, webapps]) => {
            var result = getAllModuleInfo(plugins, webapps)
            res.send(JSON.stringify(result))
          })
          .catch(error => {
            if (error.code === 'ENOTFOUND') {
              res.send({
                available: [],
                installed: [],
                updates: [],
                installing: [],
                storeAvailable: false
              })
            }
            console.log(error)
            console.error(error.message)
            console.error(error.stack)
            res.status(500)
            res.send(error.message)
          })
      })
    },
    stop: function () {}
  }

  function findPluginsAndWebapps () {
    return Promise.all([
      findModulesWithKeyword('signalk-node-server-plugin'),
      findModulesWithKeyword('signalk-webapp')
    ])
  }

  function getPlugin (id) {
    return app.plugins.find(plugin => plugin.packageName === id)
  }

  function getWebApp (id) {
    return app.webapps.find(webapp => webapp.name === id)
  }

  function getAllModuleInfo (plugins, webapps) {
    var all = {
      available: [],
      installed: [],
      updates: [],
      installing: [],
      storeAvailable: true
    }

    getModulesInfo(plugins, getPlugin, all)
    getModulesInfo(webapps, getWebApp, all)
    return all
  }

  function getModulesInfo (modules, existing, result) {
    modules.forEach(plugin => {
      var name = plugin.package.name
      var version = plugin.package.version

      var pluginInfo = {
        name: name,
        version: version,
        description: plugin.package.description,
        author: getAuthor(plugin),
        npmUrl: getNpmUrl(plugin),
        isPlugin: plugin.package.keywords.some(
          v => v === 'signalk-node-server-plugin'
        ),
        isWebapp: plugin.package.keywords.some(v => v === 'signalk-webapp')
      }

      var installedModule = existing(name)

      if (installedModule) {
        pluginInfo.installedVersion = installedModule.version
      }

      if (moduleInstallQueue.find(p => p.name == name)) {
        pluginInfo.isWaiting = true
        addIfNotDuplicate(result.installing, pluginInfo)
      } else if (modulesInstalledSinceStartup[name]) {
        if (moduleInstalling && moduleInstalling.name == name) {
          pluginInfo.isInstalling = true
        } else if (modulesInstalledSinceStartup[name].code != 0) {
          pluginInfo.installFailed = true
        }
        addIfNotDuplicate(result.installing, pluginInfo)
      } else if (installedModule) {
        if (compareVersions(version, installedModule.version) > 0) {
          addIfNotDuplicate(result.updates, pluginInfo)
        } else {
          addIfNotDuplicate(result.installed, pluginInfo)
        }
      } else {
        addIfNotDuplicate(result.available, pluginInfo)
      }

      return result
    })
  }

  function addIfNotDuplicate (theArray, moduleInfo) {
    if (!theArray.find(p => p.name === moduleInfo.name)) {
      theArray.push(moduleInfo)
    }
  }

  function getAuthor (moduleInfo) {
    debug(moduleInfo.package.name + ' author: ' + moduleInfo.package.author)
    return (
      (moduleInfo.package.author &&
        (moduleInfo.package.author.name || moduleInfo.package.author.email)) +
      '' +
      (moduleInfo.package.contributors || [])
        .map(contributor => contributor.name || contributor.email)
        .join(',') +
      '' +
      (moduleInfo.package.name.startsWith('@signalk/')
        ? ' (Signal K team)'
        : '')
    )
  }

  function getNpmUrl (moduleInfo) {
    const npm = _.get(moduleInfo.package, 'links.npm')
    return npm || null
  }

  function sendAppStoreChangedEvent () {
    findPluginsAndWebapps().then(([plugins, webapps]) => {
      var result = getAllModuleInfo(plugins, webapps)
      app.emit('serverevent', {
        type: 'APP_STORE_CHANGED',
        from: 'signalk-server',
        data: result
      })
    })
  }

  function installSKModule (module, version) {
    moduleInstalling = {
      name: module,
      output: [],
      version: version
    }
    modulesInstalledSinceStartup[module] = moduleInstalling

    sendAppStoreChangedEvent()

    installModule(
      app,
      module,
      version,
      output => {
        modulesInstalledSinceStartup[module].output.push(output)
        console.log(`stdout: ${output}`)
      },
      output => {
        modulesInstalledSinceStartup[module].output.push(output)
        console.error(`stderr: ${output}`)
      },
      code => {
        debug('close: ' + module)
        modulesInstalledSinceStartup[module]['code'] = code
        moduleInstalling = undefined
        debug(`child process exited with code ${code}`)

        if (moduleInstallQueue.length) {
          var next = moduleInstallQueue.splice(0, 1)[0]
          installSKModule(next.name, next.version)
        }

        sendAppStoreChangedEvent()
      }
    )
  }
}

function packageNameIs (name) {
  return x => x.package.name === name
}
