module.exports = {
  startServerP: function startServerP (port) {
    const settings = JSON.parse(
      JSON.stringify(require('./server-test-settings.json'))
    )
    settings.port = port
    const Server = require('../lib')
    const server = new Server({
      config: { settings }
    })
    return server.start()
  }
}
