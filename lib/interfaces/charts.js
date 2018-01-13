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

const debug = require('debug')('signalk-server:interfaces:charts')
const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs'))
const _ = require('lodash')

const pathPrefix = '/signalk'
const versionPrefix = '/v1'
const apiPathPrefix = pathPrefix + versionPrefix + '/api/'
const parseStringAsync = Promise.promisify(require('xml2js').parseString)
const path = require('path')
const express = require('express')

const chartProviders = {}

module.exports = function (app) {
  let chartBaseDir
  const api = {}

  api.start = function () {
    debug('Starting charts interface')

    chartBaseDir = path.join(app.config.configPath, 'public', 'mapcache')

    if (app.config.configPath != app.config.appPath) {
      debug('using mapcache from config dir')
      app.use('/mapcache', express.static(chartBaseDir))
    }

    app.get(apiPathPrefix + 'resources/charts/*', (req, res, next) => {
      loadCharts(chartBaseDir, app, req).then(charts => {
        var parts = req.path.split('/')
        var chart_parts = parts.slice(6)

        if (typeof charts[chart_parts[0]] !== 'undefined') {
          res.json(charts[chart_parts[0]])
        } else {
          res.status(404).send('Not found')
        }
      })
    })

    app.get(apiPathPrefix + 'resources/charts', (req, res, next) => {
      loadCharts(chartBaseDir, app, req)
        .then(charts => {
          res.json(charts)
        })
        .catch(err => {
          console.error(err.message)
          res.json({})
        })
    })

    app.get('/charts/:map/:z/:x/:y', (req, res) => {
      const { map, z, x, y } = req.params
      const provider = chartProviders[map]
      if (!provider) {
        res.sendStatus(404)
        return
      }
      provider.getTile(z, x, y, (err, tile, headers) => {
        if (err && err.message && err.message === 'Tile does not exist') {
          res.sendStatus(404)
        } else if (err) {
          console.error(`Error fetching tile ${map}/${z}/${x}/${y}:`, err)
          res.sendStatus(500)
        } else {
          headers['Cache-Control'] = 'public, max-age=7776000' // 90 days
          res.writeHead(200, headers)
          res.end(tile)
        }
      })
    })
  }

  api.stop = function () {}

  return api
}

function loadCharts (chartBaseDir, app, req) {
  return fs
    .readdirAsync(chartBaseDir)
    .then(files => {
      return Promise.props(
        files
          .map(filename => ({
            filename,
            fullFilename: path.join(chartBaseDir, filename)
          }))
          .reduce((acc, { filename, fullFilename }) => {
            acc[filename] = fs
              .statAsync(fullFilename)
              .then(stat => {
                if (stat.isDirectory()) {
                  return directoryToMapInfo(fullFilename, filename)
                } else {
                  return fileToMapInfo(fullFilename, filename)
                }
              })
              .catch(err => {
                console.error(err + ' ' + filename)
                if (
                  err.toString() ===
                  "Error: Cannot find module '@mapbox/mbtiles'"
                ) {
                  console.error('Please install mbtiles support with ')
                  console.error('npm install @mapbox/mbtiles')
                  console.error('or if you installed from npm with -g ')
                  console.error(
                    'sudo npm install -g --unsafe-perm @mapbox/mbtiles'
                  )
                }
                return undefined
              })
            return acc
          }, {})
      )
    })
    .catch(err => {
      console.error(err.message)
      return {}
    })
}

function directoryToMapInfo (fullDirname, dirname) {
  const resourceFile = path.join(fullDirname, 'tilemapresource.xml')
  return fs
    .readFileAsync(resourceFile)
    .then(resXml => {
      return parseStringAsync(resXml)
    })
    .then(parsed => {
      const result = parsed.TileMap
      var scale = '250000'
      if (typeof result.Metadata !== 'undefined') {
        var metaScale = result.Metadata[0]['$'].scale
        if (typeof metaScale !== 'undefined') scale = metaScale
      }

      return {
        identifier: dirname,
        name: result.Title[0],
        description: result.Title[0],
        tilemapUrl: '/mapcache/' + dirname,
        scale: parseInt(scale)
      }
    })
    .catch(err => {
      console.error('Error reading ' + resourceFile + ' ' + err.message)
      return undefined
    })
}

function fileToMapInfo (fullFilename, filename) {
  debug(fullFilename)
  return new Promise((resolve, reject) => {
    const MBTiles = require('@mapbox/mbtiles')
    new MBTiles(fullFilename, (err, mbtiles) => {
      if (err) {
        reject(err)
        return
      }
      mbtiles.getInfo((err, mbtilesData) => {
        if (err) {
          reject(err)
          return
        }
        if (_.isUndefined(mbtilesData) || _.isUndefined(mbtilesData.bounds)) {
          resolve(undefined)
          return
        }
        chartProviders[filename] = mbtiles
        resolve({
          identifier: filename,
          name: mbtilesData.name || mbtilesData.id,
          description: mbtilesData.description,
          bounds: mbtilesData.bounds,
          minzoom: mbtilesData.minzoom,
          maxzoom: mbtilesData.maxzoom,
          format: mbtilesData.format,
          tilemapUrl: '/charts/' + filename + '/{z}/{x}/{y}',
          type: 'tilelayer',
          scale: '250000'
        })
      })
    })
  })
}
