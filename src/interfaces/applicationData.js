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
import { atomicWriteFile } from '../atomicWrite'
import { createDebug } from '../debug'
const debug = createDebug('signalk-server:interfaces:applicationData')
const fs = require('fs')
const path = require('path')
const jsonpatch = require('json-patch')
const semver = require('semver')

const prefix = '/signalk/v1/applicationData'

// Per-file write lock to prevent concurrent read-modify-write races
const writeLocks = new Map()
function withFileLock(filePath, fn) {
  const previous = writeLocks.get(filePath) || Promise.resolve()
  const done = previous.then(fn, fn)
  const cleanup = done.then(
    () => {},
    () => {}
  )
  writeLocks.set(filePath, cleanup)
  cleanup.then(() => {
    if (writeLocks.get(filePath) === cleanup) {
      writeLocks.delete(filePath)
    }
  })
  return done
}

const DANGEROUS_PATH_SEGMENTS = ['__proto__', 'constructor', 'prototype']

function isPrototypePollutionPath(pathString) {
  const segments = pathString.split(/[./]/)
  return segments.some((seg) => DANGEROUS_PATH_SEGMENTS.includes(seg))
}

function hasPrototypePollutionPatch(patches) {
  return patches.some(
    (patch) =>
      (patch.path && isPrototypePollutionPath(patch.path)) ||
      (patch.from && isPrototypePollutionPath(patch.from))
  )
}

const applicationDataUrls = [
  `${prefix}/global/:appid/:version/*`,
  `${prefix}/global/:appid/:version`
]

const userApplicationDataUrls = [
  `${prefix}/user/:appid/:version/*`,
  `${prefix}/user/:appid/:version`
]

const deviceApplicationDataUrls = [
  `${prefix}/device/:deviceId/:appid/:version/*`,
  `${prefix}/device/:deviceId/:appid/:version`
]

module.exports = function (app) {
  if (app.securityStrategy.isDummy()) {
    debug('ApplicationData disabled because security is off')

    app.post(userApplicationDataUrls, (req, res) => {
      res.status(405).send('security is not enabled')
    })

    app.post(applicationDataUrls, (req, res) => {
      res.status(405).send('security is not enabled')
    })

    return
  }

  applicationDataUrls.forEach((url) => {
    app.securityStrategy.addAdminWriteMiddleware(url)
  })

  userApplicationDataUrls.forEach((url) => {
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

  function deviceAuthMiddleware(req, res, next) {
    if (!req.skPrincipal) {
      res.status(401).send('Unauthorized')
      return
    }
    const isAdmin =
      req.skPrincipal.permissions === 'admin' ||
      req.skPrincipal.type === 'admin'
    const isOwnDevice = req.skPrincipal.identifier === req.params.deviceId
    if (!isAdmin && !isOwnDevice) {
      res.status(403).send('Forbidden')
      return
    }
    next()
  }

  deviceApplicationDataUrls.forEach((url) => {
    app.use(url, deviceAuthMiddleware)
  })

  app.get(deviceApplicationDataUrls, (req, res) => {
    getApplicationData(req, res, false, req.params.deviceId)
  })

  app.post(deviceApplicationDataUrls, (req, res) => {
    postApplicationData(req, res, false, req.params.deviceId)
  })

  app.get(
    `${prefix}/device/:deviceId/:appid`,
    deviceAuthMiddleware,
    (req, res) => {
      listVersions(req, res, false, req.params.deviceId)
    }
  )

  app.get(`${prefix}/global/:appid`, (req, res) => {
    listVersions(req, res, false)
  })

  app.get(`${prefix}/user/:appid`, (req, res) => {
    listVersions(req, res, true)
  })

  function listVersions(req, res, isUser, deviceId) {
    const appid = validateAppId(req.params.appid)

    if (!appid) {
      res.status(400).send('invalid application id')
      return
    }

    const dir = dirForApplicationData(req, appid, isUser, deviceId)

    if (!fs.existsSync(dir)) {
      res.sendStatus(404)
      return
    }

    res.json(fs.readdirSync(dir).map((file) => file.slice(0, -5)))
  }

  function getApplicationData(req, res, isUser, deviceId) {
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

    let applicationData = readApplicationData(
      req,
      appid,
      version,
      isUser,
      deviceId
    )

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

  async function postApplicationData(req, res, isUser, deviceId) {
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

    const filePath = pathForApplicationData(
      req,
      appid,
      version,
      isUser,
      deviceId
    )

    try {
      await withFileLock(filePath, async () => {
        let applicationData = readApplicationData(
          req,
          appid,
          version,
          isUser,
          deviceId
        )

        if (req.params[0] && req.params[0].length !== 0) {
          const dataPath = req.params[0].replace(/\//g, '.')
          if (isPrototypePollutionPath(dataPath)) {
            res.status(400).send('invalid path')
            return
          }
          _.set(applicationData, dataPath, req.body)
        } else if (_.isArray(req.body)) {
          if (hasPrototypePollutionPatch(req.body)) {
            res.status(400).send('invalid patch path')
            return
          }
          jsonpatch.apply(applicationData, req.body)
        } else {
          applicationData = req.body
        }

        await saveApplicationData(
          req,
          appid,
          version,
          isUser,
          applicationData,
          deviceId
        )
        // Emit event when user's unit preferences change
        if (isUser && appid === 'unitpreferences') {
          app.emit('unitpreferencesChanged', {
            type: 'user',
            username: req.skPrincipal.identifier
          })
        }
        res.json('ApplicationData saved')
      })
    } catch (err) {
      console.log(err)
      res.status(500).send(err.message)
    }
  }

  function readApplicationData(req, appid, version, isUser, deviceId) {
    let applicationDataString = '{}'
    try {
      applicationDataString = fs.readFileSync(
        pathForApplicationData(req, appid, version, isUser, deviceId),
        'utf8'
      )
    } catch (_) {
      debug('Could not find applicationData for %s %s', appid, version)
    }
    try {
      const applicationData = JSON.parse(applicationDataString)
      return applicationData
    } catch (e) {
      let filePath = dirForApplicationData(req, appid, isUser, deviceId)
      console.error(
        'Could not parse applicationData for "%s": %s',
        filePath,
        e.message
      )
      return {}
    }
  }

  function validateAppId(appid) {
    return appid.length < 30 &&
      appid.indexOf('/') === -1 &&
      appid.indexOf('\\') === -1
      ? appid
      : null
  }

  function validateVersion(version) {
    return semver.valid(semver.coerce(version))
  }

  function dirForApplicationData(req, appid, isUser, deviceId) {
    let scope
    if (deviceId) {
      scope = `devices/${deviceId}`
    } else if (isUser) {
      scope = `users/${req.skPrincipal.identifier}`
    } else {
      scope = 'global'
    }
    let location = path.join(app.config.configPath, 'applicationData', scope)

    return path.join(location, appid)
  }

  function pathForApplicationData(req, appid, version, isUser, deviceId) {
    const filePath = path.normalize(
      path.join(
        dirForApplicationData(req, appid, isUser, deviceId),
        `${version}.json`
      )
    )
    const configPath = path.resolve(app.config.configPath)
    const resolvedPath = path.resolve(filePath)

    if (!resolvedPath.startsWith(configPath)) {
      throw new Error('Invalid path: outside configuration directory')
    }

    return filePath
  }

  async function saveApplicationData(
    req,
    appid,
    version,
    isUser,
    data,
    deviceId
  ) {
    const applicationDataDir = path.join(
      app.config.configPath,
      'applicationData'
    )

    if (!fs.existsSync(applicationDataDir)) {
      fs.mkdirSync(applicationDataDir)
    }

    if (deviceId) {
      const devicesDir = path.join(applicationDataDir, 'devices')
      if (!fs.existsSync(devicesDir)) {
        fs.mkdirSync(devicesDir)
      }
      const deviceDir = path.join(devicesDir, deviceId)
      if (!fs.existsSync(deviceDir)) {
        fs.mkdirSync(deviceDir)
      }
      const appDir = path.join(deviceDir, appid)
      if (!fs.existsSync(appDir)) {
        fs.mkdirSync(appDir)
      }
    } else if (isUser) {
      const usersDir = path.join(applicationDataDir, 'users')
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
      const globalDir = path.join(applicationDataDir, 'global')
      if (!fs.existsSync(globalDir)) {
        fs.mkdirSync(globalDir)
      }
      const appDir = path.join(globalDir, appid)
      if (!fs.existsSync(appDir)) {
        fs.mkdirSync(appDir)
      }
    }

    await atomicWriteFile(
      pathForApplicationData(req, appid, version, isUser, deviceId),
      JSON.stringify(data, null, 2)
    )
  }
}
