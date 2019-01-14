/*
 * Copyright 2017 Teppo Kurki <teppo.kurki@iki.fi>
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

const fs = require('fs')
const spawn = require('child_process').spawn
const debug = require('debug')('signalk:modules')
const fetch = require('node-fetch')
const path = require('path')
const _ = require('lodash')
const semver = require('semver')

function findModulesInDir (dir, keyword) {
  // If no directory by name return empty array.
  if (!fs.existsSync(dir)) return []
  debug('findModulesInDir: ' + dir)
  return fs
    .readdirSync(dir)
    .filter(name => name != '.bin')
    .reduce((result, filename) => {
      if (filename.indexOf('@') === 0) {
        return result.concat(
          findModulesInDir(dir + filename + '/', keyword).map(entry => {
            return {
              module: entry.module,
              metadata: entry.metadata,
              location: dir
            }
          })
        )
      } else {
        let metadata
        try {
          metadata = require(dir + filename + '/package.json')
        } catch (err) {
          debug(err)
        }
        if (
          metadata &&
          metadata.keywords &&
          metadata.keywords.includes(keyword)
        ) {
          result.push({
            module: metadata.name,
            metadata: metadata,
            location: dir
          })
        }
      }
      return result
    }, [])
}

// Extract unique directory paths from app object.
function getModulePaths (app) {
  // appPath is the app working directory.
  const { appPath, configPath } = app.config
  return (appPath === configPath ? [appPath] : [configPath, appPath]).map(
    pathOption => path.join(pathOption, 'node_modules/')
  )
}

const getModuleSortName = x => (x.module || '').replace('@signalk', ' ')

// Sort handler that puts strings with '@signalk' first.
const priorityPrefix = (a, b) =>
  getModuleSortName(a).localeCompare(getModuleSortName(b))

// Searches for installed modules that contain `keyword`.
function modulesWithKeyword (app, keyword) {
  return _.uniqBy(
    // _.flatten since values are inside an array. [[modules...], [modules...]]
    _.flatten(
      getModulePaths(app).map(pathOption =>
        findModulesInDir(pathOption, keyword)
      )
    ),
    moduleData => moduleData.module
  ).sort(priorityPrefix)
}

function installModule (app, name, version, onData, onErr, onClose) {
  debug('installing: ' + name + ' ' + version)
  var npm

  var opts = {}

  if (name == app.config.name) {
    if (process.platform == 'win32') {
      npm = spawn(
        'cmd',
        ['/c', 'npm install -g --unsafe-perm ' + `${name}@${version}`],
        opts
      )
    } else {
      npm = spawn(
        'sudo',
        ['npm', 'install', '-g', '--unsafe-perm', `${name}@${version}`],
        opts
      )
    }
  } else {
    opts.cwd = app.config.configPath

    if (process.platform == 'win32') {
      npm = spawn(
        'cmd',
        ['/c', 'npm --save install ' + `${name}@${version}`],
        opts
      )
    } else {
      npm = spawn('npm', ['--save', 'install', `${name}@${version}`], opts)
    }
  }

  npm.stdout.on('data', onData)
  npm.stderr.on('data', onErr)
  npm.on('close', onClose)
  npm.on('error', err => {
    onErr(err)
    onClose(-1)
  })
}

function findModulesWithKeyword (keyword) {
  return new Promise((resolve, reject) => {
    Promise.all([
      fetch('https://api.npms.io/v2/search?size=250&q=keywords:' + keyword),
      fetch(
        'http://registry.npmjs.org/-/v1/search?size=250&text=keywords:' +
          keyword
      )
    ])
      .then(([npmsio_results, npmjs_results]) => {
        return Promise.all([npmsio_results.json(), npmjs_results.json()])
      })
      .then(([npmsio_json, npmjs_json]) => {
        const merged = npmsio_json.results.reduce((acc, module) => {
          acc[module.package.name] = module
          return acc
        }, {})
        npmjs_json.objects.reduce((acc, module) => {
          const name = module.package.name
          if (
            !acc[name] ||
            semver.gt(module.package.version, acc[name].package.version)
          ) {
            acc[name] = module
          }
          return acc
        }, merged)
        resolve(_.values(merged))
      })
      .catch(reject)
  })
}

function getLatestServerVersion () {
  return new Promise((resolve, reject) => {
    Promise.all([
      fetch('https://api.npms.io/v2/package/signalk-server'),
      fetch('http://registry.npmjs.org/-/package/signalk-server/dist-tags')
    ])
      .then(([npmsio_results, npmjs_results]) => {
        return Promise.all([npmsio_results.json(), npmjs_results.json()])
      })
      .then(([npmsio_json, npmjs_json]) => {
        const npmsioVersion = npmsio_json.collected.metadata.version
        const npmjsVersion = npmjs_json.latest
        const version = semver.gt(npmsioVersion, npmjsVersion)
          ? npmsioVersion
          : npmjsVersion
        resolve(version)
      })
      .catch(reject)
  })
}

module.exports = {
  modulesWithKeyword: modulesWithKeyword,
  installModule: installModule,
  findModulesWithKeyword: findModulesWithKeyword,
  getLatestServerVersion: getLatestServerVersion
}
