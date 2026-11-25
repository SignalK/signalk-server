import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { setTimeout as delay } from 'timers/promises'
import CanboatJs from './canboatjs'
import {
  createMockApp,
  collectStreamOutput,
  createDebugStub
} from './test-helpers'
import { getFullLogDir, listLogFiles, getLogger } from './logging'
import type { LoggingApp } from './logging'
import { FileTimestampStreamWithDelete } from './logging'
import { compressLogFile } from './log-compressor'
import { gunzipSync } from 'zlib'

function createLoggingApp(
  overrides: Partial<LoggingApp['config']> = {}
): LoggingApp {
  return {
    config: {
      configPath: overrides.configPath ?? '/tmp/test-signalk',
      settings: {
        loggingDirectory: overrides.settings?.loggingDirectory,
        keepMostRecentLogsOnly: overrides.settings?.keepMostRecentLogsOnly,
        logCountToKeep: overrides.settings?.logCountToKeep,
        compressOldLogs: overrides.settings?.compressOldLogs
      }
    }
  }
}

async function waitForFile(
  dir: string,
  matches: (name: string) => boolean,
  timeoutMs = 5000
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found = fs.readdirSync(dir).find(matches)
    if (found) {
      return found
    }
    await delay(20)
  }
  throw new Error(
    `Timed out waiting for a matching file, saw: ${fs.readdirSync(dir).join(', ')}`
  )
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

    const readLogPayload = async () => {
      const deadline = Date.now() + 1500
      while (Date.now() < deadline) {
        const file = fs
          .readdirSync(tmpDir)
          .find((name) => name.endsWith('.log'))
        if (file) {
          const content = fs.readFileSync(path.join(tmpDir, file), 'utf8')
          if (content.endsWith('\n')) {
            return content.trimEnd().split(';').slice(2).join(';')
          }
        }
        await delay(10)
      }
      throw new Error('Timed out waiting for a complete log record')
    }

    it('retains a parsed NMEA 2000 message without updates', async () => {
      const stream = new CanboatJs({
        app: createMockApp(),
        providerId: 'test-provider',
        createDebug: createDebugStub()
      })
      const output = collectStreamOutput(stream)
      stream.end(
        '2024-01-01T00:00:00.000Z,2,127250,204,255,8,00,10,6e,01,00,ff,7f,fd'
      )
      const messages = await output
      expect(messages).to.have.length(1)
      expect(messages[0]).to.have.property('pgn', 127250)
      expect(messages[0]).not.to.have.property('updates')
      getLogger(
        createLoggingApp({
          configPath: tmpDir,
          settings: { keepMostRecentLogsOnly: false }
        }),
        'A'
      )(messages[0])
      expect(JSON.parse(await readLogPayload())).to.deep.equal(messages[0])
    })

    it('retains object fields and embedded binary bytes', async () => {
      const message = {
        source: 'sensor',
        data: Buffer.from([0, 128, 255]),
        label: 'a;b'
      }
      getLogger(
        createLoggingApp({
          configPath: tmpDir,
          settings: { keepMostRecentLogsOnly: false }
        }),
        'test'
      )(message)
      expect(JSON.parse(await readLogPayload())).to.deep.equal({
        source: 'sensor',
        data: { type: 'Buffer', data: [0, 128, 255] },
        label: 'a;b'
      })
    })

    it('keeps text buffers in the same format as text input', async () => {
      const sentence = '$GPGLL,4916.45,N,12311.12,W,225444,A,*1D'
      getLogger(
        createLoggingApp({
          configPath: tmpDir,
          settings: { keepMostRecentLogsOnly: false }
        }),
        'N'
      )(Buffer.from(sentence))
      expect(await readLogPayload()).to.equal(sentence)
    })

    it('returns a function that writes log messages', function (done) {
      this.timeout(2000)
      const app = createLoggingApp({
        configPath: tmpDir,
        settings: { keepMostRecentLogsOnly: false }
      })
      const logger = getLogger(app, 'test')

      logger('hello log message')

      const check = setInterval(() => {
        const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.log'))
        if (files.length > 0) {
          const content = fs.readFileSync(path.join(tmpDir, files[0]!), 'utf8')
          if (content.includes('hello log message')) {
            clearInterval(check)
            expect(content).to.include('test')
            done()
          }
        }
      }, 10)
    })

    it('writes JSON for messages with updates property', function (done) {
      this.timeout(2000)
      const app = createLoggingApp({
        configPath: tmpDir,
        settings: { keepMostRecentLogsOnly: false }
      })
      const logger = getLogger(app, 'delta')

      const delta = { updates: [{ values: [{ path: 'a', value: 1 }] }] }
      logger(delta)

      const check = setInterval(() => {
        const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.log'))
        if (files.length > 0) {
          const content = fs.readFileSync(path.join(tmpDir, files[0]!), 'utf8')
          if (content.includes('"updates"')) {
            clearInterval(check)
            expect(content).to.include('delta')
            done()
          }
        }
      }, 10)
    })
  })

  describe('log compression', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-log-test-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('compresses a log file and removes the original', async () => {
      const file = path.join(tmpDir, 'skserver-raw_2024-01-15T12.log')
      const content = '1700000000000;N;$GPGLL,4916.45,N\n'
      fs.writeFileSync(file, content)

      const compressed = await compressLogFile(file)

      expect(compressed).to.equal(`${file}.gz`)
      expect(fs.existsSync(file)).to.equal(false)
      expect(gunzipSync(fs.readFileSync(compressed)).toString()).to.equal(
        content
      )
    })

    it('leaves no archive behind when the source cannot be read', async () => {
      let error: Error | undefined
      try {
        await compressLogFile(path.join(tmpDir, 'missing.log'))
      } catch (e) {
        error = e as Error
      }
      expect(error).to.not.equal(undefined)
      expect(fs.readdirSync(tmpDir)).to.have.length(0)
    })

    it('keeps an existing archive when the source cannot be read', async function () {
      if (process.getuid?.() === 0) {
        this.skip()
      }
      const file = path.join(tmpDir, 'skserver-raw_2024-01-15T12.log')
      const archive = `${file}.gz`
      fs.writeFileSync(file, 'unreadable hour\n')
      fs.writeFileSync(archive, 'earlier hour')
      fs.chmodSync(file, 0o000)

      try {
        let error: Error | undefined
        try {
          await compressLogFile(file)
        } catch (e) {
          error = e as Error
        }
        expect(error).to.not.equal(undefined)
        expect(fs.readFileSync(archive, 'utf8')).to.equal('earlier hour')
        expect(fs.existsSync(file)).to.equal(true)
      } finally {
        fs.chmodSync(file, 0o644)
      }
    })

    it('never replaces a staging copy left behind by an interrupted run', async () => {
      const file = path.join(tmpDir, 'skserver-raw_2024-01-15T12.log')
      const leftoverDir = path.join(tmpDir, '.compress-abandoned')
      fs.mkdirSync(leftoverDir)
      const leftover = path.join(leftoverDir, 'skserver-raw_2024-01-15T12.log')
      fs.writeFileSync(leftover, 'records from the interrupted run\n')
      fs.writeFileSync(file, 'records from this run\n')

      const compressed = await compressLogFile(file)

      expect(fs.readFileSync(leftover, 'utf8')).to.equal(
        'records from the interrupted run\n'
      )
      expect(gunzipSync(fs.readFileSync(compressed)).toString()).to.equal(
        'records from this run\n'
      )
    })

    it('keeps the source when it grew after the copy read it', async () => {
      const file = path.join(tmpDir, 'skserver-raw_2024-01-15T12.log')
      const content = '1700000000000;N;$GPGLL,4916.45,N\n'
      fs.writeFileSync(file, content)

      // A larger source size after the copy stands in for records that landed
      // after the read reached the end of the file.
      const realStat = fs.promises.stat
      fs.promises.stat = ((p: fs.PathLike) =>
        realStat(p).then((stats) =>
          String(p).includes(`${path.sep}.compress-`)
            ? Object.assign(stats, { size: Number(stats.size) + 1 })
            : stats
        )) as typeof fs.promises.stat
      try {
        let error: Error | undefined
        try {
          await compressLogFile(file)
        } catch (e) {
          error = e as Error
        }
        expect(error?.message).to.match(/grew while it was being compressed/)
        expect(fs.readFileSync(file, 'utf8')).to.equal(content)
        expect(fs.existsSync(`${file}.gz`)).to.equal(false)
      } finally {
        fs.promises.stat = realStat
      }
    })

    it('keeps records a writer appends through a handle opened before the copy', async () => {
      const file = path.join(tmpDir, 'skserver-raw_2024-01-15T12.log')
      // Large enough that the copy is still running when the append lands.
      fs.writeFileSync(file, '1700000000000;N;filler\n'.repeat(200000))
      const handle = fs.openSync(file, 'a')

      const compression = compressLogFile(file)
      fs.writeSync(handle, '1700000001000;N;late record\n')
      fs.closeSync(handle)

      let archived = ''
      try {
        const compressed = await compression
        archived = gunzipSync(fs.readFileSync(compressed)).toString()
      } catch {
        // Refusing to archive the file is the other safe outcome.
      }
      const restored = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
      expect(
        archived.includes('late record') || restored.includes('late record')
      ).to.equal(true)
    })

    it('leaves no archive behind when the source cannot be read and none existed', async function () {
      if (process.getuid?.() === 0) {
        this.skip()
      }
      const file = path.join(tmpDir, 'skserver-raw_2024-01-15T12.log')
      fs.writeFileSync(file, 'unreadable hour\n')
      fs.chmodSync(file, 0o000)

      try {
        let error: Error | undefined
        try {
          await compressLogFile(file)
        } catch (e) {
          error = e as Error
        }
        expect((error as NodeJS.ErrnoException)?.code).to.equal('EACCES')
        expect(fs.readdirSync(tmpDir)).to.deep.equal([
          'skserver-raw_2024-01-15T12.log'
        ])
      } finally {
        fs.chmodSync(file, 0o644)
      }
    })

    it('keeps both files when an archive already exists', async () => {
      const file = path.join(tmpDir, 'skserver-raw_2024-01-15T12.log')
      const archive = `${file}.gz`
      const content = '1700000000000;N;$GPGLL,4916.45,N\n'
      fs.writeFileSync(file, content)
      fs.writeFileSync(archive, 'earlier hour')

      let error: Error | undefined
      try {
        await compressLogFile(file)
      } catch (e) {
        error = e as Error
      }

      expect((error as NodeJS.ErrnoException)?.code).to.equal('EEXIST')
      // The source is back under its own name and the earlier archive is
      // untouched, so neither hour lost records.
      expect(fs.readFileSync(file, 'utf8')).to.equal(content)
      expect(fs.readFileSync(archive, 'utf8')).to.equal('earlier hour')
      expect(fs.readdirSync(tmpDir).sort()).to.deep.equal([
        'skserver-raw_2024-01-15T12.log',
        'skserver-raw_2024-01-15T12.log.gz'
      ])
    })

    it('lists compressed log files alongside uncompressed ones', (done) => {
      fs.writeFileSync(path.join(tmpDir, 'skserver-raw_2024-01-15T12.log'), '')
      fs.writeFileSync(
        path.join(tmpDir, 'skserver-raw_2024-01-15T13.log.gz'),
        ''
      )

      listLogFiles(createLoggingApp({ configPath: tmpDir }), (err, files) => {
        expect(err).to.equal(undefined)
        expect(files).to.have.length(2)
        expect(files).to.include('skserver-raw_2024-01-15T13.log.gz')
        done()
      })
    })

    it('compresses a file once it has been rotated', async function () {
      this.timeout(15000)
      const app = createLoggingApp({ configPath: tmpDir })
      const stream = new FileTimestampStreamWithDelete(app, tmpDir, undefined, {
        path: path.join(tmpDir, 'skserver-raw_%Y-%m-%dT%H.%S.log')
      })

      try {
        stream.write('1700000000000;first;record\n')
        await delay(1100)
        stream.write('1700000001000;second;record\n')

        // The pipeline is done when the archive exists and its source is
        // gone; gunzipping an archive that is still being written fails.
        await waitForFile(
          tmpDir,
          (name) =>
            name.endsWith('.log.gz') &&
            !fs.existsSync(path.join(tmpDir, name.replace(/\.gz$/, '')))
        )
        const compressed = fs
          .readdirSync(tmpDir)
          .find((name) => name.endsWith('.log.gz'))!
        const content = gunzipSync(
          fs.readFileSync(path.join(tmpDir, compressed))
        ).toString()
        expect(content).to.equal('1700000000000;first;record\n')
      } finally {
        stream.destroy()
      }
    })

    it('recovers a staged log left behind by an interrupted run', async function () {
      this.timeout(15000)
      const app = createLoggingApp({ configPath: tmpDir })
      const stream = new FileTimestampStreamWithDelete(app, tmpDir, undefined, {
        path: path.join(tmpDir, 'skserver-raw_%Y-%m-%dT%H.%S.log')
      })
      const abandoned = path.join(tmpDir, '.compress-abandoned')
      fs.mkdirSync(abandoned)
      const stagedName = 'skserver-raw_2020-01-01T00.log'
      fs.writeFileSync(
        path.join(abandoned, stagedName),
        'records from the interrupted run\n'
      )
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
      fs.utimesSync(abandoned, twoHoursAgo, twoHoursAgo)

      try {
        stream.write('1700000000000;first;record\n')
        await delay(1100)
        stream.write('1700000001000;second;record\n')

        const archive = await waitForFile(
          tmpDir,
          (name) => name === `${stagedName}.gz`,
          8000
        )
        expect(
          gunzipSync(fs.readFileSync(path.join(tmpDir, archive))).toString()
        ).to.equal('records from the interrupted run\n')
        expect(fs.existsSync(abandoned)).to.equal(false)
      } finally {
        stream.destroy()
      }
    })

    it('keeps a staged copy when its hour is in use again', async function () {
      this.timeout(15000)
      const app = createLoggingApp({ configPath: tmpDir })
      const stream = new FileTimestampStreamWithDelete(app, tmpDir, undefined, {
        path: path.join(tmpDir, 'skserver-raw_%Y-%m-%dT%H.%S.log')
      })
      const abandoned = path.join(tmpDir, '.compress-abandoned')
      fs.mkdirSync(abandoned)
      const stagedName = 'skserver-raw_2020-01-01T00.log'
      fs.writeFileSync(path.join(abandoned, stagedName), 'older records\n')
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
      fs.utimesSync(abandoned, twoHoursAgo, twoHoursAgo)
      fs.writeFileSync(path.join(tmpDir, stagedName), 'records in use\n')

      try {
        stream.write('1700000000000;first;record\n')
        await delay(1100)
        stream.write('1700000001000;second;record\n')
        await waitForFile(tmpDir, (name) => name.endsWith('.log.gz'))
        await delay(500)

        expect(
          fs.readFileSync(path.join(abandoned, stagedName), 'utf8')
        ).to.equal('older records\n')
        expect(fs.readFileSync(path.join(tmpDir, stagedName), 'utf8')).to.equal(
          'records in use\n'
        )
      } finally {
        stream.destroy()
      }
    })

    it('leaves rotated files uncompressed when compression is disabled', async function () {
      this.timeout(15000)
      const app = createLoggingApp({
        configPath: tmpDir,
        settings: { compressOldLogs: false }
      })
      const stream = new FileTimestampStreamWithDelete(app, tmpDir, undefined, {
        path: path.join(tmpDir, 'skserver-raw_%Y-%m-%dT%H.%S.log')
      })

      try {
        stream.write('1700000000000;first;record\n')
        await delay(1100)
        stream.write('1700000001000;second;record\n')
        await delay(500)

        const files = fs.readdirSync(tmpDir)
        expect(files.filter((name) => name.endsWith('.log.gz'))).to.have.length(
          0
        )
        expect(files.filter((name) => name.endsWith('.log'))).to.have.length(2)
      } finally {
        stream.destroy()
      }
    })
  })
})
