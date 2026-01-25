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

import { Request, Response, NextFunction } from 'express'
import {
  SecurityStrategy,
  SecurityConfig,
  SignalKRequest,
  Delta,
  SkPrincipal,
  WsAuthRequest,
  LoginStatusResponse,
  UserData,
  NewUserData,
  Device,
  UserDataUpdate,
  DeviceDataUpdate,
  RequestStatusData
} from './security'
import { ICallback } from './types'
import {
  Reply,
  ClientRequest,
  Request as RequestRecord
} from './requestResponse'

export default function (): SecurityStrategy {
  const dummyStrategy: SecurityStrategy = {
    getConfiguration: () => {
      return {} as SecurityConfig
    },

    allowRestart: (req: Request) => {
      void req
      return false
    },

    allowConfigure: (req: Request) => {
      void req
      return false
    },

    getLoginStatus: (req: Request): LoginStatusResponse => {
      void req
      return {
        status: 'notLoggedIn',
        readOnlyAccess: false,
        authenticationRequired: false
      }
    },

    getConfig: (config: SecurityConfig) => {
      return config
    },

    setConfig: (
      config: SecurityConfig,
      newConfig: SecurityConfig
    ): SecurityConfig => {
      void config
      return newConfig
    },

    getUsers: (config: SecurityConfig): UserData[] => {
      void config
      return []
    },

    updateUser: (
      config: SecurityConfig,
      username: string,
      updates: UserDataUpdate,
      callback: ICallback<SecurityConfig>
    ) => {
      void config
      void username
      void updates
      void callback
    },

    addUser: (
      config: SecurityConfig,
      user: NewUserData,
      callback: ICallback<SecurityConfig>
    ) => {
      void config
      void user
      void callback
    },

    setPassword: (
      config: SecurityConfig,
      username: string,
      password: string,
      callback: ICallback<SecurityConfig>
    ) => {
      void config
      void username
      void password
      void callback
    },

    deleteUser: (
      config: SecurityConfig,
      username: string,
      callback: ICallback<SecurityConfig>
    ) => {
      void config
      void username
      void callback
    },

    getDevices: (config: SecurityConfig): Device[] => {
      void config
      return []
    },

    deleteDevice: (
      config: SecurityConfig,
      clientId: string,
      callback: ICallback<SecurityConfig>
    ) => {
      void config
      void clientId
      void callback
    },

    updateDevice: (
      config: SecurityConfig,
      clientId: string,
      updates: DeviceDataUpdate,
      callback: ICallback<SecurityConfig>
    ) => {
      void config
      void clientId
      void updates
      void callback
    },

    shouldAllowWrite: function (req: SignalKRequest, delta: Delta): boolean {
      void req
      void delta
      return true
    },

    shouldAllowPut: function (
      req: Request,
      context: string,
      source: string | null,
      path: string
    ): boolean {
      void req
      void context
      void source
      void path
      return true
    },

    filterReadDelta: (
      principal: SkPrincipal | undefined,
      delta: Delta
    ): Delta | null => {
      void principal
      return delta
    },

    verifyWS: (req: WsAuthRequest) => {
      void req
    },

    authorizeWS: (req: WsAuthRequest) => {
      void req
    },

    anyACLs: (): boolean => {
      return false
    },

    checkACL: (
      id: string,
      context: string,
      path: string,
      source: string | null,
      operation: 'read' | 'write' | 'put'
    ): boolean => {
      void id
      void context
      void path
      void source
      void operation
      return true
    },

    isDummy: (): boolean => {
      return true
    },

    canAuthorizeWS: (): boolean => {
      return false
    },

    shouldFilterDeltas: (): boolean => {
      return false
    },

    addAdminMiddleware: (path: string) => {
      void path
    },

    addAdminWriteMiddleware: (path: string) => {
      void path
    },

    addWriteMiddleware: (path: string) => {
      void path
    },

    allowReadOnly: (): boolean => {
      return true
    },

    supportsLogin: (): boolean => {
      return false
    },

    login: (username: string, password: string) => {
      void username
      void password
      return Promise.resolve({
        statusCode: 401,
        message: 'Login not supported'
      })
    },

    getAuthRequiredString: (): 'never' | 'forwrite' | 'always' => {
      return 'never'
    },

    validateConfiguration: (configuration: SecurityConfig) => {
      void configuration
    },

    generateToken: (
      req: Request,
      res: Response,
      next: NextFunction,
      id: string,
      expiration: string
    ) => {
      void req
      void res
      void next
      void id
      void expiration
    },

    requestAccess: (
      config: SecurityConfig,
      request: ClientRequest,
      ip: string | null | undefined,
      updateCb?: (reply: Reply) => void
    ): Promise<Reply> => {
      void config
      void request
      void ip
      void updateCb
      return Promise.resolve({
        state: 'COMPLETED',
        requestId: '',
        statusCode: 501,
        message: 'Not implemented',
        href: ''
      })
    },

    getAccessRequestsResponse: (): RequestRecord[] => {
      return []
    },

    setAccessRequestStatus: (
      config: SecurityConfig,
      identifier: string,
      status: string,
      body: RequestStatusData,
      cb: ICallback<SecurityConfig>
    ) => {
      void config
      void identifier
      void status
      void body
      cb(new Error('Not implemented'))
    },

    configFromArguments: false,
    securityConfig: {} as SecurityConfig,
    updateOIDCConfig: (newOidcConfig: unknown) => {
      void newOidcConfig
    }
  }

  return dummyStrategy
}
