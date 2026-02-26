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

import express, { Application, Request, Response } from 'express'
import fs from 'fs'
import { uniqBy } from 'lodash'
import path from 'path'
import { Config } from '../config/config'
import { SERVERROUTESPREFIX } from '../constants'
import { createDebug } from '../debug'
import { modulesWithKeyword, NpmPackageData } from '../modules'

const debug = createDebug('signalk-server:interfaces:webapps')

const PLUGIN_KEYWORDS = [
  'signalk-node-server-plugin',
  'signalk-wasm-plugin'
] as const

interface PluginEntry {
  id: string
  packageName: string
}

interface PluginOptions {
  enabled?: boolean
}

interface WebappsApp extends Application {
  config: Config
  webapps: NpmPackageData[]
  embeddablewebapps: NpmPackageData[]
  addons: NpmPackageData[]
  pluginconfigurators: NpmPackageData[]
  plugins?: PluginEntry[]
  getPluginOptions?: (id: string) => PluginOptions
}

function isPluginWebapp(metadata: NpmPackageData): boolean {
  return (
    metadata.keywords?.some((k) =>
      PLUGIN_KEYWORDS.includes(k as (typeof PLUGIN_KEYWORDS)[number])
    ) ?? false
  )
}

function isPluginEnabled(app: WebappsApp, metadata: NpmPackageData): boolean {
  if (!app.plugins) {
    return true
  }
  const plugin = app.plugins.find((p) => p.packageName === metadata.name)
  if (!plugin) {
    return true
  }
  const options = app.getPluginOptions?.(plugin.id)
  return options?.enabled ?? false
}

function filterEnabledWebapps(
  app: WebappsApp,
  webapps: NpmPackageData[]
): NpmPackageData[] {
  return webapps.filter(
    (webapp) => !isPluginWebapp(webapp) || isPluginEnabled(app, webapp)
  )
}

function mountWebModules(app: WebappsApp, keyword: string): NpmPackageData[] {
  debug(`mountWebModules:${keyword}`)
  const modules = modulesWithKeyword(app.config, keyword)
  modules.forEach((moduleData) => {
    let webappPath = path.join(moduleData.location, moduleData.module)
    if (fs.existsSync(webappPath + '/public/')) {
      webappPath += '/public/'
    }
    debug('Mounting web module /' + moduleData.module + ':' + webappPath)
    app.use('/' + moduleData.module, express.static(webappPath))
  })
  return modules.map((moduleData) => moduleData.metadata as NpmPackageData)
}

function mountApis(app: WebappsApp): void {
  app.get(`${SERVERROUTESPREFIX}/webapps`, (_req: Request, res: Response) => {
    const allWebapps = [...app.webapps, ...app.embeddablewebapps]
    res.json(uniqBy(filterEnabledWebapps(app, allWebapps), 'name'))
  })
  app.get(`${SERVERROUTESPREFIX}/addons`, (_req: Request, res: Response) => {
    res.json(app.addons)
  })
}

module.exports = (app: WebappsApp) => {
  return {
    start() {
      // Preserve any existing webapps (e.g., from WASM plugins loaded earlier)
      const existingWebapps = app.webapps || []
      const nodeWebapps = mountWebModules(app, 'signalk-webapp')
      app.webapps = uniqBy([...nodeWebapps, ...existingWebapps], 'name')

      app.addons = mountWebModules(app, 'signalk-node-server-addon')

      const existingEmbeddableWebapps = app.embeddablewebapps || []
      const nodeEmbeddableWebapps = mountWebModules(
        app,
        'signalk-embeddable-webapp'
      )
      app.embeddablewebapps = uniqBy(
        [...nodeEmbeddableWebapps, ...existingEmbeddableWebapps],
        'name'
      )

      app.pluginconfigurators = mountWebModules(
        app,
        'signalk-plugin-configurator'
      )

      mountApis(app)
    },

    stop() {}
  }
}
