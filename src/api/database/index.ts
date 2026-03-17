import {
  DatabaseApi,
  DatabaseProvider,
  DatabaseProviders,
  isDatabaseProvider,
  PluginDb,
  WithDatabaseApi
} from '@signalk/server-api'
import { IRouter } from 'express'
import { Request, Response } from 'express'
import { createDebug } from '../../debug'
import { WithSecurityStrategy } from '../../security'
import { Responses } from '../'
import { isBetterSqliteAvailable, SqliteProvider } from './sqliteprovider'
import { isNodeSqliteAvailable, NodeSqliteProvider } from './nodesqliteprovider'

const debug = createDebug('signalk-server:api:database')

const DATABASE_API_PATH = `/signalk/v2/api/database`

const BUILTIN_ID = '_builtin'
const BUILTIN_NODESQLITE_ID = '_builtin_nodesqlite'

interface DatabaseApplication extends WithSecurityStrategy, IRouter {
  config: { configPath: string }
}

export class DatabaseApiHttpRegistry {
  private providers: Map<string, DatabaseProvider> = new Map()
  private defaultProviderId?: string
  private proxy: DatabaseApi

  constructor(private app: DatabaseApplication & WithDatabaseApi) {
    this.proxy = {
      getPluginDb: (pluginId: string): Promise<PluginDb> => {
        return this.defaultProvider().getPluginDb(pluginId)
      }
    }
    app.getDatabaseApi = () => this.proxy
  }

  getDatabaseApi(): DatabaseApi {
    return this.proxy
  }

  registerDatabaseProvider(pluginId: string, provider: DatabaseProvider): void {
    if (!isDatabaseProvider(provider)) {
      throw new Error('Invalid database provider')
    }
    if (!this.providers.has(pluginId)) {
      this.providers.set(pluginId, provider)
    }
    if (
      !this.defaultProviderId ||
      this.defaultProviderId === BUILTIN_ID ||
      this.defaultProviderId === BUILTIN_NODESQLITE_ID
    ) {
      this.defaultProviderId = pluginId
    }
    debug(
      `Registered database provider ${pluginId},`,
      `total=${this.providers.size},`,
      `default=${this.defaultProviderId}`
    )
  }

  unregisterDatabaseProvider(pluginId: string): void {
    if (!pluginId || !this.providers.has(pluginId)) {
      return
    }
    const provider = this.providers.get(pluginId)
    this.providers.delete(pluginId)
    if (pluginId === this.defaultProviderId) {
      this.defaultProviderId =
        this.providers.size > 0 ? this.providers.keys().next().value : undefined
    }
    if (provider) {
      provider.close().catch((err) => {
        debug(`Error closing provider ${pluginId}:`, err)
      })
    }
    debug(
      `Unregistered database provider ${pluginId},`,
      `total=${this.providers.size},`,
      `default=${this.defaultProviderId}`
    )
  }

  start() {
    const configPath = this.app.config.configPath

    // Prefer node:sqlite (>=22.5.0, zero dependencies) over better-sqlite3
    if (isNodeSqliteAvailable()) {
      try {
        const nodeSqliteProvider = new NodeSqliteProvider(configPath)
        this.providers.set(BUILTIN_NODESQLITE_ID, nodeSqliteProvider)
        this.defaultProviderId = BUILTIN_NODESQLITE_ID
        debug('Registered built-in node:sqlite provider (default)')
      } catch (err) {
        debug('node:sqlite provider not available:', err)
      }
    }

    if (isBetterSqliteAvailable()) {
      try {
        const builtinProvider = new SqliteProvider(configPath)
        this.providers.set(BUILTIN_ID, builtinProvider)
        if (!this.defaultProviderId) {
          this.defaultProviderId = BUILTIN_ID
        }
        debug(
          `Registered built-in better-sqlite3 provider` +
            (this.defaultProviderId === BUILTIN_ID
              ? ' (default)'
              : ' (fallback)')
        )
      } catch (err) {
        debug('better-sqlite3 provider not available:', err)
      }
    }

    this.app.get(
      `${DATABASE_API_PATH}/_providers`,
      async (_req: Request, res: Response) => {
        const r: DatabaseProviders = {}
        this.providers.forEach((_v, k) => {
          r[k] = { isDefault: k === this.defaultProviderId }
        })
        res.status(200).json(r)
      }
    )

    this.app.get(
      `${DATABASE_API_PATH}/_providers/_default`,
      async (_req: Request, res: Response) => {
        res.status(200).json({ id: this.defaultProviderId })
      }
    )

    this.app.post(
      `${DATABASE_API_PATH}/_providers/_default/:id`,
      async (req: Request, res: Response) => {
        try {
          if (
            !this.app.securityStrategy.shouldAllowPut(
              req,
              'vessels.self',
              null,
              'database'
            )
          ) {
            res.status(403).json(Responses.unauthorised)
            return
          }
          if (!req.params.id) {
            throw new Error('Provider id not supplied!')
          }
          if (this.providers.has(req.params.id)) {
            this.defaultProviderId = req.params.id
            res.status(200).json({
              statusCode: 200,
              state: 'COMPLETED',
              message: `Default provider set to ${req.params.id}.`
            })
          } else {
            throw new Error(`Provider ${req.params.id} not found!`)
          }
        } catch (err: unknown) {
          res.status(400).json({
            statusCode: 400,
            state: 'FAILED',
            message: err instanceof Error ? err.message : 'Unknown error'
          })
        }
      }
    )
  }

  async stop(): Promise<void> {
    const closePromises = Array.from(this.providers.entries()).map(
      ([id, provider]) =>
        provider.close().catch((err) => {
          debug(`Error closing provider ${id}:`, err)
        })
    )
    await Promise.all(closePromises)
    this.providers.clear()
  }

  async getServerDb(): Promise<PluginDb> {
    const provider = this.defaultProvider()
    if (provider.getServerDb) {
      return provider.getServerDb()
    }
    // Default provider doesn't support getServerDb() — fall back to a built-in
    for (const id of [BUILTIN_NODESQLITE_ID, BUILTIN_ID]) {
      const builtin = this.providers.get(id)
      if (builtin?.getServerDb) {
        return builtin.getServerDb()
      }
    }
    throw new Error('No database provider supports server-internal storage')
  }

  private defaultProvider(): DatabaseProvider {
    if (this.defaultProviderId && this.providers.has(this.defaultProviderId)) {
      return this.providers.get(this.defaultProviderId)!
    }
    throw new Error('No database provider configured')
  }
}
