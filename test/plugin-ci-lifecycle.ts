import { expect } from 'chai'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const execFileAsync = promisify(execFile)
const workflow = readFileSync(
  path.join(__dirname, '../.github/workflows/plugin-ci.yml'),
  'utf8'
)
const match = workflow.match(
  /cat << 'LIFECYCLE'[^\n]*\n([\s\S]*?)^          LIFECYCLE$/m
)
if (!match) throw new Error('Lifecycle workflow script not found')
const lifecycle = match[1].replace(/^          /gm, '')

async function checkPlugin(body: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'sk-plugin-ci-'))
  try {
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'test-plugin', main: 'index.js' })
    )
    writeFileSync(
      path.join(dir, 'index.js'),
      `module.exports = app => { ${body} }`
    )
    writeFileSync(path.join(dir, 'check.cjs'), lifecycle)
    try {
      const { stdout } = await execFileAsync(process.execPath, ['check.cjs'], {
        cwd: dir,
        timeout: 10000
      })
      return { code: 0, stdout }
    } catch (error) {
      const result = error as { code: number; stdout: string }
      return { code: result.code, stdout: result.stdout }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('Plugin CI lifecycle check', () => {
  it('supports app routing without inventing an asynchronous plugin crash', async () => {
    const result = await checkPlugin(`
      return { start() { Promise.resolve().then(() => {
        app.get('/test', () => {}).post('/test', () => {}).put('/test', () => {})
          .delete('/test', () => {}).patch('/test', () => {}).use(() => {})
          .all('/test', () => {}).route('/test').get(() => {})
      }) }, stop() {} }
    `)
    expect(result.code, result.stdout).to.equal(0)
    expect(result.stdout).to.include('lifecycle (start/stop/restart) is clean')
  })

  it('warns when start reports an error instead of declaring a clean lifecycle', async () => {
    const result = await checkPlugin(`return {
      start() { app.setPluginError('Device unavailable') }, stop() {}
    }`)
    expect(result.code, result.stdout).to.equal(0)
    expect(result.stdout).to.include(
      '::warning::Plugin reported an error: Device unavailable'
    )
    expect(result.stdout).not.to.include(
      'lifecycle (start/stop/restart) is clean'
    )
  })

  it('includes errors reported asynchronously during the observation window', async () => {
    const result = await checkPlugin(`return {
      start() { setTimeout(() => app.setPluginError('Connection failed'), 20) }, stop() {}
    }`)
    expect(result.code, result.stdout).to.equal(0)
    expect(result.stdout).to.include(
      '::warning::Plugin reported an error: Connection failed'
    )
    expect(result.stdout).not.to.include(
      'lifecycle (start/stop/restart) is clean'
    )
  })

  it('does not warn for an empty error reset', async () => {
    const result = await checkPlugin(`return {
      start() { app.setPluginError('') }, stop() {}
    }`)
    expect(result.code, result.stdout).to.equal(0)
    expect(result.stdout).not.to.include('::warning::Plugin reported an error:')
    expect(result.stdout).to.include('lifecycle (start/stop/restart) is clean')
  })

  it('still fails for an unhandled rejection after registering a route', async () => {
    const result = await checkPlugin(`return {
      start() { app.get('/test', () => {}); Promise.reject(new Error('Real startup failure')) }, stop() {}
    }`)
    expect(result.code, result.stdout).to.equal(1)
    expect(result.stdout).to.include(
      '::error::Lifecycle: unhandled rejection: Real startup failure'
    )
  })
})
