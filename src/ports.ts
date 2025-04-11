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

import { WithConfig } from './app.js'

const SD_LISTEN_FDS_START = 3

export const getSslPort = (app: WithConfig) =>
  Number(process.env?.SSLPORT) || app.config.settings.sslport || 3443

export const getHttpPort = (app: WithConfig) =>
  Number(process.env?.PORT) || app.config.settings.port || 3000

export function getPrimaryPort(app: WithConfig) {
  if (Number(process.env.LISTEN_FDS) > 0) {
    return {
      fd: SD_LISTEN_FDS_START
    }
  }
  return app.config.settings.ssl ? getSslPort(app) : getHttpPort(app)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSecondaryPort(app: WithConfig): any {
  if (Number(process.env.LISTEN_FDS) > 0) {
    if (Number(process.env.LISTEN_FDS) !== 2) {
      return false
    }
    return {
      fd: SD_LISTEN_FDS_START + 1
    }
  }
  return app.config.settings.ssl ? getHttpPort(app) : -7777
}

export function getExternalPort(app: WithConfig) {
  if (Number(process.env?.EXTERNALPORT) > 0) {
    return Number(process.env?.EXTERNALPORT)
  }
  if (app.config.settings.proxy_port) {
    return app.config.settings.proxy_port
  }
  return app.config.settings.ssl ? getSslPort(app) : getHttpPort(app)
}
