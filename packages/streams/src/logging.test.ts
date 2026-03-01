import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getFullLogDir, listLogFiles, getLogger } from './logging'
import type { LoggingApp } from './logging'

function createLoggingApp(
  overrides: Partial<LoggingApp['config']> = {}
): LoggingApp {
  return {
    config: {
      configPath: overrides.configPath ?? '/tmp/test-signalk',
      settings: {
        loggingDirectory: overrides.settings?.loggingDirectory,
        keepMostRecentLogsOnly: overrides.settings?.keepMostRecentLogsOnly,
        logCountToKeep: overrides.settings?.logCountToKeep
      }
    }
  }
}

describe('logging', () => {
  describe('getFullLogDir', () => {
    it('uses configPath when no loggingDirectory is set', () => {
      const app = createLoggingApp({ configPath: '/tmp/my-config' })
      expect(getFullLogDir(app)).to.equal('/tmp/my-config')
    })

    it('uses loggingDirectory from settings when set (absolute)', () => {
      const app = createLoggingApp({
        configPath: '/tmp/my-config',
        settings: { loggingDirectory: '/var/log/signalk' }
      })
      expect(getFullLogDir(app)).to.equal('/var/log/signalk')
    })

    it('resolves relative loggingDirectory against configPath', () => {
      const app = createLoggingApp({
        configPath: '/tmp/my-config',
        settings: { loggingDirectory: 'logs' }
      })
      expect(getFullLogDir(app)).to.equal('/tmp/my-config/logs')
    })

    it('uses explicit logdir parameter when provided', () => {
      const app = createLoggingApp({ configPath: '/tmp/my-config' })
      expect(getFullLogDir(app, '/custom/dir')).to.equal('/custom/dir')
    })

    it('resolves relative logdir parameter against configPath', () => {
      const app = createLoggingApp({ configPath: '/tmp/my-config' })
      expect(getFullLogDir(app, 'relative-dir')).to.equal(
        '/tmp/my-config/relative-dir'
      )
    })
  })

  describe('listLogFiles', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-log-test-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('lists only matching log files', (done) => {
      fs.writeFileSync(path.join(tmpDir, 'skserver-raw_2024-01-15T12.log'), '')
      fs.writeFileSync(path.join(tmpDir, 'skserver-raw_2024-01-16T13.log'), '')
      fs.writeFileSync(path.join(tmpDir, 'other-file.txt'), '')
      fs.writeFileSync(path.join(tmpDir, 'README.md'), '')

      const app = createLoggingApp({ configPath: tmpDir })
      listLogFiles(app, (err, files) => {
        expect(err).to.equal(undefined)
        expect(files).to.have.length(2)
        expect(files).to.include('skserver-raw_2024-01-15T12.log')
        expect(files).to.include('skserver-raw_2024-01-16T13.log')
        done()
      })
    })

    it('returns error for non-existent directory', (done) => {
      const app = createLoggingApp({ configPath: '/nonexistent/path' })
      listLogFiles(app, (err) => {
        expect(err).to.not.equal(undefined)
        done()
      })
    })

    it('returns empty array for directory with no log files', (done) => {
      const app = createLoggingApp({ configPath: tmpDir })
      listLogFiles(app, (err, files) => {
        expect(err).to.equal(undefined)
        expect(files).to.have.length(0)
        done()
      })
    })
  })

  describe('getLogger', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-log-test-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('returns a function that writes log messages', (done) => {
      const app = createLoggingApp({
        configPath: tmpDir,
        settings: { keepMostRecentLogsOnly: false }
      })
      const logger = getLogger(app, 'test')

      logger('hello log message')

      setTimeout(() => {
        const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.log'))
        expect(files.length).to.be.greaterThan(0)

        const content = fs.readFileSync(path.join(tmpDir, files[0]!), 'utf8')
        expect(content).to.include('test')
        expect(content).to.include('hello log message')
        done()
      }, 500)
    })

    it('writes JSON for messages with updates property', (done) => {
      const app = createLoggingApp({
        configPath: tmpDir,
        settings: { keepMostRecentLogsOnly: false }
      })
      const logger = getLogger(app, 'delta')

      const delta = { updates: [{ values: [{ path: 'a', value: 1 }] }] }
      logger(delta)

      setTimeout(() => {
        const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.log'))
        expect(files.length).to.be.greaterThan(0)

        const content = fs.readFileSync(path.join(tmpDir, files[0]!), 'utf8')
        expect(content).to.include('"updates"')
        expect(content).to.include('delta')
        done()
      }, 500)
    })
  })
})
