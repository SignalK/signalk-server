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

import { createDebug } from '../debug.js'
const debug = createDebug('signalk-server:interfaces:webapps')
import fs from 'fs'
import path from 'path'
import { static as serveStatic } from 'express'
import { modulesWithKeyword } from '../modules.js'
import { SERVERROUTESPREFIX } from '../constants.js'
import { uniqBy } from 'lodash-es'

export default function (app) {
  return {
    start: function () {
      app.webapps = mountWebModules(app, 'signalk-webapp').map(
        (moduleData) => moduleData.metadata
      )
      app.addons = mountWebModules(app, 'signalk-node-server-addon').map(
        (moduleData) => moduleData.metadata
      )
      app.embeddablewebapps = mountWebModules(
        app,
        'signalk-embeddable-webapp'
      ).map((moduleData) => moduleData.metadata)
      app.pluginconfigurators = mountWebModules(
        app,
        'signalk-plugin-configurator'
      ).map((moduleData) => moduleData.metadata)
      mountApis(app)
    },

    stop: function () {}
  }
}

function mountWebModules(app, keyword) {
  debug(`mountWebModules:${keyword}`)
  const modules = modulesWithKeyword(app.config, keyword)
  modules.forEach((moduleData) => {
    let webappPath = path.join(moduleData.location, moduleData.module)
    if (fs.existsSync(webappPath + '/public/')) {
      webappPath += '/public/'
    }
    debug('Mounting web module /' + moduleData.module + ':' + webappPath)
    app.use('/' + moduleData.module, serveStatic(webappPath))
  })
  return modules
}

function mountApis(app) {
  app.get(`${SERVERROUTESPREFIX}/webapps`, function (req, res) {
    const allWebapps = [].concat(app.webapps).concat(app.embeddablewebapps)
    res.json(uniqBy(allWebapps, 'name'))
  })
  app.get(`${SERVERROUTESPREFIX}/addons`, function (req, res) {
    res.json(app.addons)
  })
}
