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

module.exports = function (app, config) {
  return {
    getConfiguration: () => {
      return {}
    },

    allowRestart: req => {
      return false
    },

    allowConfigure: req => {
      return false
    },

    getLoginStatus: req => {
      return {
        status: 'notLoggedIn',
        readOnlyAccess: false,
        authenticationRequired: false
      }
    },

    getConfig: config => {
      return config
    },

    setConfig: (config, newConfig) => {},

    getUsers: config => {
      return []
    },

    updateUser: (config, username, updates, callback) => {},

    addUser: (config, user, callback) => {},

    setPassword: (config, username, password, callback) => {},

    deleteUser: (config, username, callback) => {},

    shouldAllowWrite: function (req, delta) {
      return true
    },

    filterReadDelta: (user, delta) => {
      return delta
    },

    verifyWS: spark => {},

    authorizeWS: req => {},

    checkACL: (id, context, path, source, operation) => {
      return true
    },

    isDummy: () => {
      return true
    },

    canAuthorizeWS: () => {
      return false
    },

    shouldFilterDeltas: () => {
      return false
    }
  }
}
