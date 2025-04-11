var Server = require('../dist')

console.log('1. INSTANTIATING instance...')
var server = new Server({ settings: 'volare-file-settings.json' })

console.log('2. STARTING server...')
server.start()

setTimeout(function () {
  console.log('3. STOPPING server...')
  server.stop()
}, 10000)

setTimeout(function () {
  console.log('4. STARTING server...')
  server.start()
}, 20000)

setTimeout(function () {
  console.log('5. RELOADING server...')
  server.reload('aava-file-settings.json')
}, 30000)
