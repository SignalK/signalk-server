import debugCore from 'debug'
import moment from 'moment'
import path from 'path'
import fs from 'fs'

export default function (app) {
  const log = []
  let debugEnabled = ''
  let rememberDebug = false
  const size = 100
  let debugPath

  if (process.env.DEBUG) {
    debugEnabled = process.env.DEBUG
  }

  debugPath = path.join(app.config.configPath, 'debug')
  if (fs.existsSync(debugPath)) {
    const enabled = fs.readFileSync(debugPath, 'utf8')
    if (enabled.length > 0) {
      debugCore.enable(enabled)
      debugEnabled = enabled
      rememberDebug = true
    }
  }

  function storeOutput(output, isError) {
    const data = {
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

  process.stdout.write = function (string) {
    outWrite.apply(process.stdout, arguments)
    storeOutput(string, false)
  }

  process.stderr.write = function (string) {
    errWrite.apply(process.stderr, arguments)
    storeOutput(string, true)
  }

  // send debug to stdout so it does not look like an error
  debugCore.log = console.info.bind(console)

  function enableDebug(enabled) {
    if (enabled.length > 0) {
      let all = enabled.split(',')

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
    rememberDebug: (enabled) => {
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
    addDebug: (name) => {
      if (debugEnabled.length > 0) {
        const all = debugEnabled.split(',')
        if (all.indexOf(name) === -1) {
          enableDebug(debugEnabled + ',' + name)
        }
      } else {
        enableDebug(name)
      }
    },
    removeDebug: (name) => {
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
