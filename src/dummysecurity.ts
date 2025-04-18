/* eslint-disable @typescript-eslint/no-explicit-any */
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

import { SecurityStrategy } from './security.js'

export default function () {
  const dummyStrategy = {
    getConfiguration: () => {
      return {}
    },

    allowRestart: (_req: any) => {
      return false
    },

    allowConfigure: (_req: any) => {
      return false
    },

    getLoginStatus: (_req: any) => {
      return {
        status: 'notLoggedIn',
        readOnlyAccess: false,
        authenticationRequired: false
      }
    },

    getConfig: (_config: any) => {
      return _config
    },

    setConfig: (_config: any, _newConfig: any) => {},

    getUsers: (_config: any) => {
      return []
    },

    updateUser: (
      _config: any,
      _username: any,
      _updates: any,
      _callback: any
    ) => {},

    addUser: (_config: any, _user: any, _callback: any) => {},

    setPassword: (
      _config: any,
      _username: any,
      _password: any,
      _callback: any
    ) => {},

    deleteUser: (_config: any, _username: any, _callback: any) => {},

    shouldAllowWrite: function (_req: any, _delta: any) {
      return true
    },

    shouldAllowPut: function (
      _req: any,
      _context: any,
      _source: any,
      _path: any
    ) {
      return true
    },

    filterReadDelta: (_user: any, delta: any) => {
      return delta
    },

    verifyWS: (_spark: any) => {},

    authorizeWS: (_req: any) => {},

    anyACLs: () => {
      return false
    },

    checkACL: (
      _id: any,
      _context: any,
      _path: any,
      _source: any,
      _operation: any
    ) => {
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
    },

    addAdminMiddleware: () => {},

    addAdminWriteMiddleware: () => {},

    addWriteMiddleware: () => {},

    allowReadOnly: () => {
      return true
    },

    supportsLogin: () => false,

    getAuthRequiredString: () => {
      return 'never'
    },

    validateConfiguration: (_configuration: any) => {},

    configFromArguments: false,
    securityConfig: undefined,
    requestAccess: () => undefined
  }
  //force cast via unknown so that we don't need to
  //implement all dummy methods that are never called
  //with dummy strategy in place. or if they are called
  //the result will be an error.
  return dummyStrategy as unknown as SecurityStrategy
}
