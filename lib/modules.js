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

function modulesWithKeyword (keyword) {
  return findModulesInDir(__dirname + '/../node_modules/', keyword)
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
              module: filename + '/' + entry.module,
              metadata: entry.metadata
            }
          })
        )
      } else {
        let metadata
        try {
          metadata = require(dir + filename + '/package.json')
        } catch (err) {
          console.log(err)
        }
        if (
          metadata &&
          metadata.keywords &&
          metadata.keywords.includes(keyword)
        ) {
          result.push({ module: filename, metadata: metadata })
        }
      }
      return result
    }, [])
}

function installModule (name, version, onData, onErr, onClose) {
  debug('installing: ' + name + ' ' + version)
  var npm
  if (process.platform == 'win32') {
    npm = spawn('cmd', ['/c', 'npm --no-save install ' + name])
  } else npm = spawn('npm', ['--no-save', 'install', name])

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
    'http://registry.npmjs.org/-/v1/search?size=250&text=keywords:' + keyword
  )
    .end()
    .then(response => {
      return response.body.objects
    })
}

module.exports = {
  modulesWithKeyword: modulesWithKeyword,
  installModule: installModule,
  findModulesWithKeyword: findModulesWithKeyword
}
