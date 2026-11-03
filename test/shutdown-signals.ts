import { expect } from 'chai'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { freeport, SERVER_START_TIMEOUT } from './ts-servertestutilities'

/**
 * In a container the server runs as PID 1, where the kernel discards a signal
 * that has no handler installed rather than applying its default disposition.
 * These tests assert that a real server process exits on SIGTERM and SIGINT,
 * so a container stop does not have to escalate to SIGKILL.
 *
 * Driven as a child process on purpose: the handler calls process.exit(), so
 * exercising it in-process would take the test runner down with it.
 */

const REPO_ROOT = path.resolve(__dirname, '..')

// Startup scans plugins and can take tens of seconds on a cold run, so
// readiness gets the suite-wide budget while the shutdown itself is held to a
// much shorter one — a shutdown that needs 10s has already failed.
const SHUTDOWN_TIMEOUT = 15000

// Resolves with the child's exit code and signal, or rejects if it outlives
// the deadline — the failure this suite exists to catch.
function startAndSignal(
  signal: NodeJS.Signals,
  port: number
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(REPO_ROOT, 'bin', 'signalk-server')],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          PORT: String(port),
          SIGNALK_NODE_CONFIG_DIR: path.join(__dirname, 'shutdown-test-config')
        },
        // stderr is inherited rather than piped: an unread pipe blocks the
        // child once it fills, which would surface as a shutdown timeout.
        stdio: ['ignore', 'pipe', 'inherit']
      }
    )

    let timer: NodeJS.Timeout | undefined
    const done = (fn: () => void) => {
      if (timer) {
        clearTimeout(timer)
      }
      fn()
    }

    // Readiness is governed by the suite budget below; this one starts only
    // once the signal has been delivered, so a slow start cannot be reported
    // as a failed shutdown.
    const startTimer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`server did not start within ${SERVER_START_TIMEOUT}ms`))
    }, SERVER_START_TIMEOUT)
    timer = startTimer

    let signalled = false
    let stdout = ''
    child.stdout.on('data', (buf: Buffer) => {
      if (signalled) {
        return
      }
      // A data event is not line-delimited, so the readiness line can span
      // chunks. Keep only enough tail to span one such split.
      stdout = (stdout + buf.toString()).slice(-4096)
      if (stdout.includes('signalk-server running at')) {
        clearTimeout(startTimer)
        if (!child.kill(signal)) {
          reject(new Error(`could not deliver ${signal} to the server`))
          return
        }
        signalled = true
        timer = setTimeout(() => {
          child.kill('SIGKILL')
          reject(
            new Error(
              `server still running ${SHUTDOWN_TIMEOUT}ms after ${signal}`
            )
          )
        }, SHUTDOWN_TIMEOUT)
      }
    })

    // Node can emit 'error' without ever emitting 'exit', which would leave
    // this promise pending until the suite times out.
    child.on('error', (err) => done(() => reject(err)))
    child.on('exit', (code, sig) =>
      done(() => {
        // Exiting before the signal was sent is a startup failure, not a
        // shutdown to assert on — resolving here would pass the test without
        // ever exercising the handler.
        if (!signalled) {
          reject(
            new Error(
              `server exited (code ${code}, signal ${sig}) before ${signal} was sent`
            )
          )
          return
        }
        resolve({ code, signal: sig })
      })
    )
  })
}

describe('shutdown signals', () => {
  it('exits on SIGTERM rather than having to be killed', async () => {
    const { code, signal } = await startAndSignal('SIGTERM', await freeport())
    expect(signal, 'should exit on its own, not by signal').to.equal(null)
    expect(code).to.equal(0)
  })

  it('exits on SIGINT rather than having to be killed', async () => {
    const { code, signal } = await startAndSignal('SIGINT', await freeport())
    expect(signal, 'should exit on its own, not by signal').to.equal(null)
    expect(code).to.equal(0)
  })
})
