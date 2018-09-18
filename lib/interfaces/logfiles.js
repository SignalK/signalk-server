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

const debug = require('debug')('signalk:interfaces:logfiles')
const fs = require('fs')
const path = require('path')
const express = require('express')
const { getFullLogDir, listLogFiles } = require('../logging')

module.exports = function (app) {
  return {
    start: function () {
      mountApi(app)
    },
    stop: function () {}
  }
}

function mountApi (app) {
  app.get('/logfiles/', function (req, res, next) {
    listLogFiles(app, (err, files) => {
      if (err) {
        console.error(err)
        res.status(500)
        res.send('Error reading logfiles list')
        return
      }
      res.json(files)
    })
  })
  app.get('/logfiles/:filename', function (req, res, next) {
    const sanitizedLogfile = path
      .join(getFullLogDir(app), req.params.filename)
      .replace(/\.\./g, '')
    res.sendFile(sanitizedLogfile)
  })
}
