import { constants } from 'fs'
import { access, mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

export class Store {
  private filePath: string = ''
  private fileName: string = ''

  constructor(filePath: string, fileName: string = 'settings.json') {
    this.filePath = filePath
    this.fileName = fileName
    this.init().catch(error => {
      console.log(
        `Could not initialise ${path.join(this.filePath, this.fileName)}`
      )
      console.log(error)
    })
  }

  async read(): Promise<any> {
    try {
      const data = await readFile(
        path.join(this.filePath, this.fileName),
        'utf8'
      )
      return JSON.parse(data)
    } catch (error) {
      throw error
    }
  }

  write(data: any): Promise<any> {
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
    } catch (error) {
      try {
        await mkdir(this.filePath, { recursive: true })
      } catch (error) {
        console.log(`Error: Unable to create ${this.filePath}`)
      }
    }
  }
}
