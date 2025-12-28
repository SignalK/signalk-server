import fs from 'fs'
import path from 'path'

interface InterfaceModule {
  (app: unknown): {
    start: () => void
    stop?: () => void
  }
}

interface InterfaceExports {
  [key: string]: InterfaceModule
}

const interfaces: InterfaceExports = {}

fs.readdirSync(__dirname + '/')
  .filter((file) => file.match(/.+\.js$/g) !== null && file !== 'index.js')
  .forEach((file) => {
    const name = file.replace('.js', '')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require(path.join(__dirname, file))
    // Handle both ES module default exports and CommonJS exports
    interfaces[name] = module.default || module
  })

export = interfaces
