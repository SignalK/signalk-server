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

import _ from 'lodash'
import { createDebug } from '../debug'
const debug = createDebug('signalk-server:interfaces:applicationData')
import fs from 'fs/promises'
import path from 'path'
import jsonpatch from 'json-patch'
import semver from 'semver'
import { ServerApp } from '../app'
import { Request, Response } from 'express'

const prefix = '/signalk/v1/applicationData'

const applicationDataUrls = [
  `${prefix}/global/:appid/:version/*`,
  `${prefix}/global/:appid/:version`
]

const userApplicationDataUrls = [
  `${prefix}/user/:appid/:version/*`,
  `${prefix}/user/:appid/:version`
]

module.exports = function (app: ServerApp) {
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

  app.get(userApplicationDataUrls, async (req, res) => {
    await getApplicationData(req, res, true)
  })

  app.post(userApplicationDataUrls, async (req, res) => {
    await postApplicationData(req, res, true)
  })

  app.get(applicationDataUrls, async (req, res) => {
    await getApplicationData(req, res, false)
  })

  app.post(applicationDataUrls, async (req, res) => {
    await postApplicationData(req, res, false)
  })

  app.get(`${prefix}/global/:appid`, async (req, res) => {
    await listVersions(req, res, false)
  })

  app.get(`${prefix}/user/:appid`, async (req, res) => {
    await listVersions(req, res, true)
  })

  async function listVersions(req: Request, res: Response, isUser: boolean) {
    const appid = validateAppId(req.params.appid)

    if (!appid) {
      res.status(400).send('invalid application id')
      return
    }

    const dir = dirForApplicationData(req, appid, isUser)

    try {
      const result = (await fs.readdir(dir)).map((file) => file.slice(0, -5))
      res.json(result)
    } catch (_) {
      res.sendStatus(404)
      return
    }
  }

  async function getApplicationData(
    req: Request,
    res: Response,
    isUser: boolean
  ) {
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

    const applicationData = await readApplicationData(
      req,
      appid,
      version,
      isUser
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

  async function postApplicationData(
    req: Request,
    res: Response,
    isUser: boolean
  ) {
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

    try {
      await saveApplicationData(req, appid, version, isUser, applicationData)
      res.json('ApplicationData saved')
    } catch (err) {
      console.log(err)
      res.status(500).send(err)
    }
  }

  async function readApplicationData(
    req: Request,
    appid: string,
    version: string,
    isUser: boolean
  ) {
    let applicationDataString = '{}'
    try {
      applicationDataString = await fs.readFile(
        pathForApplicationData(req, appid, version, isUser),
        'utf8'
      )
    } catch (_) {
      debug('Could not find applicationData for %s %s', appid, version)
    }
    try {
      return JSON.parse(applicationDataString)
    } catch (e) {
      console.error(`Could not parse applicationData: ${e}`)
      return {}
    }
  }

  function validateAppId(appid: string) {
    return appid.length < 30 && appid.indexOf('/') === -1 ? appid : null
  }

  function validateVersion(version: string) {
    return semver.valid(semver.coerce(version))
  }

  function dirForApplicationData(req: Request, appid: string, isUser: boolean) {
    const location = path.join(
      app.config.configPath,
      'applicationData',
      isUser ? `users/${req.skPrincipal.identifier}` : 'global'
    )

    return path.join(location, appid)
  }

  function pathForApplicationData(
    req: Request,
    appid: string,
    version: string,
    isUser: boolean
  ) {
    return path.join(
      dirForApplicationData(req, appid, isUser),
      `${version}.json`
    )
  }

  async function saveApplicationData(
    req: Request,
    appid: string,
    version: string,
    isUser: boolean,
    data: unknown
  ) {
    // Ensure directory exists
    await fs.mkdir(dirForApplicationData(req, appid, isUser), {
      recursive: true
    })

    await fs.writeFile(
      pathForApplicationData(req, appid, version, isUser),
      JSON.stringify(data, null, 2)
    )
  }
}
