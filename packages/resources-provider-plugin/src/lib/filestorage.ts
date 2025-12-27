/* eslint-disable @typescript-eslint/no-explicit-any */
import { constants } from 'fs'
import {
  access,
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile
} from 'fs/promises'
import path from 'path'
import { IResourceStore, StoreRequestParams } from '../types'
import { passFilter, processParameters } from './utils'
import { Resource } from '@signalk/server-api'

export const getUuid = (skIdentifier: string) =>
  skIdentifier.split(':').slice(-1)[0]

// File Resource Store Class
export class FileStore implements IResourceStore {
  savePath: string
  resources: any
  pkg: { id: string }
  private initPromise: Promise<{ error: boolean; message: string }> | null =
    null

  constructor(
    pluginId: string,
    private debug: (s: any) => void
  ) {
    this.savePath = ''
    this.resources = {}
    this.pkg = { id: pluginId }
  }

  // Wait for initialization to complete before performing operations
  private async waitForInit(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise
    }
  }

  // check / create path to persist resources
  init(config: any): Promise<{ error: boolean; message: string }> {
    // Store the init promise so operations can wait for it
    this.initPromise = this.doInit(config)
    return this.initPromise
  }

  private async doInit(config: any): Promise<{ error: boolean; message: string }> {
    if (typeof config.settings.path === 'undefined') {
      this.savePath = config.basePath + '/resources'
    } else if (config.settings.path[0] === '/') {
      this.savePath = config.settings.path
    } else {
      this.savePath = path.join(config.basePath, config.settings.path)
    }
    // std resources
    if (config.settings.standard) {
      Object.keys(config.settings.standard).forEach((i: any) => {
        this.resources[i] = { path: path.join(this.savePath, `/${i}`) }
      })
    }
    // other resources
    const enabledResTypes: any = {}
    Object.assign(enabledResTypes, config.settings.standard)
    if (config.settings.custom && Array.isArray(config.settings.custom)) {
      config.settings.custom.forEach((i: any) => {
        this.resources[i.name] = {
          path: path.join(this.savePath, `/${i.name}`)
        }
        enabledResTypes[i.name] = true
      })
    }

    try {
      await this.checkPath(this.savePath)
    } catch (_error) {
      throw new Error(`Unable to create ${this.savePath}!`)
    }
    return await this.createSavePaths(enabledResTypes)
  }

  // create save paths for resource types
  async createSavePaths(
    resTypes: any
  ): Promise<{ error: boolean; message: string }> {
    this.debug('** Initialising resource storage **')
    const result = { error: false, message: `` }
    for (const t of Object.keys(this.resources)) {
      if (resTypes[t]) {
        try {
          await access(this.resources[t].path, constants.W_OK | constants.R_OK)
          this.debug(`${this.resources[t].path} - OK....`)
        } catch (_error) {
          this.debug(`${this.resources[t].path} NOT available...`)
          this.debug(`Creating ${this.resources[t].path} ...`)
          try {
            await mkdir(this.resources[t].path, { recursive: true })
            this.debug(`Created ${this.resources[t].path} - OK....`)
          } catch (_error) {
            result.error = true
            result.message += `ERROR creating ${this.resources[t].path} folder\r\n `
          }
        }
      }
    }
    return result
  }

  // return resource or property value of supplied resource id
  async getResource(
    type: string,
    itemUuid: string,
    property?: string
  ): Promise<Resource<object>> {
    await this.waitForInit()
    try {
      let result = JSON.parse(
        await readFile(path.join(this.resources[type].path, itemUuid), 'utf8')
      )
      if (property) {
        const value = property.split('.').reduce((acc, val) => {
          return acc[val]
        }, result)
        if (value) {
          result = { value: value }
        } else {
          throw new Error(`${type}/${itemUuid}.${property} not found!`)
        }
      }
      const stats = await stat(path.join(this.resources[type].path, itemUuid))
      return {
        ...result,
        timestamp: stats.mtime,
        $source: this.pkg.id
      }
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        throw new Error(`No such resource ${type} ${itemUuid}`)
      }
      console.error(e)
      throw new Error(`Error retrieving resource ${type} ${itemUuid}`)
    }
  }

  // return persisted resources from storage
  async getResources(
    type: string,
    params: any
  ): Promise<{ [key: string]: Resource<any> }> {
    await this.waitForInit()
    const result: any = {}
    // ** parse supplied params
    params = processParameters(params)
    try {
      // return matching resources
      const rt = this.resources[type]
      const files = await readdir(rt.path, { withFileTypes: true })
      // check resource count
      const fcount =
        params.limit && files.length > params.limit
          ? params.limit
          : files.length
      let count = 0
      for (const f in files) {
        if (!files[f].isFile()) {
          this.debug(`${files[f].name} is not a File => ignore.`)
          continue
        }
        if (++count > fcount) {
          break
        }
        try {
          const res = JSON.parse(
            await readFile(path.join(rt.path, files[f].name), 'utf8')
          )
          // apply param filters
          if (passFilter(res, type, params)) {
            const uuid = files[f].name
            const stats = await stat(path.join(rt.path, files[f].name))
            result[uuid] = {
              ...res,
              timestamp: stats.mtime,
              $source: this.pkg.id
            }
          }
        } catch (err) {
          console.error(err)
          throw new Error(`Invalid file contents: ${files[f]}`)
        }
      }
      return result
    } catch (error) {
      console.error(error)
      throw new Error(
        `Error retrieving resources from ${this.savePath}. Ensure plugin is active or restart plugin!`
      )
    }
  }

  // save / delete (r.value==null) resource file
  async setResource(r: StoreRequestParams): Promise<void> {
    await this.waitForInit()
    const fname = getUuid(r.id)
    const p = path.join(this.resources[r.type].path, fname)

    if (r.value === null) {
      // delete file
      try {
        await unlink(p)
        this.debug(`** DELETED: ${r.type} entry ${fname} **`)
        return
      } catch (error) {
        console.error('Error deleting resource!')
        ;(error as Error).message = 'Error deleting resource!'
        throw error
      }
    } else {
      // add / update file
      try {
        await writeFile(p, JSON.stringify(r.value))
        this.debug(`** ${r.type} written to ${fname} **`)
        return
      } catch (error) {
        console.error('Error updating resource!')
        throw error
      }
    }
  }

  // check path exists / create it if it doesn't
  async checkPath(path: string = this.savePath): Promise<boolean | Error> {
    if (!path) {
      throw new Error(`Path not supplied!`)
    }
    try {
      await access(
        // check path exists
        path,
        constants.W_OK | constants.R_OK
      )
      this.debug(`${path} - OK...`)
      return true
    } catch (_error) {
      // if not then create it
      this.debug(`${path} does NOT exist...`)
      this.debug(`Creating ${path} ...`)
      try {
        await mkdir(path, { recursive: true })
        this.debug(`Created ${path} - OK...`)
        return true
      } catch (_error) {
        throw new Error(`Unable to create ${path}!`)
      }
    }
  }
}
