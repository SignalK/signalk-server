/* eslint-disable @typescript-eslint/no-explicit-any */
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

import fs from 'fs'
//import { createDebug } from './debug'
//const debug = createDebug('signalk-server:venussecurity')
import dummysecurity from './dummysecurity'
import { saveSecurityConfig } from './security'

//const passwordFile = '/data/conf/vncpassword.txt'
const passwordFile = './vncpassword.txt'

module.exports = function (app, config) {
  let security

  if (fs.existsSync(passwordFile) && fs.readFileSync(passwordFile).length) {
    if (!config.users || config.users.length == 0) {
      const user = {
        username: 'admin',
        type: 'admin',
        password: fs.readFileSync(passwordFile).toString().trim(),
        venusAdminUser: true
      }

      security = require('./tokensecurity')(app, config)
      config = security.getConfiguration()
      config.users = [user]
      app.securityStrategy = security
      saveSecurityConfig(app, config, (theError) => {
        if (theError) {
          console.error(theError)
        }
      })
    } else {
      security = require('./tokensecurity')(app, config)
    }
    const tslogin = security.login

    security.login = (username, password) => {
      if (username === 'admin') {
        const user = security
          .getConfiguration()
          .users.find((aUser) => aUser.username === username)

        if ( user.venusAdminUser ) {
          const password = fs.readFileSync(passwordFile).toString().trim()
          
          if (password !== user.password) {
            user.password = password
            saveSecurityConfig(app, config, (theError) => {
              if (theError) {
                console.error(theError)
              }
            })
          }
        }
      }
      return tslogin(username, password)
    }

    const tsAuthorizeWS = security.authorizeWS
    security.authorizeWS = (req) => {
      tsAuthorizeWS(req)
      if (
        !req.skIsAuthenticated &&
        req.headers.venus_os_authenticated === 'true'
      ) {
        req.skIsAuthenticated = true
        req.skPrincipal = {
          identifier: 'admin',
          permissions: 'admin'
        }
      }
    }

    const tsHttpAuthorize = security.httpAuthorize
    security.httpAuthorize = (redirect, forLoginStatus, req, res, next) => {
      if (
        req.cookies.JAUTHENTICATION ||
        security.getAuthorizationFromHeaders(req)
      ) {
        return tsHttpAuthorize(redirect, forLoginStatus, req, res, next)
      }

      if (req.headers.venus_os_authenticated === 'true') {
        req.skIsAuthenticated = true
        req.userLoggedIn = true
        req.skPrincipal = {
          identifier: 'admin',
          permissions: 'admin'
        }
        return next()
      } else {
        return tsHttpAuthorize(redirect, forLoginStatus, req, res, next)
      }
    }
  } else {
    security = dummysecurity()
  }
  return security
}
