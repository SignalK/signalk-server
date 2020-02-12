
const debugCore = require('debug')
const moment = require('moment')
const Convert = require('ansi-to-html')
const escape = require('escape-html');
 
module.exports = function(app) {
  const log = []
  let debugEnabled = ''
  const size = 100
  let convert = new Convert()
  
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

      app.emit('serverevent', {
        type: 'DEBUG_ENABLED',
        data: enabled
      })
      return true
    },
    getDebugEnabled: () => {
      return debugEnabled
    }
  }
}
