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
const agent = require('superagent-promise')(require('superagent'), Promise)
const path = require('path')

const priorityPrefix = (a, b) =>
  a.module
    .replace('@signalk', ' ')
    .localeCompare(b.module.replace('@signalk', ' '))

function modulesWithKeyword (app, keyword) {
  const modules = new Set()
  function searchAddModules (searchPath) {
    debug('searchPath: ' + searchPath)
    const modulesPath = path.join(searchPath, 'node_modules/')
    if (fs.existsSync(modulesPath)) {
      findModulesInDir(modulesPath, keyword).forEach(m => modules.add(m))
    }
  }
  // look in configPath for modules
  if (app.config.configPath !== app.config.appPath) {
    searchAddModules(app.config.configPath)
  }
  // look in working directory for modules
  searchAddModules(app.config.appPath)
  return Array.from(modules).sort(priorityPrefix)
}

function findModulesInDir (dir, keyword) {
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

function installModule (app, name, version, onData, onErr, onClose) {
  debug('installing: ' + name + ' ' + version)
  var npm

  var opts = {}

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

  npm.stdout.on('data', onData)
  npm.stderr.on('data', onErr)
  npm.on('close', onClose)
  npm.on('error', err => {
    onErr(err)
    onClose(-1)
  })
}

function findModulesWithKeyword (keyword) {
  return agent(
    'GET',
    // 'http://registry.npmjs.org/-/v1/search?size=250&text=keywords:' + keyword
    'https://api.npms.io/v2/search?size=250&q=keywords:' + keyword
  )
    .end()
    .then(response => {
      // return response.body.objects
      return response.body.results
    })
}

module.exports = {
  modulesWithKeyword: modulesWithKeyword,
  installModule: installModule,
  findModulesWithKeyword: findModulesWithKeyword
}
