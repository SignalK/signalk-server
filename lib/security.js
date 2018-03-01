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
const path = require('path')
const Mode = require('stat-mode')
const pem = require('pem')
const debug = require('debug')('signalk-server')
const _ = require('lodash')
const dummysecurity = require('./dummysecurity')

module.exports = {
  startSecurity,
  getCertificateOptions
}

function startSecurity (app, securityConfig) {
  var securityStrategyModuleName =
    process.env.SECURITYSTRATEGY ||
    _.get(app, 'config.settings.security.strategy')

  if (securityStrategyModuleName) {
    if (securityStrategyModuleName === 'sk-simple-token-security') {
      console.log(
        'The sk-simple-token-security security strategy is depricated, please update to @signalk/sk-simple-token-security'
      )
      process.exit(1)
    } else if (
      securityStrategyModuleName === '@signalk/sk-simple-token-security'
    ) {
      securityStrategyModuleName = './tokensecurity'
    }

    var config = securityConfig || getSecurityConfig(app)
    app.securityStrategy = require(securityStrategyModuleName)(app, config)
  } else {
    app.securityStrategy = dummysecurity((app, config))
  }
}

function getSecurityConfig (app) {
  try {
    const optionsAsString = fs.readFileSync(pathForSecurityConfig(app), 'utf8')
    return JSON.parse(optionsAsString)
  } catch (e) {
    console.error('Could not parse security config')
    console.error(e)
    return {}
  }
}

function pathForSecurityConfig (app) {
  return path.join(app.config.configPath, 'security.json')
}

function saveSecurityConfig (app, data, callback) {
  const config = JSON.parse(JSON.stringify(data))
  const path = pathForSecurityConfig(app)
  fs.writeFile(path, JSON.stringify(data, null, 2), err => {
    if (!err) {
      fs.chmodSync(path, '600')
    }
    if (callback) {
      callback(err)
    }
  })
}

function getCertificateOptions (app, cb) {
  var certLocation

  if (!app.config.configPath || fs.existsSync('./settings/ssl-cert.pem')) {
    certLocation = './settings'
  } else {
    certLocation = app.config.configPath
  }

  var certFile = path.join(certLocation, 'ssl-cert.pem')
  var keyFile = path.join(certLocation, 'ssl-key.pem')
  var chainFile = path.join(certLocation, 'ssl-chain.pem')

  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    if (!hasStrictPermissions(fs.statSync(keyFile))) {
      cb(
        new Error(
          `${keyFile} must be accessible only by the user that is running the server, refusing to start`
        )
      )
      return
    }
    if (!hasStrictPermissions(fs.statSync(certFile))) {
      cb(
        new Error(
          `${certFile} must be accessible only by the user that is running the server, refusing to start`
        )
      )
      return
    }
    let ca
    if (fs.existsSync(chainFile)) {
      debug('Found ssl-chain.pem')
      ca = getCAChainArray(chainFile)
      debug(JSON.stringify(ca, null, 2))
    }
    debug(`Using certificate ssl-key.pem and ssl-cert.pem in ${certLocation}`)
    cb(null, {
      key: fs.readFileSync(keyFile),
      cert: fs.readFileSync(certFile),
      ca
    })
  } else {
    createCertificateOptions(app, certFile, keyFile, cb)
  }
}

function hasStrictPermissions (stat) {
  if (process.platform == 'win32') {
    return new Mode(stat).toString() === '-r--r--r--'
  } else {
    return /^-r[-w][-x]------$/.test(new Mode(stat).toString())
  }
}

function getCAChainArray (filename) {
  let chainCert = []
  return fs
    .readFileSync(filename, 'utf8')
    .split('\n')
    .reduce((ca, line) => {
      chainCert.push(line)
      if (line.match(/-END CERTIFICATE-/)) {
        ca.push(chainCert.join('\n'))
        chainCert = []
      }
      return ca
    }, [])
}

function createCertificateOptions (app, certFile, keyFile, cb) {
  var location = app.config.configPath ? app.config.configPath : './settings'
  debug(`Creating certificate files in ${location}`)
  pem.createCertificate(
    {
      days: 360,
      selfSigned: true
    },
    function (err, keys) {
      if (err) {
        console.error('Could not create SSL certificate:' + err.message)
        throw err
      } else {
        fs.writeFileSync(keyFile, keys.serviceKey)
        fs.chmodSync(keyFile, '600')
        fs.writeFileSync(certFile, keys.certificate)
        fs.chmodSync(certFile, '600')
        cb(null, {
          key: keys.serviceKey,
          cert: keys.certificate
        })
      }
    }
  )
}
