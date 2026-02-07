const path = require('path')

module.exports = {
  require: ['ts-node/register', path.join(__dirname, 'test/setup.ts')],
  extensions: ['ts', 'tsx', 'js'],
  timeout: 20000,
  exit: true
}
