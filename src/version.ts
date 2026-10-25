import { major, satisfies } from 'semver'

const minimumVersion = '>=20'
export const recommendedVersion = '24'
export const testedNodeVersions = [22, 24, 26]

export function isTestedNodeVersion(version: string) {
  return testedNodeVersions.includes(major(version))
}

export default function checkNodeVersion() {
  if ('SKIP_NODE_VERSION_CHECK' in process.env) return

  if (!satisfies(process.version, minimumVersion)) {
    console.error(
      `The installed version of node (${process.version}) is older than the minimum required version (${minimumVersion}). See https://github.com/SignalK/signalk-server/wiki/Installing-and-Updating-Node.js for more information how to upgrade.`
    )
    process.exit(1)
  } else if (!isTestedNodeVersion(process.version)) {
    console.warn(
      `The installed version of node (${process.version}) is not one Signal K Server is tested on (${testedNodeVersions.join(', ')}); version ${recommendedVersion} is recommended. See https://github.com/SignalK/signalk-server/wiki/Installing-and-Updating-Node.js for more information how to upgrade.`
    )
  }
}
