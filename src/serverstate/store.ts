import { constants } from 'fs'
import { access, mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { WithConfig } from '../app'

export const SERVERSTATEDIRNAME = 'serverState'

export class Store {
  private filePath = ''
  private fileName = ''
  private initPromise: Promise<void> | null = null

  constructor(
    server: WithConfig,
    storePath: string,
    fileName = 'settings.json'
  ) {
    this.filePath = path.join(
      server.config.configPath,
      SERVERSTATEDIRNAME,
      storePath
    )
    this.fileName = fileName
    this.initPromise = this.init().catch((error) => {
      console.log(
        `Could not initialise ${path.join(this.filePath, this.fileName)}`
      )
      console.log(error)
    })
  }

  // Wait for initialization to complete before performing operations
  async waitForInit(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async read(): Promise<any> {
    await this.waitForInit()
    const data = await readFile(path.join(this.filePath, this.fileName), 'utf8')
    return JSON.parse(data)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async write(data: any) {
    await this.waitForInit()
    return writeFile(
      path.join(this.filePath, this.fileName),
      JSON.stringify(data)
    )
  }

  private async init() {
    try {
      /* tslint:disable:no-bitwise */
      await access(this.filePath, constants.R_OK | constants.W_OK)
      /* tslint:enable:no-bitwise */
    } catch (_error) {
      try {
        await mkdir(this.filePath, { recursive: true })
      } catch (_error) {
        console.log(`Error: Unable to create ${this.filePath}`)
      }
    }
  }
}
