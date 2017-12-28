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

var debug = require('debug')('signalk:interfaces:webapps')
var fs = require('fs')
var path = require('path')
var express = require('express')
const modulesWithKeyword = require('../modules').modulesWithKeyword

module.exports = function (app) {
  return {
    start: function () {
      mountWebapps(app)
      mountApi(app)
    },
    stop: function () {}
  }
}

function mountWebapps (app) {
  debug('MountWebApps')
  modulesWithKeyword('signalk-webapp').forEach(moduleData => {
    let webappPath = path.join(
      __dirname,
      '../../node_modules/' + moduleData.module
    )
    if (fs.existsSync(webappPath + '/public/')) {
      webappPath += '/public/'
    }
    debug('Mounting webapp /' + moduleData.module + ':' + webappPath)
    app.use('/' + moduleData.module, express.static(webappPath))
    app.webapps.push(moduleData.metadata)
  })
}

function mountApi (app) {
  app.get('/webapps', function (req, res, next) {
    res.json(app.webapps)
  })
}
