#!/usr/bin/env sh
set -e

server_package_json="$1"
config_dir="$2"
edition="$3"
attempts="${NPM_INSTALL_ATTEMPTS:-3}"
retry_delay="${NPM_INSTALL_RETRY_DELAY_SECONDS:-30}"

mkdir -p "$config_dir"
cd "$config_dir"
node -e '
const fs = require("fs")
const server = require(process.argv[1])
const edition = process.argv[2]
const defaults = server.signalk?.defaultPackages ?? {}
const full = edition === "full"
const pkg = {
  name: "signalk-server-config",
  version: "0.0.1",
  description: "This file is here to track your plugin and webapp installs.",
  repository: {},
  license: "Apache-2.0",
  dependencies: full ? defaults : {},
  signalkDefaultPackages: Object.fromEntries(
    Object.keys(defaults).map((name) => [name, full ? "installed" : "declined"])
  )
}
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n")
' "$server_package_json" "$edition"
printf 'package-lock=false\n' > .npmrc
npm cache clean --force
if [ "$edition" = full ]; then
  attempt=1
  until npm install --ignore-scripts --prefer-online; do
    if [ "$attempt" -ge "$attempts" ]; then
      echo "npm install of the default packages failed after $attempt attempts" >&2
      exit 1
    fi
    echo "npm install of the default packages failed, retrying in ${retry_delay}s" >&2
    attempt=$((attempt + 1))
    sleep "$retry_delay"
  done
fi
