import { AsyncLocalStorage } from 'node:async_hooks'
import { ServerAPI, WebappRegistration } from '@signalk/server-api'
import { Package } from './modules'

interface Webapp extends Package {
  keywords: string[]
  signalk: WebappRegistration
}

interface WebappsHost {
  webapps?: Package[]
}

type WebappAPI = Pick<ServerAPI, 'registerWebapp' | 'unregisterWebapp'>

const lifecycle = new AsyncLocalStorage<{
  owner: PluginWebapps
  generation: symbol
}>()

/** Each registrar can only modify its own entries in the existing webapp list. */
export class PluginWebapps {
  private readonly entries = new Map<string, Webapp>()
  private generation: symbol | null = null

  constructor(
    private readonly app: WebappsHost,
    private readonly pluginId: string,
    private readonly metadata: Pick<Package, 'version'> &
      Partial<Pick<Package, 'license' | 'author'>>,
    private readonly api: Partial<WebappAPI> = {}
  ) {
    Object.assign(api, this.apiFor(null))
  }

  /** Runs plugin startup with an API scoped to that activation. */
  start(start: () => void): void {
    this.stop()
    const generation = Symbol()
    this.generation = generation
    Object.assign(this.api, this.apiFor(generation))
    try {
      // Old timers and promises remain scoped even if they read the shared API again.
      lifecycle.run({ owner: this, generation }, start)
    } catch (error) {
      this.stop()
      throw error
    }
  }

  /** Invalidates this activation before withdrawing its registrations. */
  stop(): void {
    this.generation = null
    this.clear()
  }

  private apiFor(generation: symbol | null): WebappAPI {
    return {
      registerWebapp: (id, options) => this.register(id, options, generation),
      unregisterWebapp: (id) => this.unregister(id, generation)
    }
  }

  private isCurrent(generation: symbol | null): boolean {
    const caller = lifecycle.getStore()
    return (
      generation !== null &&
      generation === this.generation &&
      (caller?.owner !== this || caller.generation === generation)
    )
  }

  /** Publishes validated metadata only for the current plugin activation. */
  register(
    id: string,
    options: WebappRegistration,
    generation = this.generation
  ): string {
    if (!this.isCurrent(generation)) {
      throw new Error(
        'Webapp registration requires the active plugin lifecycle'
      )
    }
    if (
      typeof id !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id)
    ) {
      throw new Error('Webapp id must contain only letters, digits, _ or -')
    }
    if (
      typeof options.displayName !== 'string' ||
      !options.displayName.trim()
    ) {
      throw new Error('Webapp displayName must be a nonempty string')
    }
    if (
      options.description !== undefined &&
      typeof options.description !== 'string'
    ) {
      throw new Error('Webapp description must be a string')
    }
    if (
      options.appIcon !== undefined &&
      (typeof options.appIcon !== 'string' ||
        !/^[a-zA-Z0-9_./-]+$/.test(options.appIcon) ||
        options.appIcon.startsWith('/') ||
        options.appIcon.split('/').includes('..'))
    ) {
      throw new Error('Webapp appIcon must be a relative path without ..')
    }
    const name = `plugins/${this.pluginId}/webapps/${id}`
    const webapps = (this.app.webapps ??= [])
    const previous = this.entries.get(id)
    if (webapps.some((entry) => entry.name === name && entry !== previous)) {
      throw new Error(`Webapp already registered: ${name}`)
    }
    const entry: Webapp = {
      name,
      version: this.metadata.version,
      license: this.metadata.license ?? '',
      author: this.metadata.author,
      description: options.description ?? '',
      dependencies: {},
      keywords: ['signalk-webapp'],
      signalk: { ...options }
    }
    if (previous) {
      Object.assign(previous, entry)
    } else {
      this.entries.set(id, entry)
      webapps.push(entry)
    }
    return `/${name}/`
  }

  /** Ignores stale removals so an old callback cannot affect a new activation. */
  unregister(id: string, generation = this.generation): void {
    if (this.isCurrent(generation)) this.remove(id)
  }

  private remove(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    const webapps = this.app.webapps
    const index = webapps?.indexOf(entry) ?? -1
    if (index !== -1) webapps?.splice(index, 1)
    this.entries.delete(id)
  }

  /** Withdraws owned entries without changing the current activation. */
  clear(): void {
    for (const id of this.entries.keys()) this.remove(id)
  }
}
