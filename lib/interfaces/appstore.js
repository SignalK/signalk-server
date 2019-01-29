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
const { findModulesWithKeyword, getLatestServerVersion } = require('../modules')

module.exports = function (app) {
  let moduleInstalling = undefined
  const modulesInstalledSinceStartup = {}
  const moduleInstallQueue = []

  return {
    start: function () {
      app.post(
        [
          '/appstore/install/:name/:version',
          '/appstore/install/:org/:name/:version'
        ],
        (req, res) => {
          let name = req.params.name
          const version = req.params.version

          if (req.params.org) {
            name = req.params.org + '/' + name
          }

          findPluginsAndWebapps()
            .then(([plugins, webapps]) => {
              if (
                name !== app.config.name &&
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
            getLatestServerVersion().then(serverVersion => {
              const result = getAllModuleInfo(plugins, webapps, serverVersion)
              res.send(JSON.stringify(result))
            })
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

  function getAllModuleInfo (plugins, webapps, serverVersion) {
    const all = {
      available: [],
      installed: [],
      updates: [],
      installing: [],
      storeAvailable: true
    }

    if (
      process.argv.length > 0 &&
      (process.argv[1] === '/usr/bin/signalk-server' ||
        process.argv[1] ===
          '/usr/lib/node_modules/signalk-server/bin/signalk-server') &&
      !process.env.SIGNALK_DISABLE_SERVER_UPDATES
    ) {
      all.canUpdateServer = true
      if (compareVersions(serverVersion, app.config.version) > 0) {
        all.serverUpdate = serverVersion

        const info = {
          name: app.config.name,
          version: serverVersion,
          description: app.config.description,
          author: getAuthor(app.config),
          npmUrl:
            'https://github.com/SignalK/signalk-server-node/blob/master/CHANGELOG.md',
          isPlugin: false,
          isWebapp: false
        }

        if (moduleInstallQueue.find(p => p.name === info.name)) {
          info.isWaiting = true
          all.installing.push(info)
        } else if (modulesInstalledSinceStartup[info.name]) {
          if (moduleInstalling && moduleInstalling.name === info.name) {
            info.isInstalling = true
          } else if (modulesInstalledSinceStartup[info.name].code !== 0) {
            info.installFailed = true
          }
          all.installing.push(info)
        }
      }
    } else {
      all.canUpdateServer = false
    }

    getModulesInfo(plugins, getPlugin, all)
    getModulesInfo(webapps, getWebApp, all)
    return all
  }

  function getModulesInfo (modules, existing, result) {
    modules.forEach(plugin => {
      const name = plugin.package.name
      const version = plugin.package.version

      const pluginInfo = {
        name: name,
        version: version,
        description: plugin.package.description,
        author: getAuthor(plugin.package),
        npmUrl: getNpmUrl(plugin),
        isPlugin: plugin.package.keywords.some(
          v => v === 'signalk-node-server-plugin'
        ),
        isWebapp: plugin.package.keywords.some(v => v === 'signalk-webapp')
      }

      const installedModule = existing(name)

      if (installedModule) {
        pluginInfo.installedVersion = installedModule.version
      }

      if (moduleInstallQueue.find(p => p.name === name)) {
        pluginInfo.isWaiting = true
        addIfNotDuplicate(result.installing, pluginInfo)
      } else if (modulesInstalledSinceStartup[name]) {
        if (moduleInstalling && moduleInstalling.name === name) {
          pluginInfo.isInstalling = true
        } else if (modulesInstalledSinceStartup[name].code !== 0) {
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

  function getAuthor (_package) {
    debug(_package.name + ' author: ' + _package.author)
    return (
      (_package.author && (_package.author.name || _package.author.email)) +
      '' +
      (_package.contributors || [])
        .map(contributor => contributor.name || contributor.email)
        .join(',') +
      '' +
      (_package.name.startsWith('@signalk/') ? ' (Signal K team)' : '')
    )
  }

  function getNpmUrl (moduleInfo) {
    const npm = _.get(moduleInfo.package, 'links.npm')
    return npm || null
  }

  function sendAppStoreChangedEvent () {
    findPluginsAndWebapps().then(([plugins, webapps]) => {
      getLatestServerVersion().then(serverVersion => {
        const result = getAllModuleInfo(plugins, webapps, serverVersion)
        app.emit('serverevent', {
          type: 'APP_STORE_CHANGED',
          from: 'signalk-server',
          data: result
        })
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
          const next = moduleInstallQueue.splice(0, 1)[0]
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
