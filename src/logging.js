
const debugCore = require('debug')
const moment = require('moment')
const Convert = require('ansi-to-html')
const escape = require('escape-html')
const path = require('path')
const fs = require('fs')

module.exports = function(app) {
  const log = []
  let debugEnabled = ''
  let rememberDebug = false
  const size = 100
  let convert = new Convert()
  let debugPath

  if ( process.env.HOME ) {
    debugPath = path.join(process.env.HOME, '.signalk_debug')
    if ( fs.existsSync(debugPath) ) {
      const enabled = fs.readFileSync(debugPath, 'utf8')
      if ( enabled.length > 0 ) {
        debugCore.enable(enabled)
        debugEnabled = enabled
        rememberDebug = true
      }
    }
  }
  
  function storeOutput(output) {
    const html = '<span style="font-weight:lighter">' + moment().format('MMM DD HH:mm:ss') + '</span> ' + convert.toHtml(escape(output))
    log.push(html)
    
    if (log.length > size) {
      log.splice(0, log.length - size)
    }
    
    app.emit('serverlog', {
      type: 'LOG',
      data: html
    })
  }
  
  const out_write = process.stdout.write
  const err_write = process.stderr.write
    
  process.stdout.write = function(string) {
    out_write.apply(process.stdout, arguments)
    storeOutput(string)
  }
  
  process.stderr.write = function(string) {
    err_write.apply(process.stderr, arguments)
    storeOutput(string)
  }

  return {
    getLog: () => {
      return log
    },
    enabledDebug: enabled => {
      if ( enabled.length > 0 ) {
        let all = enabled.split(',')

        if ( all.indexOf('*') != -1 ) {
          return false
        }

        debugCore.enable(enabled)
      } else {
        debugCore.disable()
      }

      debugEnabled = enabled

      if ( rememberDebug && debugPath ) {
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
    },
    getDebugSettings: () => {
      return { debugEnabled, rememberDebug }
    },
    rememberDebug: enabled => {

      if ( debugPath ) {
        if ( enabled ) {
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
    }
  }
}
