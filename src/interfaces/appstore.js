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

import { createDebug } from '../debug'
const debug = createDebug('signalk-server:interfaces:appstore')
const _ = require('lodash')
const semver = require('semver')
const { gt } = semver
const { installModule, removeModule, getPluginDataSize } = require('../modules')
const {
  isTheServerModule,
  findModulesWithKeyword,
  fetchDistTagsForPackages,
  getLatestServerVersion,
  getAuthor,
  getKeywords
} = require('../modules')
const { SERVERROUTESPREFIX } = require('../constants')
const { getCategories, getAvailableCategories } = require('../categories')

const bundledAdminUIs = ['@signalk/server-admin-ui']

const npmServerInstallLocations = [
  '/usr/bin/signalk-server',
  '/usr/lib/node_modules/signalk-server/bin/signalk-server',
  '/usr/local/bin/signalk-server',
  '/usr/local/lib/node_modules/signalk-server/bin/signalk-server'
]

module.exports = function (app) {
  let moduleInstalling
  const modulesInstalledSinceStartup = {}
  const moduleInstallQueue = []

  return {
    start: function () {
      app.post(
        [
          `${SERVERROUTESPREFIX}/appstore/install/:name/:version`,
          `${SERVERROUTESPREFIX}/appstore/install/:org/:name/:version`
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
                !isTheServerModule(name, app.config) &&
                !plugins.find(packageNameIs(name)) &&
                !webapps.find(packageNameIs(name))
              ) {
                res.status(404)
                res.json('No such webapp or plugin available:' + name)
              } else {
                if (moduleInstalling) {
                  moduleInstallQueue.push({ name: name, version: version })
                  sendAppStoreChangedEvent()
                } else {
                  installSKModule(name, version)
                }
                res.json(`Installing ${name}...`)
              }
            })
            .catch((error) => {
              console.log(error.message)
              debug(error.stack)
              res.status(500)
              res.json(error.message)
            })
        }
      )

      app.post(
        [
          `${SERVERROUTESPREFIX}/appstore/remove/:name`,
          `${SERVERROUTESPREFIX}/appstore/remove/:org/:name`
        ],
        (req, res) => {
          let name = req.params.name

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
                res.json('No such webapp or plugin available:' + name)
              } else {
                const deleteData = req.body && req.body.deleteData === true
                if (moduleInstalling) {
                  moduleInstallQueue.push({
                    name: name,
                    isRemove: true,
                    deleteData: deleteData
                  })
                  sendAppStoreChangedEvent()
                } else {
                  removeSKModule(name, deleteData)
                }
                res.json(`Removing ${name}...`)
              }
            })
            .catch((error) => {
              console.log(error.message)
              debug(error.stack)
              res.status(500)
              res.json(error.message)
            })
        }
      )

      app.get(
        [
          `${SERVERROUTESPREFIX}/appstore/datasize/:name`,
          `${SERVERROUTESPREFIX}/appstore/datasize/:org/:name`
        ],
        async (req, res) => {
          let name = req.params.name
          if (req.params.org) {
            name = req.params.org + '/' + name
          }
          const plugin = getPlugin(name)
          const pluginId = plugin ? plugin.id : undefined
          if (!pluginId) {
            res.json({ totalBytes: 0, fileCount: 0, hasData: false })
            return
          }
          try {
            const dataSize = await getPluginDataSize(
              app.config.configPath,
              pluginId
            )
            res.json(dataSize)
          } catch (error) {
            console.error('Failed to get plugin data size:', error)
            res.json({ totalBytes: 0, fileCount: 0, hasData: false })
          }
        }
      )

      app.get(`${SERVERROUTESPREFIX}/appstore/available/`, (req, res) => {
        const installedNames = getInstalledPackageNames()
        let storeAvailable = true

        Promise.all([
          findPluginsAndWebapps().catch((err) => {
            console.error(`findPluginsAndWebapps failed: ${err.message}`)
            debug(err.stack)
            storeAvailable = false
            return [
              getInstalledAsPackageEntries('signalk-node-server-plugin'),
              getInstalledAsPackageEntries('signalk-webapp')
            ]
          }),
          getLatestServerVersion(app.config.version).catch(() => '0.0.0'),
          fetchDistTagsForPackages(installedNames).catch(() => ({}))
        ])
          .then(([[plugins, webapps], serverVersion, distTagsMap]) => {
            const result = getAllModuleInfo(
              plugins,
              webapps,
              serverVersion,
              distTagsMap
            )
            result.storeAvailable = storeAvailable
            if (!storeAvailable) {
              result.available = []
              result.updates = []
            }
            return result
          })
          .then((result) => res.json(result))
          .catch((error) => {
            console.log(error.message)
            debug(error.stack)
            res.json(emptyAppStoreInfo(false))
          })
      })
    },
    stop: () => undefined
  }

  function findPluginsAndWebapps() {
    return Promise.all([
      findModulesWithKeyword('signalk-node-server-plugin'),
      findModulesWithKeyword('signalk-embeddable-webapp'),
      findModulesWithKeyword('signalk-webapp')
    ]).then(([plugins, embeddableWebapps, webapps]) => {
      const allWebapps = []
        .concat(embeddableWebapps)
        .concat(webapps)
        .filter((m) => !bundledAdminUIs.includes(m.package.name))
      return [
        plugins,
        _.uniqBy(allWebapps, (plugin) => {
          return plugin.package.name
        })
      ]
    })
  }

  function getInstalledAsPackageEntries(keyword) {
    const sources =
      keyword === 'signalk-node-server-plugin'
        ? [{ entries: app.plugins || [], fallbackKeyword: keyword }]
        : [
            { entries: app.webapps || [], fallbackKeyword: 'signalk-webapp' },
            { entries: app.addons || [], fallbackKeyword: 'signalk-webapp' },
            {
              entries: app.embeddablewebapps || [],
              fallbackKeyword: 'signalk-embeddable-webapp'
            }
          ]
    const seen = new Set()
    const entries = []
    for (const { entries: sourceEntries, fallbackKeyword } of sources) {
      for (const installed of sourceEntries) {
        const name = installed.packageName || installed.name
        if (!name || seen.has(name)) continue
        seen.add(name)
        const authorName =
          typeof installed.author === 'string'
            ? installed.author
            : installed.author && installed.author.name
        entries.push({
          package: {
            name,
            version: installed.version,
            description: installed.description,
            keywords: installed.keywords || [fallbackKeyword],
            publisher:
              installed.publisher ||
              (authorName ? { username: authorName } : { username: '' }),
            date: installed.date,
            links: installed.links || {}
          }
        })
      }
    }
    return entries
  }

  function getInstalledPackageNames() {
    return [
      ...new Set(
        [
          ...(app.plugins || []).map((p) => p.packageName),
          ...(app.webapps || []).map((w) => w.name),
          ...(app.addons || []).map((a) => a.name),
          ...(app.embeddablewebapps || []).map((e) => e.name)
        ].filter(Boolean)
      )
    ]
  }

  function getPlugin(id) {
    return app.plugins.find((plugin) => plugin.packageName === id)
  }

  function getWebApp(id) {
    return (
      (app.webapps && app.webapps.find((webapp) => webapp.name === id)) ||
      (app.addons && app.addons.find((webapp) => webapp.name === id)) ||
      (app.embeddablewebapps &&
        app.embeddablewebapps.find((webapp) => webapp.name === id))
    )
  }

  function emptyAppStoreInfo(storeAvailable = true) {
    return {
      available: [],
      installed: [],
      updates: [],
      installing: [],
      categories: getAvailableCategories(),
      storeAvailable: storeAvailable,
      isInDocker: process.env.IS_IN_DOCKER === 'true'
    }
  }

  function getAllModuleInfo(plugins, webapps, serverVersion, distTagsMap = {}) {
    const all = emptyAppStoreInfo()

    if (
      process.argv.length > 1 &&
      (npmServerInstallLocations.includes(process.argv[1]) ||
        process.env.SIGNALK_SERVER_IS_UPDATABLE) &&
      !process.env.SIGNALK_DISABLE_SERVER_UPDATES
    ) {
      all.canUpdateServer = !all.isInDocker && true
      if (gt(serverVersion, app.config.version)) {
        all.serverUpdate = serverVersion

        const info = {
          name: app.config.name,
          version: serverVersion,
          description: app.config.description,
          author: getAuthor(app.config),
          npmUrl: null,
          isPlugin: false,
          isWebapp: false
        }

        if (moduleInstallQueue.find((p) => p.name === info.name)) {
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

    getModulesInfo(plugins, getPlugin, all, distTagsMap)
    getModulesInfo(webapps, getWebApp, all, distTagsMap)

    if (process.env.PLUGINS_WITH_UPDATE_DISABLED) {
      const disabled = process.env.PLUGINS_WITH_UPDATE_DISABLED.split(',')
      all.updates.forEach((info) => {
        if (disabled.includes(info.name)) {
          info.updateDisabled = true
        }
      })
    }

    return all
  }

  function getModulesInfo(modules, existing, result, distTagsMap) {
    modules.forEach((plugin) => {
      const name = plugin.package.name
      const version = plugin.package.version

      if (!semver.valid(version)) {
        console.warn(
          `Skipping ${name}: invalid semver version '${version}'. ` +
            `Please inform the plugin developer to publish a valid semver version.`
        )
        return
      }

      const pluginInfo = {
        name: name,
        version: version,
        description: plugin.package.description,
        author: getAuthor(plugin.package),
        categories: getCategories(plugin.package),
        updated: plugin.package.date,
        keywords: getKeywords(plugin.package),
        npmUrl: getNpmUrl(plugin),
        isPlugin: plugin.package.keywords.some(
          (v) => v === 'signalk-node-server-plugin'
        ),
        isWebapp: plugin.package.keywords.some((v) => v === 'signalk-webapp'),
        isEmbeddableWebapp: plugin.package.keywords.some(
          (v) => v === 'signalk-embeddable-webapp'
        )
      }

      const tags = distTagsMap[name]
      if (tags) {
        let highest = null
        for (const [tag, tagVersion] of Object.entries(tags)) {
          if (tag === 'latest') continue
          const parsed = semver.parse(tagVersion)
          if (
            parsed &&
            parsed.prerelease.length > 0 &&
            semver.gt(
              `${parsed.major}.${parsed.minor}.${parsed.patch}`,
              version
            )
          ) {
            if (!highest || semver.gt(tagVersion, highest)) {
              highest = tagVersion
            }
          }
        }
        if (highest) {
          pluginInfo.prereleaseVersion = highest
        }
      }

      const installedModule = existing(name)

      if (installedModule) {
        pluginInfo.id = installedModule.id
        pluginInfo.installedVersion = installedModule.version
      }

      if (moduleInstallQueue.find((p) => p.name === name)) {
        pluginInfo.isWaiting = true
        addIfNotDuplicate(result.installing, pluginInfo)
      } else if (modulesInstalledSinceStartup[name]) {
        if (moduleInstalling && moduleInstalling.name === name) {
          if (moduleInstalling.isRemove) {
            pluginInfo.isRemoving = true
          } else {
            pluginInfo.isInstalling = true
          }
        } else if (modulesInstalledSinceStartup[name].code !== 0) {
          pluginInfo.installFailed = true
          addIfNotDuplicate(result.available, pluginInfo)
        }
        pluginInfo.isRemove = modulesInstalledSinceStartup[name].isRemove
        addIfNotDuplicate(result.installing, pluginInfo)
      } else if (installedModule) {
        if (
          semver.valid(installedModule.version) &&
          gt(version, installedModule.version)
        ) {
          addIfNotDuplicate(result.updates, pluginInfo)
        } else if (!semver.valid(installedModule.version)) {
          console.warn(
            `Installed module ${name} has invalid semver version '${installedModule.version}'. ` +
              `Please inform the plugin developer.`
          )
        }
        addIfNotDuplicate(result.installed, pluginInfo)
      }
      addIfNotDuplicate(result.available, pluginInfo)

      return result
    })
  }

  function addIfNotDuplicate(theArray, moduleInfo) {
    if (!theArray.find((p) => p.name === moduleInfo.name)) {
      theArray.push(moduleInfo)
    }
  }

  function getNpmUrl(moduleInfo) {
    const npm = _.get(moduleInfo.package, 'links.npm')
    return npm || null
  }

  function sendAppStoreChangedEvent() {
    findPluginsAndWebapps().then(([plugins, webapps]) => {
      getLatestServerVersion(app.config.version)
        .then((serverVersion) =>
          getAllModuleInfo(plugins, webapps, serverVersion)
        )
        .then((result) => {
          app.emit('serverevent', {
            type: 'APP_STORE_CHANGED',
            from: 'signalk-server',
            data: result
          })
        })
    })
  }

  function installSKModule(module, version) {
    if (isTheServerModule(module, app.config)) {
      try {
        app.providers.forEach((providerHolder) => {
          if (
            typeof providerHolder.pipeElements[0].pipeline[0].options
              .filename !== 'undefined'
          ) {
            debug('close file connection:', providerHolder.id)
            providerHolder.pipeElements[0].end()
          }
        })
      } catch (err) {
        debug(err)
      }
    }
    updateSKModule(module, version, false)
  }

  function removeSKModule(module, deleteData) {
    const plugin = getPlugin(module)
    const pluginId = plugin ? plugin.id : undefined
    updateSKModule(module, null, true, pluginId, deleteData)
  }

  function updateSKModule(module, version, isRemove, pluginId, deleteData) {
    moduleInstalling = {
      name: module,
      output: [],
      version: version,
      isRemove: isRemove
    }
    modulesInstalledSinceStartup[module] = moduleInstalling

    sendAppStoreChangedEvent()

    const onData = (output) => {
      modulesInstalledSinceStartup[module].output.push(output)
      console.log(`stdout: ${output}`)
    }
    const onErr = (output) => {
      modulesInstalledSinceStartup[module].output.push(output)
      console.error(`stderr: ${output}`)
    }
    const onClose = (code) => {
      debug('close: ' + module)
      modulesInstalledSinceStartup[module].code = code
      moduleInstalling = undefined
      debug(`child process exited with code ${code}`)

      if (isRemove && pluginId) {
        delete app.providerStatus[pluginId]
      }

      if (moduleInstallQueue.length) {
        const next = moduleInstallQueue.splice(0, 1)[0]
        if (next.isRemove) {
          removeSKModule(next.name, next.deleteData)
        } else {
          installSKModule(next.name, next.version)
        }
      }

      sendAppStoreChangedEvent()
    }

    if (isRemove) {
      removeModule(
        app.config,
        module,
        version,
        onData,
        onErr,
        onClose,
        pluginId,
        deleteData
      )
    } else {
      installModule(app.config, module, version, onData, onErr, onClose)
    }
  }
}

function packageNameIs(name) {
  return (x) => x.package.name === name
}
