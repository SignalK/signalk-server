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

const SD_LISTEN_FDS_START = 3

module.exports = {
  getPrimaryPort: function (app) {
    if (process.env.LISTEN_FDS > 0) {
      return {
        fd: SD_LISTEN_FDS_START
      }
    }
    return app.config.settings.ssl
      ? Number(process.env.SSLPORT) || app.config.settings.sslport || 3443
      : Number(process.env.PORT) || app.config.settings.port || 3000
  },

  getSecondaryPort: function (app) {
    if (process.env.LISTEN_FDS > 0) {
      if (process.env.LISTEN_FDS != 2) {
        return false
      }
      return {
        fd: SD_LISTEN_FDS_START + 1
      }
    }
    return app.config.settings.ssl
      ? Number(process.env.PORT) || app.config.settings.port || 3000
      : -7777
  },

  getExternalPort: function (app) {
    if (process.env.EXTERNALPORT > 0) {
      return Number(process.env.EXTERNALPORT)
    }
    return app.config.settings.ssl
      ? Number(process.env.SSLPORT) || app.config.settings.sslport || 3443
      : Number(process.env.PORT) || app.config.settings.port || 3000
  }
}
