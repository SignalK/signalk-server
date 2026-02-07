import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type AppLike = {
  config: {
    environment?: string
    settings: { accessLogging?: boolean }
  }
  get: (key: string) => string
  use: (middleware: unknown) => void
}

describe('config/development', () => {
  let originalMorgan: NodeJS.Module | undefined
  let originalErrorHandler: NodeJS.Module | undefined

  const loadDevelopment = () => {
    const morganPath = require.resolve('morgan')
    const errorHandlerPath = require.resolve('errorhandler')

    originalMorgan = require.cache[morganPath]
    originalErrorHandler = require.cache[errorHandlerPath]

    require.cache[morganPath] = {
      id: morganPath,
      filename: morganPath,
      loaded: true,
      exports: (format: string, options: { skip?: () => boolean }) => {
        return { format, options }
      }
    }

    require.cache[errorHandlerPath] = {
      id: errorHandlerPath,
      filename: errorHandlerPath,
      loaded: true,
      exports: (options: { dumpExceptions: boolean; showStack: boolean }) => {
        return { options }
      }
    }

    delete require.cache[require.resolve('../../src/config/development')]
    return require('../../src/config/development') as (app: AppLike) => void
  }

  const restoreModules = () => {
    const morganPath = require.resolve('morgan')
    const errorHandlerPath = require.resolve('errorhandler')

    if (originalMorgan) {
      require.cache[morganPath] = originalMorgan
    } else {
      delete require.cache[morganPath]
    }

    if (originalErrorHandler) {
      require.cache[errorHandlerPath] = originalErrorHandler
    } else {
      delete require.cache[errorHandlerPath]
    }
  }

  afterEach(() => {
    restoreModules()
  })

  it('registers middleware when in development', () => {
    const middlewares: unknown[] = []
    const app: AppLike = {
      config: { settings: {} },
      get: () => 'development',
      use: (middleware) => {
        middlewares.push(middleware)
      }
    }

    const development = loadDevelopment()
    development(app)

    expect(app.config.environment).to.equal('development')
    expect(middlewares).to.have.length(2)
    const errorHandler = middlewares[0] as { options: { showStack: boolean } }
    expect(errorHandler.options.showStack).to.equal(true)
    const morgan = middlewares[1] as { format: string }
    expect(morgan.format).to.equal('dev')
  })

  it('disables access logging when configured', () => {
    const middlewares: unknown[] = []
    const app: AppLike = {
      config: { settings: { accessLogging: false } },
      get: () => 'development',
      use: (middleware) => {
        middlewares.push(middleware)
      }
    }

    const development = loadDevelopment()
    development(app)

    const morgan = middlewares[1] as { options: { skip?: () => boolean } }
    expect(typeof morgan.options.skip).to.equal('function')
    expect(morgan.options.skip?.()).to.equal(true)
  })
})
