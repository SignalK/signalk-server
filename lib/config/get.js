const path = require('path')
const { getInstalledPathSync } = require('get-installed-path')

const getPluginConfigPublic = () =>
  path.join(getInstalledPathSync('@signalk/plugin-config'), 'public')

module.exports = {
  getPluginConfigPublic
}
