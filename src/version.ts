import { engines } from '../package.json'
import { satisfies } from 'semver'

const minimumVersion = '>=18'
const recommendedVersion = '22'

export default function checkNodeVersion() {
  if ('SKIP_NODE_VERSION_CHECK' in process.env) return

  if (!satisfies(process.version, minimumVersion)) {
    console.error(
      `The installed version of node (${process.version}) is older than the minimum required version (${minimumVersion}). See https://github.com/SignalK/signalk-server/wiki/Installing-and-Updating-Node.js for more information how to upgrade.`
    )
    process.exit(1)
  } else if (!satisfies(process.version, recommendedVersion)) {
    console.warn(
      `The installed version of node (${process.version}) is different than the recommended version (${recommendedVersion}). See https://github.com/SignalK/signalk-server/wiki/Installing-and-Updating-Node.js for more information how to upgrade.`
    )
  }
}
