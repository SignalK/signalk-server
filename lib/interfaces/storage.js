/*
 * Copyright 2018 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const _ = require('lodash')
const debug = require('debug')('signalk-server:interfaces:storage')
const fs = require('fs')
const path = require('path')
const jsonpatch = require('json-patch')

const storageUrls = [
  '/signalk/v1/storage/:appid/:version/*',
  '/signalk/v1/storage/:appid/:version'
]

const userStorageUrls = [
  '/signalk/v1/storage/user/:appid/:version/*',
  '/signalk/v1/storage/user/:appid/:version'
]

module.exports = function (app) {
  if (app.securityStrategy.isDummy()) {
    debug('storage disabled because security is off')
    return
  }

  app.get(userStorageUrls, (req, res) => {
    getStorage(req, res, true)
  })

  app.post(userStorageUrls, (req, res) => {
    postStorage(req, res, true)
  })

  app.get(storageUrls, (req, res) => {
    getStorage(req, res, false)
  })

  app.post(storageUrls, (req, res) => {
    postStorage(req, res, false)
  })

  function getStorage (req, res, isUser) {
    let storage = readStorage(req, req.params.appid, req.params.version, isUser)

    if (req.params[0] && req.params[0].length != 0) {
      storage = _.get(storage, req.params[0].replace('/', '.'))

      if (!storage) {
        res.status(404).send()
        return
      }
    }

    res.json(storage)
  }

  function postStorage (req, res, isUser) {
    let storage = readStorage(req, req.params.appid, req.params.version, isUser)

    if (req.params[0] && req.params[0].length != 0) {
      _.set(storage, req.params[0].replace('/', '.'), req.body)
    } else if (_.isArray(req.body)) {
      jsonpatch.apply(storage, req.body)
    } else {
      storage = req.body
    }

    saveStorage(
      req,
      req.params.appid,
      req.params.version,
      isUser,
      storage,
      err => {
        if (err) {
          console.log(err)
          res.status(500).send(err.message)
        } else {
          res.send()
        }
      }
    )
  }

  function readStorage (req, appid, version, isUser) {
    let storageString = '{}'
    try {
      storageString = fs.readFileSync(
        pathForStorage(req, appid, version, isUser),
        'utf8'
      )
    } catch (e) {
      debug('Could not find storage for %s %s', appid, version)
    }
    try {
      const storage = JSON.parse(storageString)
      return storage
    } catch (e) {
      console.error(
        'Could not parse storage:' + e.message + ' ' + optionsAsString
      )
      return {}
    }
  }

  function pathForStorage (req, appid, version, isUser) {
    let location = path.join(app.config.configPath, 'storage')

    if (isUser) {
      location = path.join(location, req.skUser.id)
    }

    return path.join(location, `${appid}-${version}.json`)
  }

  function saveStorage (req, appid, version, isUser, data, callback) {
    const storageDir = path.join(app.config.configPath, 'storage')

    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir)
    }

    if (isUser) {
      const userDir = path.join(storageDir, req.skUser.id)
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir)
      }
    }

    const config = JSON.parse(JSON.stringify(data))
    fs.writeFile(
      pathForStorage(req, appid, version, isUser),
      JSON.stringify(data, null, 2),
      callback
    )
  }
}
