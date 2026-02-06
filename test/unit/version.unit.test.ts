import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const loadWithSatisfies = (
  satisfiesImpl: (version: string, range: string) => boolean
) => {
  const semverPath = require.resolve('semver')
  const versionPath = require.resolve('../../src/version')
  const originalSemver = require.cache[semverPath]

  require.cache[semverPath] = {
    id: semverPath,
    filename: semverPath,
    loaded: true,
    exports: { satisfies: satisfiesImpl }
  }

  delete require.cache[versionPath]
  const loaded = require('../../src/version')
  const checkNodeVersion = loaded.default || loaded

  return {
    checkNodeVersion,
    restore: () => {
      if (originalSemver) {
        require.cache[semverPath] = originalSemver
      } else {
        delete require.cache[semverPath]
      }
      delete require.cache[versionPath]
    }
  }
}

describe('version', () => {
  const envBackup = { ...process.env }

  beforeEach(() => {
    delete process.env.SKIP_NODE_VERSION_CHECK
  })

  afterEach(() => {
    process.env = { ...envBackup }
  })

  it('skips checks when SKIP_NODE_VERSION_CHECK is set', () => {
    const { checkNodeVersion, restore } = loadWithSatisfies(() => false)
    process.env.SKIP_NODE_VERSION_CHECK = '1'

    let warned = false
    const originalWarn = console.warn
    console.warn = () => {
      warned = true
    }

    try {
      checkNodeVersion()
      expect(warned).to.equal(false)
    } finally {
      console.warn = originalWarn
      restore()
    }
  })

  it('exits when the minimum node version is not satisfied', () => {
    const { checkNodeVersion, restore } = loadWithSatisfies(
      (_version, range) => range !== '>=18'
    )

    let exitCode: number | undefined
    let errorMessage = ''
    const originalExit = process.exit
    const originalError = console.error

    process.exit = ((code?: number) => {
      exitCode = code
      return undefined as never
    }) as typeof process.exit

    console.error = ((message?: unknown) => {
      errorMessage = String(message)
    }) as typeof console.error

    try {
      checkNodeVersion()
      expect(exitCode).to.equal(1)
      expect(errorMessage).to.match(/older than the minimum required version/i)
    } finally {
      process.exit = originalExit
      console.error = originalError
      restore()
    }
  })

  it('warns when the recommended node version is not satisfied', () => {
    const { checkNodeVersion, restore } = loadWithSatisfies(
      (_version, range) => range !== '22'
    )

    let warningMessage = ''
    const originalWarn = console.warn
    console.warn = ((message?: unknown) => {
      warningMessage = String(message)
    }) as typeof console.warn

    try {
      checkNodeVersion()
      expect(warningMessage).to.match(/different than the recommended version/i)
    } finally {
      console.warn = originalWarn
      restore()
    }
  })
})
