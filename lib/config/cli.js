/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@starting-point.nl>
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

module.exports = function (app) {
  var path = require('path')
  var debug = require('debug')('signalk-server:config:cli')

  function getSettingsFilename (argv) {
    if (process.env.SIGNALK_NODE_SETTINGS) {
      debug(
        'Settings filename was set in environment SIGNALK_NODE_SETTINGS, overriding all other options'
      )
      return path.resolve(process.env.SIGNALK_NODE_SETTINGS)
    }

    var settingsFile =
      argv.s || (argv.c ? 'settings.json' : 'settings/settings.json')

    return path.join(app.config.configPath, settingsFile)
  }

  app.__argv = process.argv.slice(2)
  app.argv = require('minimist')(app.__argv)

  if (process.env.SIGNALK_NODE_CONDFIG_DIR) {
    app.config.configPath = path.resolve(process.env.SIGNALK_NODE_CONDFIG_DIR)
  } else {
    app.config.configPath = app.argv.c || app.config.appPath
  }

  var settings = getSettingsFilename(app.argv)
  debug('Using settings file: ' + settings)

  try {
    app.config.settings = require(settings)
  } catch (e) {
    console.error('error parsing settings file: ' + settings, e)
    app.config.settings = {}
  }

  try {
    var defaultsFile = app.argv.c ? 'defaults.json' : 'settings/defaults.json'
    app.config.defaults = require(path.join(
      app.config.configPath,
      defaultsFile
    ))
  } catch (e) {
    console.error('No settings/defaults.json available')
  }

  if (
    typeof app.config.settings.vessel === 'object' &&
    app.config.settings.vessel !== null
  ) {
    if (typeof app.config.settings.vessel.mmsi === 'string') {
      app.selfType = 'mmsi'
      app.selfId = 'urn:mrn:imo:mmsi:' + app.config.settings.vessel.mmsi
    } else if (typeof app.config.settings.vessel.uuid === 'string') {
      app.selfType = 'uuid'
      app.selfId = app.config.settings.vessel.uuid
    }

    debug(app.selfType.toUpperCase() + ': ' + app.selfId)
  }
}
