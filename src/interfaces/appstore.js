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

import { createDebug } from '../debug'
const debug = createDebug('signalk-server:interfaces:appstore')
const fs = require('fs')
const _ = require('lodash')
const semver = require('semver')
const { gt } = semver
const { installModule, removeModule, getPluginDataSize } = require('../modules')
const {
  isTheServerModule,
  findModulesWithKeyword,
  fetchDistTagsForPackages,
  getLatestServerVersion,
  getAuthor,
  getKeywords
} = require('../modules')
const { SERVERROUTESPREFIX } = require('../constants')
const { getCategories, getAvailableCategories } = require('../categories')
const {
  createCache,
  createIconBytesCache,
  createIconProbeCache,
  createNpmMetadataClient,
  createRawMetricsClient,
  createRegistryClient,
  enrichEntry,
  buildOfflineResponse,
  buildPluginDetail,
  readDetailFromCache,
  badgesToIndicators,
  probeIconUrl
} = require('../appstore')

const bundledAdminUIs = ['@signalk/server-admin-ui']

const npmServerInstallLocations = [
  '/usr/bin/signalk-server',
  '/usr/lib/node_modules/signalk-server/bin/signalk-server',
  '/usr/local/bin/signalk-server',
  '/usr/local/lib/node_modules/signalk-server/bin/signalk-server'
]

// Background worker-pool sizes. Icon probes do a HEAD per candidate URL
// against the npm CDN (cheap, parallelisable up to a small pool); the
// metadata hydrator fetches per-version package.json from registry.npmjs.org
// (slightly heavier, but still fine at modest concurrency) and only runs
// for plugins whose npm-search entry was missing signalk.* — typically
// dozens at a time, not the full list.
const ICON_PROBE_CONCURRENCY = 6
const METADATA_HYDRATE_CONCURRENCY = 8

module.exports = function (app) {
  let moduleInstalling
  const modulesInstalledSinceStartup = {}
  const moduleInstallQueue = []
  const cache = createCache(app.config.configPath)
  const registry = createRegistryClient({
    cacheDir: `${app.config.configPath}/appstore-cache`
  })
  const iconProbe = createIconProbeCache(
    `${app.config.configPath}/appstore-cache`
  )
  const npmMetadata = createNpmMetadataClient(
    `${app.config.configPath}/appstore-cache`
  )
  const iconBytes = createIconBytesCache(
    `${app.config.configPath}/appstore-cache`
  )
  const rawMetrics = createRawMetricsClient(
    `${app.config.configPath}/appstore-cache`
  )
  const iconUrlLookup = (pkg, version, declaredPath) =>
    iconProbe.get(pkg, version, declaredPath)
  // npm's search API does not surface the signalk.* key from package.json,
  // so plugins discovered via findModulesWithKeyword never have appIcon /
  // screenshots / displayName on the ModuleInfo object. For INSTALLED
  // plugins the real package.json is available locally — overlay it when
  // enriching so installed plugins get their declared signalk.* data even
  // though npm search omits it.
  const installedMetadataCache = new Map()

  return {
    start: function () {
      app.post(
        [
          `${SERVERROUTESPREFIX}/appstore/install/:name/:version`,
          `${SERVERROUTESPREFIX}/appstore/install/:org/:name/:version`
        ],
        (req, res) => {
          let name = req.params.name
          const version = req.params.version

          if (req.params.org) {
            name = req.params.org + '/' + name
          }

          findPluginsAndWebapps()
            .then(([plugins, webapps]) => {
              if (
                !isTheServerModule(name, app.config) &&
                !plugins.find(packageNameIs(name)) &&
                !webapps.find(packageNameIs(name))
              ) {
                res.status(404)
                res.json('No such webapp or plugin available:' + name)
              } else {
                if (moduleInstalling) {
                  moduleInstallQueue.push({ name: name, version: version })
                  sendAppStoreChangedEvent()
                } else {
                  installSKModule(name, version)
                }
                res.json(`Installing ${name}...`)
              }
            })
            .catch((error) => {
              console.log(error.message)
              debug.enabled && debug(error.stack)
              res.status(500)
              res.json(error.message)
            })
        }
      )

      app.post(
        [
          `${SERVERROUTESPREFIX}/appstore/remove/:name`,
          `${SERVERROUTESPREFIX}/appstore/remove/:org/:name`
        ],
        (req, res) => {
          let name = req.params.name

          if (req.params.org) {
            name = req.params.org + '/' + name
          }

          findPluginsAndWebapps()
            .then(([plugins, webapps]) => {
              if (
                !plugins.find(packageNameIs(name)) &&
                !webapps.find(packageNameIs(name))
              ) {
                res.status(404)
                res.json('No such webapp or plugin available:' + name)
              } else {
                const deleteData = req.body && req.body.deleteData === true
                if (moduleInstalling) {
                  moduleInstallQueue.push({
                    name: name,
                    isRemove: true,
                    deleteData: deleteData
                  })
                  sendAppStoreChangedEvent()
                } else {
                  removeSKModule(name, deleteData)
                }
                res.json(`Removing ${name}...`)
              }
            })
            .catch((error) => {
              console.log(error.message)
              debug.enabled && debug(error.stack)
              res.status(500)
              res.json(error.message)
            })
        }
      )

      app.get(
        [
          `${SERVERROUTESPREFIX}/appstore/datasize/:name`,
          `${SERVERROUTESPREFIX}/appstore/datasize/:org/:name`
        ],
        async (req, res) => {
          let name = req.params.name
          if (req.params.org) {
            name = req.params.org + '/' + name
          }
          const plugin = getPlugin(name)
          const pluginId = plugin ? plugin.id : undefined
          if (!pluginId) {
            res.json({ totalBytes: 0, fileCount: 0, hasData: false })
            return
          }
          try {
            const dataSize = await getPluginDataSize(
              app.config.configPath,
              pluginId
            )
            res.json(dataSize)
          } catch (error) {
            console.error('Failed to get plugin data size:', error)
            res.json({ totalBytes: 0, fileCount: 0, hasData: false })
          }
        }
      )

      app.get(`${SERVERROUTESPREFIX}/appstore/available/`, (req, res) => {
        const installedNames = getInstalledPackageNames()

        Promise.all([
          findPluginsAndWebapps(),
          getLatestServerVersion(app.config.version).catch(() => '0.0.0'),
          fetchDistTagsForPackages(installedNames).catch(() => ({})),
          registry.getIndex().catch(() => undefined)
        ])
          .then(
            ([[plugins, webapps], serverVersion, distTagsMap, regIndex]) => {
              const result = getAllModuleInfo(
                plugins,
                webapps,
                serverVersion,
                distTagsMap,
                regIndex
              )
              return { result, plugins, webapps }
            }
          )
          .then(({ result, plugins, webapps }) => {
            try {
              cache.writeList(result)
            } catch (err) {
              debug.enabled && debug('writeList failed: %O', err)
            }
            scheduleInstalledDetailRefresh()
            scheduleIconProbe(plugins, webapps)
            res.json(result)
          })
          .catch((error) => {
            console.log(error.message)
            debug.enabled && debug(error.stack)
            res.json(buildOfflineResponse(app, cache))
          })
      })

      app.get(
        [
          `${SERVERROUTESPREFIX}/appstore/plugin/:name`,
          `${SERVERROUTESPREFIX}/appstore/plugin/:org/:name`
        ],
        async (req, res) => {
          let name = req.params.name
          if (req.params.org) {
            name = req.params.org + '/' + name
          }

          try {
            const detail = await loadPluginDetail(name)
            if (!detail) {
              res.status(404).json({
                error: 'Plugin not found',
                name,
                storeAvailable: false
              })
              return
            }
            res.json(detail)
          } catch (err) {
            console.log(err.message)
            debug.enabled && debug(err.stack)
            const cached = readDetailFromCache(cache, name)
            if (cached) {
              res.json({ ...cached, storeAvailable: false, fromCache: true })
              return
            }
            res.status(503).json({
              error:
                'Plugin details not available. Reconnect and refresh to view.',
              name,
              storeAvailable: false
            })
          }
        }
      )

      app.get(
        [
          `${SERVERROUTESPREFIX}/appstore/icon/:name`,
          `${SERVERROUTESPREFIX}/appstore/icon/:org/:name`
        ],
        (req, res) => {
          let name = req.params.name
          if (req.params.org) {
            name = req.params.org + '/' + name
          }
          const stored = iconBytes.read(name)
          if (!stored) {
            res.status(404).json({ error: 'Icon not cached', name })
            return
          }
          res.setHeader('Content-Type', stored.contentType)
          res.setHeader('Cache-Control', 'public, max-age=3600')
          res.setHeader('X-Content-Type-Options', 'nosniff')
          res.sendFile(stored.path)
        }
      )

      app.post(`${SERVERROUTESPREFIX}/appstore/refresh`, (req, res) => {
        cache.invalidateList()
        registry.invalidate()
        iconProbe.invalidate()
        iconBytes.invalidate()
        npmMetadata.invalidate()
        rawMetrics.invalidate()
        installedMetadataCache.clear()
        res.json({ ok: true })
      })

      app.post(
        `${SERVERROUTESPREFIX}/appstore/install-with-deps`,
        async (req, res) => {
          const { name, version } = req.body || {}
          if (!name || typeof name !== 'string') {
            res.status(400).json({ error: 'name is required' })
            return
          }
          try {
            const [plugins, webapps] = await findPluginsAndWebapps()
            const match =
              plugins.find((p) => p.package.name === name) ||
              webapps.find((w) => w.package.name === name)
            if (!match) {
              res.status(404).json({ error: `No such plugin: ${name}` })
              return
            }
            // Reuse loadPluginDetail so signalk.requires is always
            // populated even on a cold cache — npm search strips the
            // signalk.* key, so reading match.package.signalk.requires
            // directly drops dependencies that the detail page sees.
            const detail = await loadPluginDetail(name).catch(() => undefined)
            const required =
              (detail && detail.requires
                ? detail.requires
                    .map((d) => (typeof d === 'string' ? d : d.name))
                    .filter(Boolean)
                : enrichEntry(match.package, { iconUrlLookup }).requires) || []
            const toInstall = []
            for (const dep of required) {
              if (!getPlugin(dep) && !getWebApp(dep)) {
                toInstall.push(dep)
              }
            }
            toInstall.push(name)
            for (const pkgName of toInstall) {
              const pkgVersion =
                pkgName === name
                  ? version
                  : resolveLatestVersion(pkgName, plugins, webapps)
              if (moduleInstalling) {
                moduleInstallQueue.push({
                  name: pkgName,
                  version: pkgVersion
                })
              } else {
                installSKModule(pkgName, pkgVersion)
              }
            }
            sendAppStoreChangedEvent()
            res.json({ queued: toInstall })
          } catch (err) {
            console.log(err.message)
            debug.enabled && debug(err.stack)
            res.status(500).json({ error: err.message })
          }
        }
      )
    },
    stop: () => undefined
  }

  async function loadPluginDetail(name) {
    const [plugins, webapps] = await findPluginsAndWebapps()
    const match =
      plugins.find((p) => p.package.name === name) ||
      webapps.find((w) => w.package.name === name)
    if (!match) {
      const cached = readDetailFromCache(cache, name)
      return cached || null
    }
    const pkg = match.package
    const isInstalled = !!getPlugin(name) || !!getWebApp(name)
    let pkgForEnrichment = pkg
    // Always try the npm registry first — it has the signalk.* key for
    // the LATEST available version, which is what the detail page
    // represents (header version, Update button target, changelog entries).
    // For installed plugins, the on-disk signalk.* is often an older
    // version that may lack screenshots/requires/recommends added in a
    // later release. Fall back to on-disk only when the registry fetch
    // fails or a plugin isn't on npm at all.
    let registryMeta
    try {
      registryMeta = await npmMetadata.get(pkg.name, pkg.version)
    } catch (err) {
      debug.enabled && debug('npm metadata fetch for %s failed: %O', name, err)
    }
    if (registryMeta && registryMeta.signalk) {
      pkgForEnrichment = { ...pkg, signalk: registryMeta.signalk }
    } else if (isInstalled) {
      const installedMeta = getInstalledPackageMetadata(name)
      if (installedMeta && installedMeta.signalk) {
        pkgForEnrichment = { ...pkg, signalk: installedMeta.signalk }
      }
    }

    // Always run the active icon/screenshot probe when we have declared
    // signalk.* paths — the probe cache is how enrichEntry resolves to
    // real CDN URLs instead of the naive package-relative ones.
    if (pkgForEnrichment.signalk) {
      try {
        if (registryMeta && registryMeta.signalk) {
          // Actively probe declared asset paths on the CDN so plugins that
          // publish paths relative to their webapp root (e.g.
          // @signalk/charts-plugin's "./logo.svg" that lives at /public/logo.svg
          // in the tarball) get a working URL in the enriched payload. Cached
          // results are consumed by enrichEntry via iconUrlLookup.
          const signalk = registryMeta.signalk
          const toProbe = []
          if (typeof signalk.appIcon === 'string' && signalk.appIcon.trim()) {
            toProbe.push({ declaredPath: signalk.appIcon.trim(), kind: 'icon' })
          }
          if (Array.isArray(signalk.screenshots)) {
            for (const s of signalk.screenshots) {
              if (typeof s === 'string' && s.trim()) {
                toProbe.push({ declaredPath: s.trim(), kind: 'screenshot' })
              }
            }
          }
          if (toProbe.length > 0) {
            await Promise.all(
              toProbe.map(async (t) => {
                try {
                  const resolved = await probeIconUrl(
                    pkg.name,
                    pkg.version,
                    t.declaredPath,
                    iconProbe
                  )
                  if (
                    resolved &&
                    t.kind === 'icon' &&
                    !iconBytes.read(pkg.name)
                  ) {
                    await iconBytes.download(pkg.name, pkg.version, resolved)
                  }
                } catch (err) {
                  debug.enabled &&
                    debug(
                      'probe %s failed on detail for %s: %O',
                      t.declaredPath,
                      name,
                      err
                    )
                }
              })
            )
          }
        }
      } catch (err) {
        debug.enabled &&
          debug('npm metadata fetch for %s failed: %O', name, err)
      }
    }
    const ext = enrichEntry(pkgForEnrichment, {
      includeIndicators: true,
      iconUrlLookup
    })
    const resolver = buildDependencyResolver(plugins, webapps)
    const [detail, regIndexEntry, metricsSample] = await Promise.all([
      buildPluginDetail(
        {
          name: pkg.name,
          version: pkg.version,
          displayName: ext.displayName,
          appIcon: appIconUrlFor(pkg.name, ext.appIcon),
          screenshots: ext.screenshots || [],
          official: ext.official,
          deprecated: ext.deprecated,
          description: pkg.description,
          author: getAuthor(pkg),
          npmUrl: getNpmUrl({ package: pkg }) || undefined,
          isPlugin: (pkg.keywords || []).some(
            (v) => v === 'signalk-node-server-plugin'
          ),
          isWebapp: (pkg.keywords || []).some((v) => v === 'signalk-webapp'),
          keywords: pkg.keywords || [],
          npmReadme: pkg.readme,
          githubUrl: ext.githubUrl,
          lastReleaseDate: pkg.date,
          requires: ext.requires,
          recommends: ext.recommends
        },
        resolver
      ),
      registry.getIndexEntry(name).catch(() => undefined),
      rawMetrics.get(pkg.name, ext.githubUrl).catch(() => undefined)
    ])

    if (regIndexEntry) {
      const { score, checks } = badgesToIndicators(
        regIndexEntry.badges_stable,
        regIndexEntry.composite_stable
      )
      detail.indicators = {
        score,
        checks,
        rawMetrics: {
          lastReleaseDate: regIndexEntry.last_tested,
          // Registry publishes these as of plugin-registry 0.3.0 so we
          // don't each hit api.github.com/60h from every boat.
          ...(typeof regIndexEntry.stars === 'number'
            ? { stars: regIndexEntry.stars }
            : {}),
          ...(typeof regIndexEntry.open_issues === 'number'
            ? { openIssues: regIndexEntry.open_issues }
            : {}),
          ...(typeof regIndexEntry.contributors === 'number'
            ? { contributors: regIndexEntry.contributors }
            : {}),
          ...(typeof regIndexEntry.downloads_per_week === 'number'
            ? { downloadsPerWeek: regIndexEntry.downloads_per_week }
            : {})
        }
      }
      // plugin-ci matrix from registry >= 0.4.0. Wire-rename from
      // snake_case (registry side) to camelCase (server payload).
      if (regIndexEntry.plugin_ci) {
        detail.pluginCi = regIndexEntry.plugin_ci
      }
    }

    // Direct-API fetch only fills gaps the registry didn't fill. Plugins
    // brand-new between nightly registry runs, or any field the registry
    // failed to fetch for some reason, still get a best-effort refresh.
    if (metricsSample && detail.indicators) {
      const rm = detail.indicators.rawMetrics
      if (rm.stars === undefined && metricsSample.stars !== undefined) {
        rm.stars = metricsSample.stars
      }
      if (
        rm.openIssues === undefined &&
        metricsSample.openIssues !== undefined
      ) {
        rm.openIssues = metricsSample.openIssues
      }
      if (
        rm.contributors === undefined &&
        metricsSample.contributors !== undefined
      ) {
        rm.contributors = metricsSample.contributors
      }
      if (
        rm.downloadsPerWeek === undefined &&
        metricsSample.downloadsPerWeek !== undefined
      ) {
        rm.downloadsPerWeek = metricsSample.downloadsPerWeek
      }
    }

    if (isInstalled) {
      // The local webapp mount at /<pkg-name>/ serves files from the
      // INSTALLED version's tarball on disk. If the installed version is
      // older than the available version we're rendering, declaring paths
      // that the newer version added (e.g. new screenshots) will 404 from
      // that mount. Build local URLs from the on-disk signalk.* (installed
      // version) to keep them in sync with what's actually servable, and
      // only advertise them when the installed version matches the
      // displayed version. For icons specifically we can be more
      // permissive — the appIcon path rarely changes between versions
      // and the installed copy on disk is what the server serves today.
      const installedMeta = getInstalledPackageMetadata(name)
      const localIcons =
        buildLocalAssetUrls(pkg.name, installedMeta) ||
        buildLocalAssetUrls(pkg.name, pkgForEnrichment)
      if (localIcons?.appIcon) detail.installedIconUrl = localIcons.appIcon
      const installedVersion =
        getPlugin(name)?.version || getWebApp(name)?.version
      if (
        installedVersion === pkg.version &&
        localIcons?.screenshots &&
        localIcons.screenshots.length > 0
      ) {
        detail.installedScreenshotUrls = localIcons.screenshots
      }
    }
    cache.writePluginDetail(detail, isInstalled)
    return detail
  }

  function getInstalledPackageMetadata(name) {
    if (installedMetadataCache.has(name)) {
      return installedMetadataCache.get(name)
    }
    const webapp = getWebApp(name)
    // app.webapps[i] is already the full package.json metadata
    if (webapp && typeof webapp === 'object' && webapp.signalk) {
      installedMetadataCache.set(name, webapp)
      return webapp
    }
    const plugin = getPlugin(name)
    if (plugin && plugin.packageLocation) {
      try {
        // packageLocation is the parent directory; append /package.json.
        // Read the file directly rather than require()-ing it because
        // require() caches by absolute path indefinitely — after a
        // plugin install/update, a subsequent require() for the same
        // path returns the pre-update package.json until the process
        // restarts, even after we clear installedMetadataCache.
        const pkgPath = `${plugin.packageLocation}/${name}/package.json`
        const metadata = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        installedMetadataCache.set(name, metadata)
        return metadata
      } catch (err) {
        debug.enabled &&
          debug('failed to read installed package.json for %s: %O', name, err)
      }
    }
    if (webapp && typeof webapp === 'object') {
      installedMetadataCache.set(name, webapp)
      return webapp
    }
    // Don't cache the negative result. If we did, an install/update
    // happening later in the same per-request lifetime wouldn't be
    // visible until the next /appstore/refresh.
    return undefined
  }

  // Webapps and plugins that ship static assets are mounted by the server at
  // /<package-name>/, so declared paths that look wrong against unpkg's raw
  // tarball layout (e.g. freeboard-sk's "./assets/icons/icon-72x72.png" which
  // is actually at "/public/assets/icons/icon-72x72.png" inside the tarball)
  // resolve correctly against the mounted serving root. Reuse that URL
  // scheme for installed plugins so the App Store card matches what Webapps
  // shows elsewhere in the admin UI.
  function buildLocalAssetUrl(pkgName, declaredPath) {
    if (!declaredPath || typeof declaredPath !== 'string') return undefined
    if (/^(https?:)?\/\//i.test(declaredPath)) return declaredPath
    if (declaredPath.startsWith('data:')) return declaredPath
    const cleaned = declaredPath.replace(/^\.\//, '')
    return `/${pkgName}/${cleaned}`
  }

  // When the background probe + downloader has cached a plugin's icon
  // locally, route the card/detail <img> through the server's own icon
  // route so the browser never has to reach unpkg. This makes the grid
  // render instantly on a boat with no internet after a one-time warmup.
  // When bytes aren't cached yet, pass the CDN URL through unchanged.
  function appIconUrlFor(pkgName, cdnUrl) {
    if (!pkgName) return cdnUrl
    if (iconBytes.read(pkgName)) {
      return `${SERVERROUTESPREFIX}/appstore/icon/${pkgName}`
    }
    return cdnUrl
  }

  function buildLocalAssetUrls(pkgName, pkg) {
    const signalk = pkg && pkg.signalk
    if (!signalk || typeof signalk !== 'object') return undefined
    const appIcon =
      typeof signalk.appIcon === 'string' && signalk.appIcon.trim()
        ? buildLocalAssetUrl(pkgName, signalk.appIcon.trim())
        : undefined
    let screenshots
    if (Array.isArray(signalk.screenshots)) {
      screenshots = signalk.screenshots
        .filter((s) => typeof s === 'string' && s.trim())
        .map((s) => buildLocalAssetUrl(pkgName, s.trim()))
        .filter(Boolean)
    }
    if (!appIcon && (!screenshots || screenshots.length === 0)) return undefined
    return { appIcon, screenshots }
  }

  function resolveLatestVersion(name, plugins, webapps) {
    const match =
      plugins.find((p) => p.package.name === name) ||
      webapps.find((w) => w.package.name === name)
    return match ? match.package.version : undefined
  }

  function buildDependencyResolver(plugins, webapps) {
    const byName = new Map()
    for (const p of plugins) byName.set(p.package.name, p.package)
    for (const w of webapps) byName.set(w.package.name, w.package)
    return (name) => {
      const pkg = byName.get(name)
      const installed = !!getPlugin(name) || !!getWebApp(name)
      if (!pkg) {
        return { installed }
      }
      const ext = enrichEntry(pkg, { iconUrlLookup })
      return {
        displayName: ext.displayName,
        appIcon: appIconUrlFor(name, ext.appIcon),
        installed
      }
    }
  }

  function scheduleInstalledDetailRefresh() {
    const installedNames = getInstalledPackageNames()
    if (installedNames.length === 0) return
    setImmediate(() => {
      installedNames.forEach((name) => {
        loadPluginDetail(name).catch(
          (err) =>
            debug.enabled &&
            debug('background detail refresh for %s failed: %O', name, err)
        )
      })
    })
  }

  function collectIconProbeTasks(plugins, webapps) {
    const tasks = []
    const queuedKey = new Set()
    for (const list of [plugins, webapps]) {
      for (const mod of list) {
        const pkg = mod.package
        const signalk = pkg.signalk
        if (!signalk || typeof signalk !== 'object') continue
        const entries = []
        if (typeof signalk.appIcon === 'string' && signalk.appIcon.trim()) {
          entries.push({ declaredPath: signalk.appIcon.trim(), kind: 'icon' })
        }
        if (Array.isArray(signalk.screenshots)) {
          for (const s of signalk.screenshots) {
            if (typeof s === 'string' && s.trim()) {
              entries.push({ declaredPath: s.trim(), kind: 'screenshot' })
            }
          }
        }
        for (const entry of entries) {
          const key = `${pkg.name}@${pkg.version}@${entry.declaredPath}`
          if (queuedKey.has(key)) continue
          if (
            iconProbe.get(pkg.name, pkg.version, entry.declaredPath) !==
            undefined
          )
            continue
          queuedKey.add(key)
          tasks.push({
            name: pkg.name,
            version: pkg.version,
            declaredPath: entry.declaredPath,
            kind: entry.kind
          })
        }
      }
    }
    return tasks
  }

  async function runIconProbeTasks(tasks) {
    let i = 0
    async function worker() {
      while (true) {
        const idx = i++
        if (idx >= tasks.length) return
        const t = tasks[idx]
        try {
          const resolved = await probeIconUrl(
            t.name,
            t.version,
            t.declaredPath,
            iconProbe
          )
          // Persist the icon bytes locally so the grid renders from the
          // server's own origin — fast, offline-friendly, and the
          // plugin-author CDN URL never goes to the user's browser.
          // Screenshots stay remote (larger + only viewed on detail).
          if (resolved && t.kind === 'icon') {
            const existing = iconBytes.read(t.name)
            if (!existing) {
              await iconBytes.download(t.name, t.version, resolved)
            }
          }
        } catch (err) {
          debug.enabled && debug('icon probe %s failed: %O', t.name, err)
        }
      }
    }
    await Promise.all(
      Array.from({ length: ICON_PROBE_CONCURRENCY }, () => worker())
    )
  }

  // For non-installed plugins whose npm-search entry lacks signalk.* (because
  // the /-/v1/search endpoint strips it), hydrate the registry metadata in
  // the background so subsequent list responses have appIcon/displayName/
  // requires/recommends cached and ready. Hydrated metadata feeds the icon
  // probe below so the Grid view shows real icons without waiting for the
  // user to open the detail page.
  async function hydrateNonInstalledMetadata(plugins, webapps) {
    const queue = []
    for (const list of [plugins, webapps]) {
      for (const mod of list) {
        const pkg = mod.package
        if (pkg.signalk && typeof pkg.signalk === 'object') continue
        if (!pkg.name || !pkg.version) continue
        queue.push(mod)
      }
    }
    if (queue.length === 0) return
    debug.enabled &&
      debug('hydrating %d non-installed npm metadata records', queue.length)
    let i = 0
    async function worker() {
      while (true) {
        const idx = i++
        if (idx >= queue.length) return
        const mod = queue[idx]
        const pkg = mod.package
        try {
          const meta = await npmMetadata.get(pkg.name, pkg.version)
          if (
            meta &&
            meta.signalk &&
            typeof meta.signalk === 'object' &&
            !pkg.signalk
          ) {
            pkg.signalk = meta.signalk
          }
        } catch (err) {
          debug.enabled && debug('hydrate %s failed: %O', pkg.name, err)
        }
      }
    }
    await Promise.all(
      Array.from({ length: METADATA_HYDRATE_CONCURRENCY }, () => worker())
    )
  }

  function scheduleIconProbe(plugins, webapps) {
    setImmediate(async () => {
      try {
        await hydrateNonInstalledMetadata(plugins, webapps)
      } catch (err) {
        debug.enabled && debug('metadata hydration run failed: %O', err)
      }
      const tasks = collectIconProbeTasks(plugins, webapps)
      if (tasks.length === 0) return
      debug.enabled && debug('scheduling %d icon probes', tasks.length)
      runIconProbeTasks(tasks).catch(
        (err) => debug.enabled && debug('icon probe run failed: %O', err)
      )
    })
  }

  function findPluginsAndWebapps() {
    return Promise.all([
      findModulesWithKeyword('signalk-node-server-plugin'),
      findModulesWithKeyword('signalk-embeddable-webapp'),
      findModulesWithKeyword('signalk-webapp')
    ]).then(([plugins, embeddableWebapps, webapps]) => {
      const allWebapps = []
        .concat(embeddableWebapps)
        .concat(webapps)
        .filter((m) => !bundledAdminUIs.includes(m.package.name))
      return [
        plugins,
        _.uniqBy(allWebapps, (plugin) => {
          return plugin.package.name
        })
      ]
    })
  }

  function getInstalledPackageNames() {
    return [
      ...new Set(
        [
          ...(app.plugins || []).map((p) => p.packageName),
          ...(app.webapps || []).map((w) => w.name),
          ...(app.addons || []).map((a) => a.name),
          ...(app.embeddablewebapps || []).map((e) => e.name)
        ].filter(Boolean)
      )
    ]
  }

  function getPlugin(id) {
    return app.plugins.find((plugin) => plugin.packageName === id)
  }

  function getWebApp(id) {
    return (
      (app.webapps && app.webapps.find((webapp) => webapp.name === id)) ||
      (app.addons && app.addons.find((webapp) => webapp.name === id)) ||
      (app.embeddablewebapps &&
        app.embeddablewebapps.find((webapp) => webapp.name === id))
    )
  }

  function emptyAppStoreInfo(storeAvailable = true) {
    return {
      available: [],
      installed: [],
      updates: [],
      installing: [],
      categories: getAvailableCategories(),
      storeAvailable: storeAvailable,
      isInDocker: process.env.IS_IN_DOCKER === 'true'
    }
  }

  function getAllModuleInfo(
    plugins,
    webapps,
    serverVersion,
    distTagsMap = {},
    regIndex
  ) {
    const all = emptyAppStoreInfo()
    const regLookup = new Map()
    if (regIndex?.plugins) {
      for (const entry of regIndex.plugins) {
        regLookup.set(entry.name, entry)
      }
    }

    if (
      process.argv.length > 1 &&
      (npmServerInstallLocations.includes(process.argv[1]) ||
        process.env.SIGNALK_SERVER_IS_UPDATABLE) &&
      !process.env.SIGNALK_DISABLE_SERVER_UPDATES
    ) {
      all.canUpdateServer = !all.isInDocker && true
      if (gt(serverVersion, app.config.version)) {
        all.serverUpdate = serverVersion

        const info = {
          name: app.config.name,
          version: serverVersion,
          description: app.config.description,
          author: getAuthor(app.config),
          npmUrl: null,
          isPlugin: false,
          isWebapp: false
        }

        if (moduleInstallQueue.find((p) => p.name === info.name)) {
          info.isWaiting = true
          all.installing.push(info)
        } else if (modulesInstalledSinceStartup[info.name]) {
          if (moduleInstalling && moduleInstalling.name === info.name) {
            info.isInstalling = true
          } else if (modulesInstalledSinceStartup[info.name].code !== 0) {
            info.installFailed = true
          }
          all.installing.push(info)
        }
      }
    } else {
      all.canUpdateServer = false
    }

    getModulesInfo(plugins, getPlugin, all, distTagsMap, regLookup)
    getModulesInfo(webapps, getWebApp, all, distTagsMap, regLookup)

    if (process.env.PLUGINS_WITH_UPDATE_DISABLED) {
      const disabled = process.env.PLUGINS_WITH_UPDATE_DISABLED.split(',')
      all.updates.forEach((info) => {
        if (disabled.includes(info.name)) {
          info.updateDisabled = true
        }
      })
    }

    return all
  }

  function getModulesInfo(modules, existing, result, distTagsMap, regLookup) {
    modules.forEach((plugin) => {
      const name = plugin.package.name
      const version = plugin.package.version

      if (!semver.valid(version)) {
        console.warn(
          `Skipping ${name}: invalid semver version '${version}'. ` +
            `Please inform the plugin developer to publish a valid semver version.`
        )
        return
      }

      const installedLocally =
        !!getPlugin(name) || !!getWebApp(name) || !!existing(name)
      // Prefer the latest-version signalk.* (populated on plugin.package by
      // the background npm-metadata hydrator). For installed plugins, fall
      // back to on-disk metadata when hydration hasn't run yet — this keeps
      // the card populated on the first /appstore/available after a cold
      // cache, before the hydrator finishes. Local icon URLs (served from
      // the installed plugin's own /<name>/<path> mount) continue to use
      // on-disk paths so they always work offline even when the declared
      // path changed between versions.
      let packageForEnrichment = plugin.package
      let localIcons
      if (installedLocally) {
        const installedMeta = getInstalledPackageMetadata(name)
        if (!plugin.package.signalk && installedMeta && installedMeta.signalk) {
          packageForEnrichment = {
            ...plugin.package,
            signalk: installedMeta.signalk
          }
        }
        localIcons =
          buildLocalAssetUrls(name, installedMeta) ||
          buildLocalAssetUrls(name, plugin.package)
      }
      const ext = enrichEntry(packageForEnrichment, { iconUrlLookup })
      const pluginInfo = {
        name: name,
        version: version,
        description: plugin.package.description,
        author: getAuthor(plugin.package),
        categories: getCategories(plugin.package),
        updated: plugin.package.date,
        keywords: getKeywords(plugin.package),
        npmUrl: getNpmUrl(plugin),
        isPlugin: plugin.package.keywords.some(
          (v) => v === 'signalk-node-server-plugin'
        ),
        isWebapp: plugin.package.keywords.some((v) => v === 'signalk-webapp'),
        isEmbeddableWebapp: plugin.package.keywords.some(
          (v) => v === 'signalk-embeddable-webapp'
        ),
        displayName: ext.displayName,
        appIcon: appIconUrlFor(name, ext.appIcon),
        installedIconUrl: localIcons?.appIcon,
        screenshots: ext.screenshots,
        // Only advertise installedScreenshotUrls when the installed version
        // matches the displayed version — otherwise the local webapp mount
        // 404s on screenshots that only exist in the newer tarball.
        installedScreenshotUrls:
          installedLocally &&
          (getPlugin(name)?.version || getWebApp(name)?.version) === version
            ? localIcons?.screenshots
            : undefined,
        official: ext.official,
        deprecated: ext.deprecated,
        githubUrl: ext.githubUrl,
        issuesUrl: ext.issuesUrl,
        requires: ext.requires,
        recommends: ext.recommends
      }

      const regEntry = regLookup && regLookup.get(name)
      if (regEntry) {
        const { score, checks } = badgesToIndicators(
          regEntry.badges_stable,
          regEntry.composite_stable
        )
        pluginInfo.indicators = {
          score,
          checks,
          rawMetrics: {
            lastReleaseDate: regEntry.last_tested,
            // Upstream metrics published by signalk-plugin-registry >= 0.3.0.
            // Surfaced on the card so e.g. "★5" renders next to the score
            // without each boat hitting api.github.com.
            ...(typeof regEntry.stars === 'number'
              ? { stars: regEntry.stars }
              : {}),
            ...(typeof regEntry.open_issues === 'number'
              ? { openIssues: regEntry.open_issues }
              : {}),
            ...(typeof regEntry.contributors === 'number'
              ? { contributors: regEntry.contributors }
              : {}),
            ...(typeof regEntry.downloads_per_week === 'number'
              ? { downloadsPerWeek: regEntry.downloads_per_week }
              : {})
          }
        }
        pluginInfo.registryBadges = regEntry.badges_stable || []
        pluginInfo.registryTestStatus = regEntry.test_status
        // plugin-ci matrix from registry >= 0.4.0. List entries get it
        // too so the card can show a small "5/5 green" indicator
        // without an extra detail-page round-trip.
        if (regEntry.plugin_ci) {
          pluginInfo.pluginCi = regEntry.plugin_ci
        }
      }

      const tags = distTagsMap[name]
      if (tags) {
        let highest = null
        for (const [tag, tagVersion] of Object.entries(tags)) {
          if (tag === 'latest') continue
          const parsed = semver.parse(tagVersion)
          if (
            parsed &&
            parsed.prerelease.length > 0 &&
            semver.gt(
              `${parsed.major}.${parsed.minor}.${parsed.patch}`,
              version
            )
          ) {
            if (!highest || semver.gt(tagVersion, highest)) {
              highest = tagVersion
            }
          }
        }
        if (highest) {
          pluginInfo.prereleaseVersion = highest
        }
      }

      const installedModule = existing(name)

      if (installedModule) {
        pluginInfo.id = installedModule.id
        pluginInfo.installedVersion = installedModule.version
      }

      if (moduleInstallQueue.find((p) => p.name === name)) {
        pluginInfo.isWaiting = true
        addIfNotDuplicate(result.installing, pluginInfo)
      } else if (modulesInstalledSinceStartup[name]) {
        if (moduleInstalling && moduleInstalling.name === name) {
          if (moduleInstalling.isRemove) {
            pluginInfo.isRemoving = true
          } else {
            pluginInfo.isInstalling = true
          }
        } else if (modulesInstalledSinceStartup[name].code !== 0) {
          pluginInfo.installFailed = true
          addIfNotDuplicate(result.available, pluginInfo)
        }
        pluginInfo.isRemove = modulesInstalledSinceStartup[name].isRemove
        addIfNotDuplicate(result.installing, pluginInfo)
      } else if (installedModule) {
        if (
          semver.valid(installedModule.version) &&
          gt(version, installedModule.version)
        ) {
          addIfNotDuplicate(result.updates, pluginInfo)
        } else if (!semver.valid(installedModule.version)) {
          console.warn(
            `Installed module ${name} has invalid semver version '${installedModule.version}'. ` +
              `Please inform the plugin developer.`
          )
        }
        addIfNotDuplicate(result.installed, pluginInfo)
      }
      addIfNotDuplicate(result.available, pluginInfo)

      return result
    })
  }

  function addIfNotDuplicate(theArray, moduleInfo) {
    if (!theArray.find((p) => p.name === moduleInfo.name)) {
      theArray.push(moduleInfo)
    }
  }

  function getNpmUrl(moduleInfo) {
    const npm = _.get(moduleInfo.package, 'links.npm')
    return npm || null
  }

  function sendAppStoreChangedEvent() {
    findPluginsAndWebapps().then(([plugins, webapps]) => {
      getLatestServerVersion(app.config.version)
        .then((serverVersion) =>
          getAllModuleInfo(plugins, webapps, serverVersion)
        )
        .then((result) => {
          app.emit('serverevent', {
            type: 'APP_STORE_CHANGED',
            from: 'signalk-server',
            data: result
          })
        })
    })
  }

  function installSKModule(module, version) {
    if (isTheServerModule(module, app.config)) {
      try {
        app.providers.forEach((providerHolder) => {
          if (
            typeof providerHolder.pipeElements[0].pipeline[0].options
              .filename !== 'undefined'
          ) {
            debug.enabled && debug('close file connection:', providerHolder.id)
            providerHolder.pipeElements[0].end()
          }
        })
      } catch (err) {
        debug.enabled && debug(err)
      }
    }
    updateSKModule(module, version, false)
  }

  function removeSKModule(module, deleteData) {
    const plugin = getPlugin(module)
    const pluginId = plugin ? plugin.id : undefined
    updateSKModule(module, null, true, pluginId, deleteData)
  }

  function updateSKModule(module, version, isRemove, pluginId, deleteData) {
    moduleInstalling = {
      name: module,
      output: [],
      version: version,
      isRemove: isRemove
    }
    modulesInstalledSinceStartup[module] = moduleInstalling

    sendAppStoreChangedEvent()

    const onData = (output) => {
      modulesInstalledSinceStartup[module].output.push(output)
      console.log(`stdout: ${output}`)
    }
    const onErr = (output) => {
      modulesInstalledSinceStartup[module].output.push(output)
      console.error(`stderr: ${output}`)
    }
    const onClose = (code) => {
      debug.enabled && debug('close: ' + module)
      modulesInstalledSinceStartup[module].code = code
      moduleInstalling = undefined
      debug.enabled && debug(`child process exited with code ${code}`)

      if (isRemove && pluginId) {
        delete app.providerStatus[pluginId]
      }

      if (moduleInstallQueue.length) {
        const next = moduleInstallQueue.splice(0, 1)[0]
        if (next.isRemove) {
          removeSKModule(next.name, next.deleteData)
        } else {
          installSKModule(next.name, next.version)
        }
      }

      sendAppStoreChangedEvent()
    }

    if (isRemove) {
      removeModule(
        app.config,
        module,
        version,
        onData,
        onErr,
        onClose,
        pluginId,
        deleteData
      )
    } else {
      installModule(app.config, module, version, onData, onErr, onClose)
    }
  }
}

function packageNameIs(name) {
  return (x) => x.package.name === name
}
