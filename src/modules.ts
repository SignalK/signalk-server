/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright 2017 Teppo Kurki <teppo.kurki@iki.fi>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

import { spawn } from 'child_process'
import fs from 'fs'
import _ from 'lodash'
import fetch, { Response } from 'node-fetch'
import path from 'path'
import semver, { SemVer } from 'semver'
import { Config } from './config/config'
import { createDebug } from './debug'
const debug = createDebug('signalk:modules')

interface ModuleData {
  module: string
  metadata: object
  location: string
}

export interface NpmPackageData {
  name: string
  version: string
  date: string
  keywords: string[]
}

interface NpmModuleData {
  package: NpmPackageData
}

interface PersonInPackage {
  name: string
  email: string
}

export interface Package {
  name: string
  author?: PersonInPackage
  contributors?: PersonInPackage[]
  dependencies: { [key: string]: any }
  version: string
  description: string
  license: string
}

function findModulesInDir(dir: string, keyword: string): ModuleData[] {
  // If no directory by name return empty array.
  if (!fs.existsSync(dir)) {
    return []
  }
  debug('findModulesInDir: ' + dir)
  return fs
    .readdirSync(dir)
    .filter((name) => name !== '.bin')
    .reduce<ModuleData[]>((result, filename) => {
      if (filename.indexOf('@') === 0) {
        return result.concat(
          findModulesInDir(dir + filename + '/', keyword).map((entry) => {
            return {
              module: entry.module,
              metadata: entry.metadata,
              location: dir
            }
          })
        )
      } else {
        let metadata
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          metadata = require(path.join(dir, filename, 'package.json'))
        } catch (err) {
          debug(err)
        }
        if (
          metadata &&
          metadata.keywords &&
          metadata.keywords.includes(keyword)
        ) {
          result.push({
            module: metadata.name,
            metadata,
            location: dir
          })
        }
      }
      return result
    }, [])
}

// Extract unique directory paths from app object.
function getModulePaths(config: Config) {
  // appPath is the app working directory.
  const { appPath, configPath } = config
  return (appPath === configPath ? [appPath] : [configPath, appPath]).map(
    (pathOption) => path.join(pathOption, 'node_modules/')
  )
}

const getModuleSortName = (x: ModuleData) =>
  (x.module || '').replace('@signalk', ' ')

// Sort handler that puts strings with '@signalk' first.
const priorityPrefix = (a: ModuleData, b: ModuleData) =>
  getModuleSortName(a).localeCompare(getModuleSortName(b))

// Searches for installed modules that contain `keyword`.
export function modulesWithKeyword(config: Config, keyword: string) {
  return _.uniqBy(
    // _.flatten since values are inside an array. [[modules...], [modules...]]
    _.flatten(
      getModulePaths(config).map((pathOption) =>
        findModulesInDir(pathOption, keyword)
      )
    ),
    (moduleData) => moduleData.module
  ).sort(priorityPrefix)
}
function installModule(
  config: Config,
  name: string,
  version: string,
  onData: () => any,
  onErr: (err: Error) => any,
  onClose: (code: number) => any
) {
  runNpm(config, name, version, 'install', onData, onErr, onClose)
}

function removeModule(
  config: Config,
  name: string,
  version: any,
  onData: () => any,
  onErr: (err: Error) => any,
  onClose: (code: number) => any
) {
  runNpm(config, name, null, 'remove', onData, onErr, onClose)
}

export function restoreModules(
  config: Config,
  onData: (output: any) => void,
  onErr: (err: Error) => void,
  onClose: (code: number) => any
) {
  runNpm(config, null, null, 'remove', onData, onErr, onClose)
}

function runNpm(
  config: Config,
  name: any,
  version: any,
  command: string,
  onData: (output: any) => any,
  onErr: (err: Error) => any,
  onClose: (code: number) => any
) {
  let npm

  const opts: { cwd?: string } = {}
  let packageString

  if (name) {
    packageString = version ? `${name}@${version}` : name
  } else {
    packageString = ''
  }

  debug(`${command}: ${packageString}`)

  if (isTheServerModule(name, config)) {
    if (process.platform === 'win32') {
      npm = spawn('cmd', ['/c', `npm ${command} -g ${packageString} `], opts)
    } else {
      npm = spawn('sudo', ['npm', command, '-g', packageString], opts)
    }
  } else {
    opts.cwd = config.configPath

    if (process.platform === 'win32') {
      npm = spawn('cmd', ['/c', `npm --save ${command} ${packageString}`], opts)
    } else {
      npm = spawn('npm', ['--save', command, packageString], opts)
    }
  }

  npm.stdout.on('data', onData)
  npm.stderr.on('data', onErr)
  npm.on('close', onClose)
  npm.on('error', (err: Error) => {
    onErr(err)
    onClose(-1)
  })
}

function isTheServerModule(moduleName: string, config: Config) {
  return moduleName === config.name
}

const modulesByKeyword: { [key: string]: any } = {}

function findModulesWithKeyword(keyword: string) {
  return new Promise((resolve, reject) => {
    const result = {}
    const handleResultWithTimeout = (fetchResult: Promise<Response>): void => {
      fetchResult
        .then((r) => r.json())
        .then((parsed) => {
          const data = parsed.results || parsed.objects || []
          data.reduce(
            (
              acc: { [packageName: string]: NpmModuleData },
              module: NpmModuleData
            ) => {
              const name = module.package.name
              if (
                !acc[name] ||
                semver.gt(module.package.version, acc[name].package.version)
              ) {
                acc[name] = module
              }
              return acc
            },
            result
          )
          const packages = _.values(result)
          modulesByKeyword[keyword] = {
            time: Date.now(),
            packages
          }
          resolve(packages)
        })
        .catch((e) => {
          reject(e)
        })
    }
    if (
      modulesByKeyword[keyword] &&
      Date.now() - modulesByKeyword[keyword].time < 60 * 1000
    ) {
      resolve(modulesByKeyword[keyword].packages)
      return
    }

    handleResultWithTimeout(
      fetch(
        'http://registry.npmjs.org/-/v1/search?size=250&text=keywords:' +
          keyword
      )
    )
  })
}

function doFetchDistTags() {
  return fetch('http://registry.npmjs.org/-/package/signalk-server/dist-tags')
}

function getLatestServerVersion(
  currentVersion: string,
  distTags = doFetchDistTags
): Promise<string> {
  return new Promise((resolve, reject) => {
    distTags()
      .then((npmjsResults) => npmjsResults.json())
      .then((npmjsParsed) => {
        const prereleaseData = semver.prerelease(currentVersion)
        if (prereleaseData) {
          if (semver.satisfies(npmjsParsed.latest, `>${currentVersion}`)) {
            resolve(npmjsParsed.latest)
          } else {
            resolve(npmjsParsed[prereleaseData[0]])
          }
        } else {
          resolve(npmjsParsed.latest)
        }
      })
      .catch(reject)
  })
}

export function checkForNewServerVersion(
  currentVersion: string,
  serverUpgradeIsAvailable: (
    errMessage: string | void,
    version?: string
  ) => any,
  getLatestServerVersionP: (
    version: string
  ) => Promise<string> = getLatestServerVersion
) {
  getLatestServerVersionP(currentVersion)
    .then((version: string) => {
      if (semver.satisfies(new SemVer(version), `>${currentVersion}`)) {
        serverUpgradeIsAvailable(undefined, version)
      }
    })
    .catch((err: any) => {
      serverUpgradeIsAvailable(`unable to check for new server version: ${err}`)
    })
}

export function getAuthor(thePackage: Package): string {
  debug(thePackage.name + ' author: ' + thePackage.author)
  return (
    (thePackage.author && (thePackage.author.name || thePackage.author.email)) +
    '' +
    (thePackage.contributors || [])
      .map((contributor: any) => contributor.name || contributor.email)
      .join(',') +
    '' +
    (thePackage.name.startsWith('@signalk/') ? ' (Signal K team)' : '')
  )
}

export function getKeywords(thePackage: NpmPackageData): string[] {
  const keywords = thePackage.keywords
  debug('%s keywords: %j', thePackage.name, keywords)
  return keywords
}

module.exports = {
  modulesWithKeyword,
  installModule,
  removeModule,
  isTheServerModule,
  findModulesWithKeyword,
  getLatestServerVersion,
  checkForNewServerVersion,
  getAuthor,
  getKeywords,
  restoreModules
}
