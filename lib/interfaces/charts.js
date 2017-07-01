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
const MBTiles = require("@mapbox/mbtiles");

const pathPrefix = "/signalk";
const versionPrefix = "/v1";
const apiPathPrefix = pathPrefix + versionPrefix + "/api/";
const parseStringAsync = Promise.promisify(require("xml2js").parseString);
const path = require("path");
const chartBaseDir = path.join(__dirname, "..", "..", "public", "mapcache");

const chartProviders = {};
loadCharts();

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

    app.get("/charts/:map/:z/:x/:y", (req, res) => {
      const { map, z, x, y } = req.params;
      const provider = chartProviders[map];
      if (!provider) {
        res.sendStatus(404);
        return;
      }
      provider.getTile(z, x, y, (err, tile, headers) => {
        if (err && err.message && err.message === "Tile does not exist") {
          res.sendStatus(404);
        } else if (err) {
          console.error(`Error fetching tile ${map}/${z}/${x}/${y}:`, err);
          res.sendStatus(500);
        } else {
          headers["Cache-Control"] = "public, max-age=7776000"; // 90 days
          res.writeHead(200, headers);
          res.end(tile);
        }
      });
    });
  };

  api.stop = function() {};

  return api;
};

function loadCharts(app, req) {
  return fs
    .readdirAsync(chartBaseDir)
    .then(files => {
      return Promise.props(
        files.reduce((result, file) => {
          result[file] = fs
            .statAsync(path.join(chartBaseDir, file))
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
    })
    .catch(err => {
      console.error("Error reading " + chartBaseDir);
      return {};
    });
}

function directoryToMapInfo(dir) {
  const resourceFile = path.join(chartBaseDir, dir, tilemapresource.xml);
  return fs
    .readFileAsync(resourceFile)
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
    })
    .catch(err => {
      console.error("Error reading " + resourceFile + " " + err.message);
      return {};
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
        chartProviders[file] = mbtiles;
        resolve({
          identifier: file,
          name: mbtilesData.name,
          description: mbtilesData.description,
          tilemapUrl: "/charts/" + file + "/{z}/{x}/{y}",
          type: "tilelayer",
          scale: "250000"
        });
      });
    });
  });
}
