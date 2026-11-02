import fs from 'fs'
import path from 'path'
import { ensureConfigPackageJson, getConfigDirectory } from './config/config'
import { runPnpmInConfigDir } from './modules'

const USAGE = `Usage: signalk-pnpm <pnpm command> [arguments]

Runs pnpm in the Signal K configuration directory the way the App Store does:
with the pnpm that ships with the server and the App Store's settings, so that
the server and the App Store keep working with what it installs. It waits for
an App Store install or removal in progress, and the server loads what it
installs once it restarts. For example:

  signalk-pnpm add @signalk/some-plugin
  signalk-pnpm remove @signalk/some-plugin
  signalk-pnpm link /path/to/my-plugin

The configuration directory is $SIGNALK_NODE_CONFIG_DIR, or ~/.signalk when it
is not set. Run it as the user that the server runs as.`

export async function main(args: string[]): Promise<number> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(USAGE)
    return args.length === 0 ? 1 : 0
  }
  // The directory the server uses when it is started without -c or -s
  const configPath = getConfigDirectory({
    argv: {},
    config: {},
    env: process.env
  })
  if (!fs.existsSync(configPath)) {
    console.error(
      `${configPath} does not exist: start the server once, or set SIGNALK_NODE_CONFIG_DIR to its configuration directory`
    )
    return 1
  }
  // Files that root creates there would stop the server, which runs as the
  // directory's owner, from updating or removing them later
  if (process.getuid?.() === 0 && fs.statSync(configPath).uid !== 0) {
    console.error(
      `Run signalk-pnpm as the owner of ${configPath} rather than as root`
    )
    return 1
  }
  ensureConfigPackageJson(configPath)
  // Information rather than an error: it goes to stderr so that stdout carries
  // only pnpm's output, such as that of --json
  console.error(`Signal K configuration directory: ${configPath}`)
  return runPnpmInConfigDir(
    configPath,
    args.map(fromWorkingDirectory),
    (output) => process.stdout.write(output),
    (err) =>
      process.stderr.write(err instanceof Error ? `${err.message}\n` : err)
  )
}

// pnpm runs in the configuration directory, so a relative path given on the
// command line, such as . for the plugin being developed or a packed tarball,
// is made absolute from where the command was run
function fromWorkingDirectory(arg: string): string {
  const spec = /^(file:|link:)?(\.\.?(?:[/\\].*)?)$/.exec(arg)
  return spec ? (spec[1] ?? '') + path.resolve(spec[2]) : arg
}
