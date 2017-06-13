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
const Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs"));

const pathPrefix = "/signalk";
const versionPrefix = "/v1";
const apiPathPrefix = pathPrefix + versionPrefix + "/api/";
const parseStringAsync = Promise.promisify(require("xml2js").parseString);
const chartBaseDir = __dirname + "/../../public/mapcache/";

module.exports = function(app) {
  const api = {};

  api.start = function() {
    debug("Starting charts interface");

    app.get(apiPathPrefix + "resources/charts/*", (req, res, next) => {
      loadCharts(app, req).then(charts => {
        var parts = req.path.split("/");
        var chart_parts = parts.slice(6);

        if (typeof charts[chart_parts[0]] !== "undefined") {
          res.json(charts[chart_parts[0]]);
        } else {
          res.status(404).send("Not found");
        }
      });
    });

    app.get(apiPathPrefix + "resources/charts", (req, res, next) => {
      loadCharts(app, req)
        .then(charts => {
          res.json(charts);
        })
        .catch(err => {
          console.error(err.message);
          res.json({});
        });
    });
  };

  api.stop = function() {};

  return api;
};

function loadCharts(app, req) {
  return fs.readdirAsync(chartBaseDir).then(files => {
    return Promise.props(
      files.reduce((result, file) => {
        result[file] = fs
          .statAsync(chartBaseDir + file)
          .then(stat => {
            if (stat.isDirectory()) {
              return directoryToMapInfo(file);
            } else {
              return fileToMapInfo(file);
            }
          })
          .catch(err => {
            console.error(err + " " + file);
            return undefined;
          });
        return result;
      }, {})
    );
  });
}

function directoryToMapInfo(dir) {
  return fs
    .readFileAsync(chartBaseDir + dir + "/tilemapresource.xml")
    .then(resXml => {
      return parseStringAsync(resXml);
    })
    .then(parsed => {
      const result = parsed.TileMap;
      var scale = "250000";
      if (typeof result.Metadata !== "undefined") {
        var metaScale = result.Metadata[0]["$"].scale;
        if (typeof metaScale !== "undefined") scale = metaScale;
      }

      return {
        identifier: dir,
        name: result.Title[0],
        description: result.Title[0],
        tilemapUrl: "/mapcache/" + dir,
        scale: parseInt(scale)
      };
    });
}


function fileToMapInfo(file) {
  return new Promise((resolve, reject) => {
    new MBTiles(chartBaseDir + file, (err, mbtiles) => {
      if (err) {
        reject(err);
      }
      mbtiles.getInfo((err, mbtilesData) => {
        if (err) {
          reject(err);
        }
        console.log(mbtilesData);
        resolve({
          identifier: mbtilesData.file,
          name: mbtilesData.name,
          description: mbtilesData.description,
          tilemapUrl: "/realpathherethen",
          scale: "250000"
        });
      });
    });
  });
}
