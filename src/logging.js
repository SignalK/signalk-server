
const debugCore = require('debug')
const moment = require('moment')
 
module.exports = function(app) {
  const log = []
  let debugEnabled = []
  const size = 100
  let Convert = require('ansi-to-html')
  let convert = new Convert()
  
  function storeOutput(output) {
    const html = moment().format('DD/MM/YYYY HH:mm:ss ') + convert.toHtml(output)
    log.push(html)
    
    if (log.length > size) {
      log.splice(0, log.length - size)
    }
    
    app.emit('serverevent', {
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
    getLogs: () => {
      return log
    },
    enabledDebug: enabled => {
      let all = enabled.length > 0 ? enabled.split(',') : []
      all.forEach(name => {
        debugCore.enable(name)
      })
      debugEnabled.forEach(name => {
        if ( all.indexOf(name) === -1 ) {
          debugCore.disable(name)
        }
      })
      debugEnabled = all

      app.emit('serverevent', {
        type: 'DEBUG_ENABLED',
        data: enabled
      })
    },
    getDebugEnabled: () => {
      return debugEnabled.join(',')
    }
  }
}
