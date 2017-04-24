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

module.exports = function(app) {
  return {
    start: function() {
      mountWebapps(app)
    },
    stop: function() {}
  }
};

function mountWebapps(app) {
  debug("MountWebApps")
  fs.readdirSync('./node_modules/').filter(name => name != '.bin').forEach(pluginName => {
    var metadata;
    try {
      metadata = require('../../node_modules/' + pluginName + '/package.json')
    } catch(e) {
      console.log(e)
    }
    if(metadata && metadata.keywords && metadata.keywords.includes('signalk-webapp')) {
      const webappPath = path.join(__dirname, '../../node_modules/' + pluginName)
      debug("Mounting webapp /" + pluginName + ":" + webappPath)
      app.use('/' + pluginName, express.static(webappPath));
      app.webapps.push(metadata)
    }
  })
}
