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

const debug = require("debug")("signalk-server:interfaces:charts");
const fs = require('fs');

const pathPrefix = "/signalk";
const versionPrefix = "/v1";
const apiPathPrefix = pathPrefix + versionPrefix + "/api/";
const parseString = require('xml2js').parseString;
const chartBaseDir = __dirname + '/../../public/mapcache/';

module.exports = function(app) {
  const api = {};

  api.start = function() {
    debug("Starting charts interface");

    app.get(apiPathPrefix + "resources/charts/*", (req, res, next) => {
      var charts = loadCharts(app, req)
      var parts = req.path.split('/')

      var chart_parts = parts.slice(6)

      if ( typeof charts[chart_parts[0]] !== 'undefined' )
      {
        res.json(charts[chart_parts[0]])
      }
      else
      {
        res.status(404).send("Not found");
      }
    })
    
    app.get(apiPathPrefix + "resources/charts", (req, res, next) => {
      var charts = loadCharts(app, req)
      if ( typeof charts === 'undefined' )
      {
        res.json({})
      }
      else
      {
        res.json(charts)
      }
    });
  };

  api.stop = function() {};

  return api;
};


function loadCharts(app, req)
{
  var chartFiles = [];

  var url = '/mapcache/'
  
  try {
    chartFiles = fs.readdirSync(chartBaseDir);
  } catch (exception) {
    debug("No such directory:", chartBaseDir);
  }

  var charts = {}
  chartFiles.forEach(function(dir) {
    var xml = fs.readFileSync(chartBaseDir + dir + '/tilemapresource.xml')
    parseString(xml, function (err, result) {
      
      result = result.TileMap
      var scale = "250000";
      if( typeof result.Metadata !== 'undefined' )
      {
        
        var metaScale = result.Metadata[0]['$'].scale
        if ( typeof metaScale !== 'undefined' )
          scale = metaScale
      }
      
      chart = {
        identifier: dir,
        name: result.Title[0],
        description: result.Title[0],
        tilemapUrl: url + dir,
        'scale': parseInt(scale),
      }
      
      
      charts[dir] = chart;
    });
  })
  return charts
}
