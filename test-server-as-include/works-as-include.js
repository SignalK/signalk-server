const appRoot = require('app-root-path')
const SignalKServer = require('signalk-server')
const path = require('path')

const config = {
  appPath: appRoot.path,
  configPath: process.env.SETTINGSDIR
}

console.log(config)
const server = new SignalKServer({ config });
server.start()