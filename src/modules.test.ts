import chai from 'chai'
import fs from 'fs'
import _ from 'lodash'
import path from 'path'
import {
  checkForNewServerVersion,
  getLatestServerVersionInfo,
  modulesWithKeyword
} from './modules'

describe('modulesWithKeyword', () => {
  it('returns a list of modules with one "installed" update in config dir', () => {
    const expectedModules = [
      '@signalk/freeboard-sk',
      '@signalk/instrumentpanel'
    ]
    const updateInstalledModule = '@signalk/instrumentpanel'
    const indexOfInstalledModule = expectedModules.indexOf(
      updateInstalledModule
    )

    const testTempDir = path.join(
      require('os').tmpdir(),
      '_skservertest_modules' + Date.now()
    )

    const app = {
      config: {
        name: 'dummy-name-in-test',
        appPath: path.join(__dirname + '/../'),
        configPath: testTempDir
      }
    }

    fs.mkdirSync(testTempDir)
    const tempNodeModules = path.join(testTempDir, 'node_modules/')
    fs.mkdirSync(path.join(testTempDir, 'node_modules'))
    fs.mkdirSync(path.join(testTempDir, 'node_modules/@signalk'))
    const installedModuleDirectory = path.join(
      testTempDir,
      `node_modules/${updateInstalledModule}`
    )
    fs.mkdirSync(installedModuleDirectory)

    const fakeInstalledModulePackageJson = require(path.join(
      app.config.appPath,
      `node_modules/${updateInstalledModule}/package.json`
    ))
    fakeInstalledModulePackageJson.version = '1000.0.0'
    fs.writeFileSync(
      path.join(installedModuleDirectory, 'package.json'),
      JSON.stringify(fakeInstalledModulePackageJson)
    )

    const moduleList = modulesWithKeyword(app, 'signalk-webapp')
    chai.expect(_.map(moduleList, 'module')).to.eql(expectedModules)
    chai.expect(moduleList[0].location).to.not.eql(tempNodeModules)
    chai
      .expect(moduleList[indexOfInstalledModule].location)
      .to.eql(tempNodeModules)
  })
})

describe('checkForNewServerVersion', () => {
  const newMinorVersionInfo = {
    version: '1.18.0',
    disttag: 'latest',
    minimumNodeVersion: '10'
  }
  it('normal version upgrade', done => {
    checkForNewServerVersion(
      '1.17.0',
      (err, newVersion) => {
        if (err) {
          done(err)
        } else {
          chai.expect(newVersion).to.equal(newMinorVersionInfo.version)
          done()
        }
      },
      () => Promise.resolve(newMinorVersionInfo)
    )
  })

  it('normal version does not upgrade to beta', done => {
    const newBetaVersion = {
      version: '1.18.0-beta.2',
      disttag: 'latest',
      minimumNodeVersion: '10'
    }
    checkForNewServerVersion(
      '1.17.0',
      err => {
        done('callback should not be called')
      },
      () => Promise.resolve(newBetaVersion)
    )
    done()
  })

  it('beta upgrades to same minor newer beta', done => {
    const newerBetaVersionInfo = {
      version: '1.18.0-beta.2',
      disttag: 'latest',
      minimumNodeVersion: '10'
    }
    checkForNewServerVersion(
      '1.18.0-beta.1',
      (err, newVersion) => {
        if (err) {
          done(err)
        } else {
          chai.expect(newVersion).to.equal(newerBetaVersionInfo.version)
          done()
        }
      },
      () => Promise.resolve(newerBetaVersionInfo)
    )
  })

  it('beta upgrades to same normal version', done => {
    const sameNormalVersion = {
      version: '1.18.0',
      disttag: 'latest',
      minimumNodeVersion: '10'
    }
    checkForNewServerVersion(
      '1.18.0-beta.2',
      (err, newVersion) => {
        if (err) {
          done(err)
        } else {
          chai.expect(newVersion).to.equal(sameNormalVersion.version)
          done()
        }
      },
      () => Promise.resolve(sameNormalVersion)
    )
  })

  it('beta upgrades to newer normal version', done => {
    const newerNormalVersion = {
      version: '1.19.0',
      disttag: 'latest',
      minimumNodeVersion: '10'
    }
    checkForNewServerVersion(
      '1.18.0-beta.2',
      (err, newVersion) => {
        if (err) {
          done(err)
        } else {
          chai.expect(newVersion).to.equal(newerNormalVersion.version)
          done()
        }
      },
      () => Promise.resolve(newerNormalVersion)
    )
  })

  it('beta does not upgrade to newer minor beta', done => {
    const nextMinorBetaVersion = {
      version: '1.18.0-beta.2',
      disttag: 'latest',
      minimumNodeVersion: '10'
    }
    checkForNewServerVersion(
      '1.17.0-beta.1',
      err => {
        done('callback should not be called')
      },
      () => Promise.resolve(nextMinorBetaVersion)
    )
    done()
  })
})

describe('getLatestServerVersion', () => {
  it('latest for normal is normal', () => {
    return getLatestServerVersionInfo('1.17.0', () =>
      Promise.resolve({
        latest: '1.18.0',
        beta: '1.19.0-beta.1'
      })
    ).then(newVersionInfo => {
      chai.expect(newVersionInfo.version).to.equal('1.18.0')
    })
  })

  it('latest for beta is newer same series beta', done => {
    return getLatestServerVersionInfo('1.18.0-beta.2', () =>
      Promise.resolve({
        latest: '1.17.3',
        beta: '1.18.0-beta.3'
      })
    ).then(newVersionInfo => {
      chai.expect(newVersionInfo.version).to.equal('1.18.0-beta.3')
      done()
    })
  })

  it('latest for beta is newer real release', () => {
    return getLatestServerVersionInfo('1.18.0-beta.2', () =>
      Promise.resolve({
        latest: '1.18.0',
        beta: '1.18.0-beta.3'
      })
    ).then(newVersionInfo => {
      chai.expect(newVersionInfo.version).to.equal('1.18.0')
    })
  })
})
