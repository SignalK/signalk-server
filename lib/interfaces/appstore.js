/*
 * Copyright 2017 Scott Bender <scott@scottbender.net>
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

const debug = require('debug')('signalk:interfaces:appstore')
const _ = require('lodash')
const fs = require('fs')
const agent = require('superagent-promise')(require('superagent'), Promise)
const compareVersions = require('compare-versions')
const spawn = require('child_process').spawn

module.exports = function(app) {

  return {
    start: function() {
      app.availablePlugins = []
      app.pluginInstalling = undefined
      app.pluginsInstalled = {}
      app.pluginInstallQueue = {}

      app.get('/appstore/output/:id/:version' , (req, res, next) => {
        var html = fs.readFileSync(__dirname + '/appstore.html', {encoding: 'utf8'})
        var insertionIndex = html.indexOf('</div>');
        var sliceToInsertion = html.slice(0, insertionIndex);
        var sliceToEnd = html.slice(insertionIndex);
        var result = sliceToInsertion;
        
        result += '<h2>Errors installing ' + req.params.id + '</h2>'
        result += '<pre>'
        result += app.pluginsInstalled[req.params.id].output
        result += '</pre>'
        result += '<a href="/appstore/install/' + req.params.id + '/' + req.params.version + '"><button type="button" class="btn">Retry</button></a> '
        result += sliceToEnd;
        res.send(result)
      })

      app.get('/appstore/install/:name/:version', (req, res, next) => {
        var name = req.params.name
        var version = req.params.version
        if ( app.availablePlugins.indexOf(name) == -1 )
        {
          res.send('Unknown Plugin ' + name)
        }
        else
        {
          if ( app.pluginInstalling )
          {
            app.pluginInstallQueue[name] = { name: name, version: version}
          } else {
            installPlugin(app, name, version)
          }
          res.redirect('/appstore')
        }
      })

      app.get('/appstore/', (req, res, next) => {
        var html = fs.readFileSync(__dirname + '/appstore.html', {encoding: 'utf8'})
        var insertionIndex = html.indexOf('</div>');
        var sliceToInsertion = html.slice(0, insertionIndex);
        var sliceToEnd = html.slice(insertionIndex);
        var result = sliceToInsertion;
        agent('GET', 'http://registry.npmjs.org/-/v1/search?text=signalk-node-server-plugin').end().then(function(response) {

          var plugins = JSON.parse(response.text)

          app.availablePlugins = []

          if ( Object.keys(app.pluginsInstalled).length ) {
            result += '<p class="text-warning">Server restart is required to pickup new or updated plugins or web apps.</p>\n'
          }

          result += '<h3>Plugins</h3>\n'
          result += makePluginTable(app, plugins, getPlugin)

          agent('GET', 'http://registry.npmjs.org/-/v1/search?text=signalk-webapp').end().then(function(response) {

            var webapps = JSON.parse(response.text)
            
            result += '<h3>Web Apps</h3>\n'
            result += makePluginTable(app, webapps, getWebApp)

            if ( app.pluginInstalling ) {
              result += '<script>setTimeout(function(){ window.location.reload(1);}, 2000)</script>'
            }
            
            result += sliceToEnd;
            res.send(result)
          }).catch(error => {
            console.log('got an error2: ' + error)
            console.log(error.stack)
            res.status(500)        
            res.send('<pre>' + error.stack + '</pre>')
          })
            }).catch(error => {
              console.log('got an error: ' + error)
              console.log(error.stack)
              res.status(500)
              res.send('<pre>' + error.stack + '</pre>')
            })
              })
    },
    stop: function() {}
  }
}



function getPlugin(app, id)
{
  var filtered = app.plugins.filter(plugin => {
    return plugin.packageName == id
  });
  return filtered.length > 0 ? filtered[0] : undefined
}

function getWebApp(app, id)
{
  var filtered = app.webapps.filter(webapp => {
    return webapp.name == id
  });
  return filtered.length > 0 ? filtered[0] : undefined
}

function makePluginTable(app, plugins, existing)
{
  var result = '<table class="table table-bordered">\n';
  result += '<tr><th>Install</th><th>Update</th><th>Name</th><th>Description</th><th>Author</th><th>Link</th></tr>\n'

  result += plugins["objects"].reduce(function(result, pluginInfo) {

    var name = pluginInfo.package.name
    var version = pluginInfo.package.version
    
    app.availablePlugins.push(name)
    
    var plugin = existing(app,name)
  
    result += '<tr>';
    result += '<td>'
    if ( app.pluginsInstalled[name] ) {
      if ( app.pluginInstalling && app.pluginInstalling.name == name )
      {
        result += '<p class="text-primary">Installing ' + app.pluginInstalling.version + '...' + '</p>'
      } else if ( app.pluginsInstalled[name].code == 0 ) {
        result += '<p class="text-success"> Installed ' + app.pluginsInstalled[name].version + '</p>'
      } else {
        result += '<a href="/appstore/output/' + name + '/' + app.pluginsInstalled[name].version + '"><button type="button" class="btn-danger">Error</button></a> '
      }
    } else if ( app.pluginInstallQueue[name] ) {
      result += '<p class="text-primary">Waiting...' + '</p>'
    } else if ( !plugin ) {
      result += '<a href="/appstore/install/' + name + '/' + version + '"><button type="button" class="btn">Install ' + version + '</button></a> '
    } else {
      result +=  plugin.version + ' Installed'
    }
    
    result += '</td><td>'
    if ( !app.pluginsInstalled[name] ) {
      if ( plugin && compareVersions(version, plugin.version) > 0 ) {
        result += '<a href="/appstore/install/' + name + '/' + version + '"><button type="button" class="btn">Update to ' + version + '</button></a> '
      } else if ( plugin ) {
        result += 'Latest Installed'
      } else {
        result += 'Not Installed'
      }
    }
    result += '</td>'
    result += '<td><b>' + name + '</b></td> ';
    result += '<td>' + pluginInfo.package.description + '</td> ';
    result += '<td>' + pluginInfo.package.author.name + '</td> ';
    
    result += '<td>'
    var npm = _.get(pluginInfo.package, 'links.npm')
    if ( npm ) {
      result += '<a href="' + npm + '">npm</a>'
    }
    result += '</td> ';
    result += '</tr>\n';
    return result;
  }, '');
  result += '</table>\n';
  return result
}

function installPlugin(app, name, version)
{
  debug('installing: ' + name + ' ' + version)
  app.pluginInstalling = {
    name: name,
    output: [],
    version: version
  }
  app.pluginsInstalled[name] = app.pluginInstalling
  
  const npm = spawn('npm', ['install', name])
  
  npm.stdout.on('data', (data) => {
    app.pluginsInstalled[name].output.push(data)
    console.log(`stdout: ${data}`);
  });
  
  npm.stderr.on('data', (data) => {
    app.pluginsInstalled[name].output.push(data)
    console.log(`stderr: ${data}`);
  });
  
  npm.on('close', (code) => {
    debug('close: ' + name)
    app.pluginsInstalled[name]['code'] = code
    app.pluginInstalling = undefined
    console.log(`child process exited with code ${code}`);

    if ( Object.keys(app.pluginInstallQueue).length ) {
      var next_name = Object.keys(app.pluginInstallQueue)[0]
      debug('QUEUE: ' + next_name)
      var info = app.pluginInstallQueue[next_name]
      delete app.pluginInstallQueue[next_name]
      installPlugin(app, next_name, info.version)
    }
  });
}
