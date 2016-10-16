/*
 * Copyright 2016 Teppo Kurki <teppo.kurki@iki.fi>
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

var debug = require('debug')('signalk:interfaces:plugins')
var fs = require('fs')
var express = require('express')


module.exports = function(app) {


  return {
    start: function() {
      startPlugins(app)

      app.use('/plugins/configure', express.static(__dirname + '/../../plugin-config/public'));

      app.use('/plugins', function(req, res, next) {
        res.json(app.plugins.map(plugin => {
          return {
            name: plugin.name,
            description: plugin.description,
            schema: plugin.schema,
            state: plugin.state
          }
        }))
      });
    }
  }
};


function startPlugins(app) {
  app.plugins = []
  fs.readdir('./node_modules/', function(err, files) {
    if (err) {
      console.error(err)
      return
    }
    files.forEach(loadAndStartPlugin.bind(this, app))
  })
}

function loadAndStartPlugin(app, pluginName) {
  try {
    var metadata = require('../../node_modules/' + pluginName + '/package.json')
    if (metadata.keywords && metadata.keywords.includes('signalk-node-server-plugin-1')) {
      app.plugins.push(require(pluginName)(app))
    }
  } catch (e) {
    // console.log(e)
  }
}
