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

const applicationDataUrls = [
  '/signalk/v1/applicationData/global/:appid/:version/*',
  '/signalk/v1/applicationData/global/:appid/:version'
]

const userApplicationDataUrls = [
  '/signalk/v1/applicationData/user/:appid/:version/*',
  '/signalk/v1/applicationData/user/:appid/:version'
]

module.exports = function (app) {
  if (app.securityStrategy.isDummy()) {
    debug('ApplicationData disabled because security is off')
    return
  }

  app.securityStrategy.addAdminWriteMiddleware(applicationDataUrls[0])
  app.securityStrategy.addAdminWriteMiddleware(applicationDataUrls[1])

  app.securityStrategy.addWriteMiddleware(userApplicationDataUrls[0])
  app.securityStrategy.addWriteMiddleware(userApplicationDataUrls[1])

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

  function getApplicationData (req, res, isUser) {
    let applicationData = readApplicationData(
      req,
      req.params.appid,
      req.params.version,
      isUser
    )

    let data = applicationData
    if (req.params[0] && req.params[0].length != 0) {
      data = _.get(applicationData, req.params[0].replace(/\//g, '.'))

      if (!data) {
        res.status(404).send()
        return
      }
    }

    if ( req.query.keys === 'true' ) {
      if ( typeof data !== 'object' ) {
        res.status(404).send()
        return
      }

      data = _.keys(data)
    }

    res.json(data)
  }

  function postApplicationData (req, res, isUser) {
    let applicationData = readApplicationData(
      req,
      req.params.appid,
      req.params.version,
      isUser
    )

    if (req.params[0] && req.params[0].length != 0) {
      _.set(applicationData, req.params[0].replace(/\//g, '.'), req.body)
    } else if (_.isArray(req.body)) {
      jsonpatch.apply(applicationData, req.body)
    } else {
      applicationData = req.body
    }

    saveApplicationData(
      req,
      req.params.appid,
      req.params.version,
      isUser,
      applicationData,
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

  function readApplicationData (req, appid, version, isUser) {
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
      console.error(
        'Could not parse applicationData:' + e.message
      )
      return {}
    }
  }

  function pathForApplicationData (req, appid, version, isUser) {
    let location = path.join(
      app.config.configPath,
      'applicationData',
      isUser ? req.skPrincipal.identifier : 'global'
    )

    return path.join(location, `${appid}-${version}.json`)
  }

  function saveApplicationData (req, appid, version, isUser, data, callback) {
    const applicationDataDir = path.join(
      app.config.configPath,
      'applicationData'
    )

    if (!fs.existsSync(applicationDataDir)) {
      fs.mkdirSync(applicationDataDir)
    }

    const subDir = isUser ? req.skPrincipal.identifier : 'global'

    const subPath = path.join(applicationDataDir, subDir)
    if (!fs.existsSync(subPath)) {
      fs.mkdirSync(subPath)
    }

    const config = JSON.parse(JSON.stringify(data))
    fs.writeFile(
      pathForApplicationData(req, appid, version, isUser),
      JSON.stringify(data, null, 2),
      callback
    )
  }
}
