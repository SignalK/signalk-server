/*
 * Copyright 2018 Teppo Kurki <teppo.kurki@iki.fi>
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

const moment = require('moment')
const path = require('path')
const { getFullLogDir, listLogFiles } = require('@signalk/streams/logging')
import { SERVERROUTESPREFIX } from '../constants'

module.exports = function (app) {
  return {
    start: function () {
      mountApi(app)
    },
    stop: () => undefined
  }
}

function mountApi(app) {
  app.securityStrategy.addAdminMiddleware(`${SERVERROUTESPREFIX}/logfiles/`)
  app.get(`${SERVERROUTESPREFIX}/logfiles/`, function (req, res) {
    listLogFiles(app, (err, files) => {
      if (err) {
        console.error(err)
        res.status(500)
        res.json('Error reading logfiles list')
        return
      }
      res.json(files)
    })
  })
  app.get(`${SERVERROUTESPREFIX}/logfiles/:filename`, function (req, res) {
    // Decode URL-encoded characters first, then sanitize
    let filename = req.params.filename
    try {
      filename = decodeURIComponent(filename)
    } catch (_e) {
      // Invalid encoding
      res.status(400).send('Invalid filename')
      return
    }

    // Only allow simple filenames: alphanumeric, dots, hyphens, underscores
    // This prevents all path traversal attempts including encoded ones
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      res.status(400).send('Invalid filename')
      return
    }

    const logDir = getFullLogDir(app)
    const requestedPath = path.join(logDir, filename)

    // Verify the resolved path is still within the log directory
    const resolvedPath = path.resolve(requestedPath)
    const resolvedLogDir = path.resolve(logDir)
    if (!resolvedPath.startsWith(resolvedLogDir + path.sep)) {
      res.status(400).send('Invalid filename')
      return
    }

    res.sendFile(resolvedPath)
  })
  app.get(`${SERVERROUTESPREFIX}/ziplogs`, function (req, res) {
    const boatName = app.config.vesselName
      ? app.config.vesselName
      : app.config.vesselMMSI
        ? app.config.vesselMMSI
        : ''
    const sanitizedBoatName = boatName.replace(/\W/g, '_')
    const zipFileName = `sk-logs-${sanitizedBoatName}-${moment().format('YYYY-MM-DD-HH-mm')}`

    res.zip({
      files: [{ path: getFullLogDir(app), name: zipFileName }],
      filename: zipFileName + '.zip'
    })
  })
}
