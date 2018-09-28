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
const fs = require('fs')
const compareVersions = require('compare-versions')
const path = require('path')
const installModule = require('../modules').installModule
const findModulesWithKeyword = require('../modules').findModulesWithKeyword
const page = require('../page')

module.exports = function(app) {
  let moduleInstalling = undefined
  const modulesInstalledSinceStartup = {}
  const moduleInstallQueue = []

  return {
    start: function() {
      app.get('/appstore/output/:id/:version', (req, res) => {
        let { result, footer } = page(path.join(__dirname, '/appstore.html'))

        result += '<h2>Errors installing ' + req.params.id + '</h2>'
        result += '<pre>'
        result += modulesInstalledSinceStartup[req.params.id].output
        result += '</pre>'
        result +=
          '<a href="/appstore/install/' +
          req.params.id +
          '/' +
          req.params.version +
          '"><button type="button" class="btn">Retry</button></a> '
        result += footer
        res.send(result)
      })

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
            const result = getAllModuleInfo(plugins, webapps)
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

      app.get('/appstore/', (req, res) => {
        let { result, footer } = page(path.join(__dirname, '/appstore.html'))

        findPluginsAndWebapps()
          .then(([plugins, webapps]) => {
            if (Object.keys(modulesInstalledSinceStartup).length) {
              result += '<p class="text-warning">Server '
              if (
                moduleInstallQueue.length > 0 ||
                moduleInstalling ||
                !app.securityStrategy.isDummy()
              ) {
                result += 'restart'
              } else {
                result += '<a href="/restart">restart</a>'
              }
              result +=
                ' is required to finish install or update of plugins and web apps.</p>\n'
            }

            result += makeSection(
              'Plugins',
              plugins,
              getPlugin,
              '/plugins/configure/#'
            )
            result += makeSection('Web Apps', webapps, getWebApp, '')

            if (moduleInstalling) {
              result +=
                '<script>setTimeout(function(){ window.location.reload(1);}, 2000)</script>'
            }

            result += footer
            res.send(result)
          })
          .catch(error => {
            console.error(error.message)
            console.error(error.stack)
            res.status(500)
            res.send('<pre>' + error.message + '</pre>')
          })
      })
    },
    stop: function() {}
  }

  function findPluginsAndWebapps() {
    return Promise.all([
      findModulesWithKeyword('signalk-node-server-plugin'),
      findModulesWithKeyword('signalk-webapp')
    ])
  }

  function getPlugin(id) {
    return app.plugins.find(plugin => plugin.packageName === id)
  }

  function getWebApp(id) {
    return app.webapps.find(webapp => webapp.name === id)
  }

  function getAllModuleInfo(plugins, webapps) {
    const all = {
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

  function getModulesInfo(modules, existing, result) {
    modules.forEach(plugin => {
      const name = plugin.package.name
      const version = plugin.package.version

      const pluginInfo = {
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

  function addIfNotDuplicate(theArray, moduleInfo) {
    if (!theArray.find(p => p.name === moduleInfo.name)) {
      theArray.push(moduleInfo)
    }
  }

  function makeSection(title, modules, existing, pathPrefix) {
    modules = modules.sort((left, right) => {
      if (pathPrefix + left.package.name < pathPrefix + right.package.name) {
        return -1
      } else if (
        pathPrefix + left.package.name >
        pathPrefix + right.package.name
      ) {
        return 1
      } else {
        return 0
      }
    })
    return `
    <h3>${title}</h3>
    <table class="table table-bordered">
      <tr>
        <th>Install</th>
        <th>Update</th>
        <th>Name</th>
        <th>Description</th>
        <th>Authors</th>
        <th>Link</th>
      </tr>
      ${makeRows(modules, existing, pathPrefix)}
    </table>
    `
  }

  function makeRows(modules, existing, pathPrefix) {
    return modules.reduce(function(result, moduleInfo) {
      const name = moduleInfo.package.name
      const version = moduleInfo.package.version

      const installedModule = existing(name)
      let isLink = false
      if (installedModule) {
        const stat = fs.lstatSync(
          path.join(__dirname, '../../node_modules/' + name)
        )
        isLink = stat.isSymbolicLink()
      }

      result += `
        <tr>
          <td>${getInstallColumn(name, version, installedModule, isLink)}</td>
          <td>${getUpdateColumn(name, version, installedModule, isLink)}</td>
          <td><b>${getNameColumn(name, installedModule, pathPrefix)}</b></td>
          <td>${moduleInfo.package.description}</td>
          <td>${getAuthorColumn(moduleInfo)}</td>
          <td>${getNpmColumn(moduleInfo)}</td>
        </tr>
      `
      return result
    }, '')
  }

  function getNameColumn(name, installedModule, pathPrefix) {
    return installedModule
      ? `<a href="${pathPrefix}${name}">${name}</a>`
      : `${name}`
  }

  function getAuthorColumn(moduleInfo) {
    debug(moduleInfo.package.name + ' author: ' + moduleInfo.package.author)
    return (
      (moduleInfo.package.author &&
        (moduleInfo.package.author.name || moduleInfo.package.author.email)) +
      '<i>' +
      (moduleInfo.package.contributors || [])
        .map(contributor => contributor.name || contributor.email)
        .join(',') +
      '</i>' +
      (moduleInfo.package.name.startsWith('@signalk/')
        ? ' (Signal K team)'
        : '')
    )
  }

  function getAuthor(moduleInfo) {
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

  function getNpmColumn(moduleInfo) {
    const npm = _.get(moduleInfo.package, 'links.npm')
    return npm ? '<a href="' + npm + '">npm</a>' : ''
  }

  function getNpmUrl(moduleInfo) {
    const npm = _.get(moduleInfo.package, 'links.npm')
    return npm || null
  }

  function getInstallColumn(name, version, installedModule, isLink) {
    let result = ''
    if (modulesInstalledSinceStartup[name]) {
      if (moduleInstalling && moduleInstalling.name === name) {
        result += `<p class="text-primary">Installing ${
          moduleInstalling.version
        }...</p>`
      } else if (modulesInstalledSinceStartup[name].code === 0) {
        result += `<p class="text-success"> Installed ${
          modulesInstalledSinceStartup[name].version
        }</p>`
      } else {
        result += `
          <a href="/appstore/output/${name}/${
          modulesInstalledSinceStartup[name].version
        }">
          <button type="button" class="btn-danger">Error</button>
          </a>`
      }
    } else if (moduleInstallQueue.find(p => p.name === name)) {
      result += '<p class="text-primary">Waiting...</p>'
    } else if (!installedModule) {
      result += `<a href="/appstore/install/${name}/${version}"><button type="button" class="btn">Install ${version}</button></a>`
    } else {
      result += `${installedModule.version} Installed`
      if (isLink) {
        result += '<p class="text-danger">(Linked)' + '</p>'
      }
    }
    return result
  }

  function getUpdateColumn(name, version, installedModule, isLink) {
    let result = ''
    if (!modulesInstalledSinceStartup[name]) {
      if (installedModule) {
        const compared = compareVersions(version, installedModule.version)
        if (compared > 0) {
          if (!isLink) {
            result += `
            <a href="/appstore/install/${name}/${version}">
            <button type="button" class="btn">Update to ${version}</button>
            </a>`
          } else {
            result += version
          }
        } else if (compared < 0) {
          result += 'Newer Installed'
        } else {
          result += 'Latest Installed'
        }
      }
    }
    return result
  }

  function sendAppStoreChangedEvent() {
    findPluginsAndWebapps().then(([plugins, webapps]) => {
      const result = getAllModuleInfo(plugins, webapps)
      app.emit('serverevent', {
        type: 'APP_STORE_CHANGED',
        from: 'signalk-server',
        data: result
      })
    })
  }

  function installSKModule(module, version) {
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

function packageNameIs(name) {
  return x => x.package.name === name
}
