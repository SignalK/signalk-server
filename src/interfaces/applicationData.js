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
const debug = require('debug')('signalk-server:interfaces:applicationData')
const fs = require('fs')
const path = require('path')
const jsonpatch = require('json-patch')
const semver = require('semver')

const prefix = '/signalk/v1/applicationData'

const applicationDataUrls = [
  `${prefix}/global/:appid/:version/*`,
  `${prefix}/global/:appid/:version`
]

const userApplicationDataUrls = [
  `${prefix}/user/:appid/:version/*`,
  `${prefix}/user/:appid/:version`
]

module.exports = function(app) {
  if (app.securityStrategy.isDummy()) {
    debug('ApplicationData disabled because security is off')
    return
  }

  applicationDataUrls.forEach(url => {
    app.securityStrategy.addAdminWriteMiddleware(url)
  })

  userApplicationDataUrls.forEach(url => {
    app.securityStrategy.addWriteMiddleware(url)
  })

  app.get(userApplicationDataUrls, (req, res) => {
    getApplicationData(req, res, true)
  })

  app.post(userApplicationDataUrls, (req, res) => {
    postApplicationData(req, res, true)
  })

  app.get(applicationDataUrls, (req, res) => {
    getApplicationData(req, res, false)
  })

  app.post(applicationDataUrls, (req, res) => {
    postApplicationData(req, res, false)
  })

  app.get(`${prefix}/global/:appid`, (req, res) => {
    listVersions(req, res, false)
  })

  app.get(`${prefix}/user/:appid`, (req, res) => {
    listVersions(req, res, true)
  })

  function listVersions(req, res, isUser) {
    const appid = validateAppId(req.params.appid)

    if (!appid) {
      res.status(400).send('invalid application id')
      return
    }

    const dir = dirForApplicationData(req, appid, isUser)

    if (!fs.existsSync(dir)) {
      res.sendStatus(404)
      return
    }

    res.json(fs.readdirSync(dir).map(file => file.slice(0, -5)))
  }

  function getApplicationData(req, res, isUser) {
    const appid = validateAppId(req.params.appid)
    const version = validateVersion(req.params.version)

    if (!appid) {
      res.status(400).send('invalid application id')
      return
    }

    if (!version) {
      res.status(400).send('invalid application version')
      return
    }

    let applicationData = readApplicationData(req, appid, version, isUser)

    let data = applicationData
    if (req.params[0] && req.params[0].length !== 0) {
      data = _.get(applicationData, req.params[0].replace(/\//g, '.'))

      if (!data) {
        res.status(404).send()
        return
      }
    }

    if (req.query.keys === 'true') {
      if (typeof data !== 'object') {
        res.status(404).send()
        return
      }

      data = _.keys(data)
    }

    res.json(data)
  }

  function postApplicationData(req, res, isUser) {
    const appid = validateAppId(req.params.appid)
    const version = validateVersion(req.params.version)

    if (!appid) {
      res.status(400).send('invalid application id')
      return
    }

    if (!version) {
      res.status(400).send('invalid application version')
      return
    }

    let applicationData = readApplicationData(req, appid, version, isUser)

    if (req.params[0] && req.params[0].length !== 0) {
      _.set(applicationData, req.params[0].replace(/\//g, '.'), req.body)
    } else if (_.isArray(req.body)) {
      jsonpatch.apply(applicationData, req.body)
    } else {
      applicationData = req.body
    }

    saveApplicationData(req, appid, version, isUser, applicationData, err => {
      if (err) {
        console.log(err)
        res.status(500).send(err.message)
      } else {
        res.send()
      }
    })
  }

  function readApplicationData(req, appid, version, isUser) {
    let applicationDataString = '{}'
    try {
      applicationDataString = fs.readFileSync(
        pathForApplicationData(req, appid, version, isUser),
        'utf8'
      )
    } catch (e) {
      debug('Could not find applicationData for %s %s', appid, version)
    }
    try {
      const applicationData = JSON.parse(applicationDataString)
      return applicationData
    } catch (e) {
      console.error('Could not parse applicationData:' + e.message)
      return {}
    }
  }

  function validateAppId(appid) {
    return appid.length < 30 && appid.indexOf('/') === -1 ? appid : null
  }

  function validateVersion(version) {
    return semver.valid(semver.coerce(version))
  }

  function dirForApplicationData(req, appid, isUser) {
    let location = path.join(
      app.config.configPath,
      'applicationData',
      isUser ? `users/${req.skPrincipal.identifier}` : 'global'
    )

    return path.join(location, appid)
  }

  function pathForApplicationData(req, appid, version, isUser) {
    return path.join(
      dirForApplicationData(req, appid, isUser),
      `${version}.json`
    )
  }

  function saveApplicationData(req, appid, version, isUser, data, callback) {
    const applicationDataDir = path.join(
      app.config.configPath,
      'applicationData'
    )
    const usersDir = path.join(applicationDataDir, 'users')
    const globalDir = path.join(applicationDataDir, 'global')

    try {
      if (!fs.existsSync(applicationDataDir)) {
        fs.mkdirSync(applicationDataDir)
      }

      if (isUser) {
        if (!fs.existsSync(usersDir)) {
          fs.mkdirSync(usersDir)
        }
        const userDir = path.join(usersDir, req.skPrincipal.identifier)
        if (!fs.existsSync(userDir)) {
          fs.mkdirSync(userDir)
        }
        const appDir = path.join(userDir, appid)
        if (!fs.existsSync(appDir)) {
          fs.mkdirSync(appDir)
        }
      } else {
        if (!fs.existsSync(globalDir)) {
          fs.mkdirSync(globalDir)
        }
        const appDir = path.join(globalDir, appid)
        if (!fs.existsSync(appDir)) {
          fs.mkdirSync(appDir)
        }
      }
    } catch (err) {
      callback(err)
      return
    }

    const config = JSON.parse(JSON.stringify(data))
    fs.writeFile(
      pathForApplicationData(req, appid, version, isUser),
      JSON.stringify(data, null, 2),
      callback
    )
  }
}
