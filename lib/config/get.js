const path = require('path')
const { getInstalledPathSync } = require('get-installed-path')

// #521 Returns path to load plugin-config assets.
const getPluginConfigPublic = () =>
  path.join(getInstalledPathSync('@signalk/plugin-config'), 'public')

module.exports = {
  getPluginConfigPublic
}
