import { randomUUID } from 'crypto'
import { IRouter, Request, Response } from 'express'
import fs from 'fs'
import { uniqBy } from 'lodash'
import path from 'path'
import { BUNDLED_ADMIN_UI, findAppStoreModules } from './appstore/search'
import { atomicWriteFileSync } from './atomicWrite'
import { SERVERROUTESPREFIX } from './constants'
import { createDebug } from './debug'
import { NpmPackageData } from './modules'

const debug = createDebug('signalk-server:usage-statistics')

// Backups leave this file out: the consent and the installation id belong to
// this device, not to one that a backup is restored on.
export const USAGE_STATISTICS_FILE = 'usage-statistics.json'
const REPORT_URL = 'https://usage.signalk.org/v1/report'
const ROUTE = `${SERVERROUTESPREFIX}/settings/usageStatistics`
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const FIRST_RETRY_DELAY = 5 * MINUTE

type InstalledPackage = Pick<NpmPackageData, 'name' | 'version'>

interface UsageStatisticsSettings {
  enabled: boolean
  installationId?: string
  lastSent?: number
}

export interface UsageStatisticsApp extends IRouter {
  config: { configPath: string; version: string }
  getPluginOptions: (id: string) => { enabled?: boolean }
  // Missing when their interface is turned off in the settings
  plugins?: { id: string; packageName: string; version: string }[]
  webapps?: InstalledPackage[]
  embeddablewebapps?: InstalledPackage[]
}

const settingsFile = (app: UsageStatisticsApp) =>
  path.join(app.config.configPath, USAGE_STATISTICS_FILE)

function readSettings(app: UsageStatisticsApp): UsageStatisticsSettings {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(app), 'utf8'))
  } catch {
    return { enabled: false }
  }
}

function writeSettings(
  app: UsageStatisticsApp,
  settings: UsageStatisticsSettings
) {
  atomicWriteFileSync(settingsFile(app), JSON.stringify(settings, null, 2))
}

const status = (app: UsageStatisticsApp) => ({
  enabled: readSettings(app).enabled,
  answered: fs.existsSync(settingsFile(app))
})

const releaseVersion = (version: string) => version.split(/[-+]/)[0]

// Each file exists on some systems only; a missing one leaves its fields out
function readSystemFile(file: string) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

export function systemDescription(read = readSystemFile) {
  const venusVersion = read('/opt/victronenergy/version')?.split('\n')[0]
  const osRelease = read('/etc/os-release') ?? ''
  const osReleaseField = (name: string) =>
    osRelease.match(new RegExp(`^${name}="?([^"\n]*)`, 'm'))?.[1]
  return {
    hardware: read('/proc/device-tree/model')
      ?.replace(/\0/g, '')
      .replace(/ Rev [\d.]+$/, ''),
    distro: venusVersion ? 'venus' : osReleaseField('ID'),
    distroVersion: venusVersion || osReleaseField('VERSION_ID'),
    docker: process.env.IS_IN_DOCKER === 'true'
  }
}

export async function usageReport(
  app: UsageStatisticsApp,
  installationId?: string
) {
  const { plugins, webapps } = await findAppStoreModules()
  const listed = new Set(
    [...plugins, ...webapps].map((module) => module.package.name)
  )
  const installedPlugins = (app.plugins ?? []).map((plugin) => ({
    name: plugin.packageName,
    version: releaseVersion(plugin.version),
    enabled: app.getPluginOptions(plugin.id).enabled ?? false
  }))
  const installedWebapps = uniqBy(
    [...(app.webapps ?? []), ...(app.embeddablewebapps ?? [])],
    'name'
  )
    .filter((webapp) => webapp.name !== BUNDLED_ADMIN_UI)
    .map((webapp) => ({
      name: webapp.name,
      version: releaseVersion(webapp.version)
    }))
  const unlisted = new Set(
    [...installedPlugins, ...installedWebapps]
      .map((module) => module.name)
      .filter((name) => !listed.has(name))
  )
  return {
    installationId,
    signalkVersion: releaseVersion(app.config.version),
    nodeVersion: process.versions.node,
    os: process.platform,
    arch: process.arch,
    ...systemDescription(),
    plugins: installedPlugins.filter((plugin) => listed.has(plugin.name)),
    webapps: installedWebapps.filter((webapp) => listed.has(webapp.name)),
    unlistedCount: unlisted.size
  }
}

async function sendReport(app: UsageStatisticsApp, installationId?: string) {
  const response = await fetch(
    process.env.SIGNALK_USAGE_STATISTICS_URL ?? REPORT_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(await usageReport(app, installationId)),
      signal: AbortSignal.timeout(MINUTE)
    }
  )
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
}

/**
 * Returns a function to call every minute that sends the report when it is
 * due. The first send is at a random moment within an hour after `start`, so
 * the collector can't tell when the server started. It reads the file on
 * every call: that is how the admin's choice reaches it.
 */
export function usageReportSender(app: UsageStatisticsApp, start: number) {
  let nextTry = start + Math.random() * HOUR
  let retryDelay = FIRST_RETRY_DELAY
  return async (now: number) => {
    const settings = readSettings(app)
    const due = Math.max(nextTry, (settings.lastSent ?? 0) + DAY)
    if (!settings.enabled || now < due) {
      return
    }
    nextTry = now + retryDelay
    retryDelay = Math.min(2 * retryDelay, DAY)
    try {
      await sendReport(app, settings.installationId)
      nextTry = now + DAY
      retryDelay = FIRST_RETRY_DELAY
      // reread: the admin may have changed the choice during the send
      writeSettings(app, { ...readSettings(app), lastSent: now })
    } catch (err) {
      debug(`sending the usage report failed: ${err}`)
    }
  }
}

export function startUsageStatistics(app: UsageStatisticsApp) {
  const sendIfDue = usageReportSender(app, Date.now())
  return setInterval(() => sendIfDue(Date.now()), MINUTE)
}

export function mountUsageStatisticsApi(app: UsageStatisticsApp) {
  app.get(ROUTE, (_req: Request, res: Response) => {
    res.json(status(app))
  })

  app.put(ROUTE, (req: Request, res: Response) => {
    const { enabled } = req.body
    if (typeof enabled !== 'boolean') {
      res.status(400).type('text/plain').send('enabled must be true or false')
      return
    }
    try {
      // an installation that already shares keeps its id
      writeSettings(
        app,
        enabled
          ? { installationId: randomUUID(), ...readSettings(app), enabled }
          : { enabled }
      )
    } catch (err) {
      res
        .status(500)
        .type('text/plain')
        .send(`Unable to save the choice: ${(err as Error).message}`)
      return
    }
    res.json(status(app))
  })

  app.get(`${ROUTE}/report`, (_req: Request, res: Response) => {
    usageReport(app, readSettings(app).installationId).then(
      (report) => res.json(report),
      (err: Error) =>
        res
          .status(503)
          .type('text/plain')
          .send(`App Store list not available: ${err.message}`)
    )
  })
}
