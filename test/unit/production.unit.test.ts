import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type AppLike = {
  config: {
    environment?: string
    debug?: boolean
    settings: { accessLogging?: boolean }
  }
  get: (key: string) => string
  use: (middleware: unknown) => void
}

describe('config/production', () => {
  let originalMorgan: NodeJS.Module | undefined
  let originalErrorHandler: NodeJS.Module | undefined

  const loadProduction = () => {
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
      exports: () => {
        return { type: 'errorhandler' }
      }
    }

    delete require.cache[require.resolve('../../src/config/production')]
    return require('../../src/config/production') as (app: AppLike) => void
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

  it('registers middleware when in production', () => {
    const middlewares: unknown[] = []
    const app: AppLike = {
      config: { settings: {} },
      get: () => 'production',
      use: (middleware) => {
        middlewares.push(middleware)
      }
    }

    const production = loadProduction()
    production(app)

    expect(app.config.environment).to.equal('production')
    expect(app.config.debug).to.equal(false)
    expect(middlewares).to.have.length(2)
    const morgan = middlewares[0] as { format: string }
    expect(morgan.format).to.equal('combined')
  })

  it('disables access logging when configured', () => {
    const middlewares: unknown[] = []
    const app: AppLike = {
      config: { settings: { accessLogging: false } },
      get: () => 'production',
      use: (middleware) => {
        middlewares.push(middleware)
      }
    }

    const production = loadProduction()
    production(app)

    const morgan = middlewares[0] as { options: { skip?: () => boolean } }
    expect(typeof morgan.options.skip).to.equal('function')
    expect(morgan.options.skip?.()).to.equal(true)
  })
})
