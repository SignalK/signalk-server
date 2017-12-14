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

const fs = require('fs')
const page = require('./page')
const debug = require('debug')('signalk-server:serverroutes')
const path = require('path')

module.exports = function (app, saveSecurityConfig, getSecurityConfig) {
  app.get('/', (req, res) => {
    let { result, footer } = page(__dirname + '/index.html', '</ul>')

    if (app.securityStrategy) {
      result +=
        '<li class="list-group-item"><a href="/restart">Restart</a></li>'
      if (req.userLoggedIn) {
        result +=
          '<li class="list-group-item"><a href="/logout">Logout</a></li>'
      }
    }

    res.send(result + footer)
  })

  app.get('/apps', (req, res, next) => {
    var html = fs.readFileSync(__dirname + '/appindex.html', {
      encoding: 'utf8'
    })
    var insertionIndex = html.indexOf('<div/>')
    var sliceToInsertion = html.slice(0, insertionIndex)
    var sliceToEnd = html.slice(insertionIndex)

    var result = sliceToInsertion
    result += '<ul class="list-group">'
    result += app.webapps.reduce(function (result, componentInfo) {
      result += '<li class="list-group-item">'
      result +=
        '<b><a href="' +
        componentInfo.name +
        '">' +
        componentInfo.name +
        '</a></b> '
      result += componentInfo.description
      result += '</li>\n'
      return result
    }, '')
    result += '</ul>'
    result += sliceToEnd
    res.send(result)
  })

  app.get('/restart', (req, res, next) => {
    if (
      app.securityStrategy &&
      app.securityStrategy.allowRestart &&
      app.securityStrategy.allowRestart(req)
    ) {
      res.send('Restarting...')
      setTimeout(function () {
        process.exit(0)
      }, 2000)
    } else {
      res.status(401).json('Restart not allowed')
    }
  })

  app.get('/loginStatus', (req, res, next) => {
    if (app.securityStrategy) {
      app.securityStrategy.getLoginStatus(req, res, next)
    } else {
      res.json({
        status: 'notLoggedIn',
        readOnlyAccess: false,
        authenticationRequired: false
      })
    }
  })

  if (app.securityStrategy) {
    app.get('/security/config', (req, res, next) => {
      if (
        app.securityStrategy.allowConfigure &&
        app.securityStrategy.allowConfigure(req)
      ) {
        var config = getSecurityConfig(app)
        res.json(app.securityStrategy.getConfig(config))
      } else {
        res.status(401).json('security config not allowed')
      }
    })

    app.put('/security/config', (req, res, next) => {
      if (
        app.securityStrategy.allowConfigure &&
        app.securityStrategy.allowConfigure(req)
      ) {
        var config = getSecurityConfig(app)
        var config = app.securityStrategy.setConfig(config, req.body)
        saveSecurityConfig(app, config, err => {
          if (err) {
            console.log(err)
            res.status(500)
            res.send(err)
            return
          }
          res.send('security config saved')
        })
      } else {
        res.status(401).json('security config not allowed')
      }
    })

    app.get('/security/users', (req, res, next) => {
      if (
        app.securityStrategy.allowConfigure &&
        app.securityStrategy.allowConfigure(req)
      ) {
        var config = getSecurityConfig(app)
        res.json(app.securityStrategy.getUsers(config))
      } else {
        res.status(401).json('security config not allowed')
      }
    })

    app.post('/security/users', (req, res, next) => {
      if (
        app.securityStrategy.allowConfigure &&
        app.securityStrategy.allowConfigure(req)
      ) {
        var config = getSecurityConfig(app)
        app.securityStrategy.addUser(config, req.body, (err, config) => {
          if (err) {
            console.log(err)
            res.status(500)
            res.send(err)
          } else if (config) {
            saveSecurityConfig(app, config, err => {
              if (err) {
                console.log(err)
                res.status(500)
                res.send(err)
                return
              }
              res.send('user added')
            })
          } else {
            res.send('user added')
          }
        })
      } else {
        res.status(401).json('security config not allowed')
      }
    })

    app.put('/security/user/:username/password', (req, res, next) => {
      if (
        app.securityStrategy.allowConfigure &&
        app.securityStrategy.allowConfigure(req)
      ) {
        var config = getSecurityConfig(app)
        app.securityStrategy.setPassword(
          config,
          req.params.username,
          req.body,
          (err, config) => {
            if (err) {
              console.log(err)
              res.status(500)
              res.send(err)
              return
            }
            if (config) {
              saveSecurityConfig(app, config, err => {
                if (err) {
                  console.log(err)
                  res.status(500)
                  res.send(err)
                  return
                }
                res.send('password changed')
              })
            } else {
              res.send('password changed')
            }
          }
        )
      } else {
        res.status(401).json('security config not allowed')
      }
    })

    app.delete('/security/users/:username', (req, res, next) => {
      if (
        app.securityStrategy.allowConfigure &&
        app.securityStrategy.allowConfigure(req)
      ) {
        var config = getSecurityConfig(app)
        app.securityStrategy.deleteUser(
          config,
          req.params.username,
          (err, config) => {
            if (err) {
              console.log(err)
              res.status(500)
              res.send(err)
              return
            }
            if (config) {
              saveSecurityConfig(app, config, err => {
                if (err) {
                  console.log(err)
                  res.status(500)
                  res.send(err)
                  return
                }
                res.send('password changed')
              })
            } else {
              res.send('password changed')
            }
          }
        )
      } else {
        res.status(401).json('security config not allowed')
      }
    })
  }
}
