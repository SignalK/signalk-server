import debugCore from 'debug'
import moment from 'moment'
import path from 'path'
import fs from 'fs'
import type { SignalKServer } from './types'
import type { WithConfig } from './app'
import type { WrappedEmitter } from './events'

export interface Logging {
  getLog: () => LogMessage[]
  enableDebug: (enabled: string) => boolean
  getDebugSettings: () => { debugEnabled: string; rememberDebug: boolean }
  rememberDebug: (enabled: boolean) => void
  addDebug: (name: string) => void
  removeDebug: (name: string) => void
}

type LogMessage = {
  ts: string
  row: string
  isError?: boolean
}

export default function (
  app: SignalKServer & WithConfig & WrappedEmitter
): Logging {
  const log: LogMessage[] = []
  let debugEnabled = process.env.DEBUG ?? ''
  let rememberDebug = false
  const size = 100
  const debugPath = path.join(app.config.configPath, 'debug')

  if (fs.existsSync(debugPath)) {
    const enabled = fs.readFileSync(debugPath, 'utf8')
    if (enabled.length > 0) {
      debugCore.enable(enabled)
      debugEnabled = enabled
      rememberDebug = true
    }
  }

  function storeOutput(output: string, isError: boolean) {
    const data: LogMessage = {
      ts: moment().format('MMM DD HH:mm:ss'),
      row: output
    }
    if (isError) {
      data.isError = true
    }
    log.push(data)

    if (log.length > size) {
      log.splice(0, log.length - size)
    }

    app.emit('serverlog', {
      type: 'LOG',
      data: data
    })
  }

  const outWrite = process.stdout.write
  const errWrite = process.stderr.write

  process.stdout.write = function (...args) {
    storeOutput(args[0].toString(), false)
    return outWrite.apply(process.stdout, args as Parameters<typeof outWrite>)
  }

  process.stderr.write = function (...args) {
    storeOutput(args[0].toString(), true)
    return errWrite.apply(process.stderr, args as Parameters<typeof errWrite>)
  }

  // send debug to stdout so it does not look like an error
  debugCore.log = console.info.bind(console)

  function enableDebug(enabled: string) {
    if (enabled.length > 0) {
      const all = enabled.split(',')

      if (all.indexOf('*') !== -1) {
        return false
      }

      debugCore.enable(enabled)
    } else {
      debugCore.disable()
    }

    debugEnabled = enabled

    if (rememberDebug && debugPath) {
      fs.writeFileSync(debugPath, debugEnabled)
    }

    app.emit('serverevent', {
      type: 'DEBUG_SETTINGS',
      data: {
        debugEnabled: enabled,
        rememberDebug
      }
    })
    return true
  }

  return {
    getLog: () => {
      return log
    },
    enableDebug: enableDebug,
    getDebugSettings: () => {
      return { debugEnabled, rememberDebug }
    },
    rememberDebug: (enabled: boolean) => {
      if (debugPath) {
        if (enabled) {
          fs.writeFileSync(debugPath, debugEnabled)
        } else {
          fs.unlinkSync(debugPath)
        }
      }

      rememberDebug = enabled
      app.emit('serverevent', {
        type: 'DEBUG_SETTINGS',
        data: {
          debugEnabled,
          rememberDebug
        }
      })
    },
    addDebug: (name: string) => {
      if (debugEnabled.length > 0) {
        const all = debugEnabled.split(',')
        if (all.indexOf(name) === -1) {
          enableDebug(debugEnabled + ',' + name)
        }
      } else {
        enableDebug(name)
      }
    },
    removeDebug: (name: string) => {
      if (debugEnabled.length > 0) {
        const all = debugEnabled.split(',')
        const idx = all.indexOf(name)
        if (idx !== -1) {
          all.splice(idx, 1)
          enableDebug(all.join(','))
        }
      }
    }
  }
}
