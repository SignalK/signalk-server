const chai = require('chai')
const _ = require('lodash')
const fs = require('fs')
const path = require('path')
const {
  modulesWithKeyword,
  checkForNewServerVersion,
  getLatestServerVersion,
  importOrRequire
} = require('../dist/modules')

describe('modulesWithKeyword', () => {
  it('returns a list of modules with one "installed" update in config dir', () => {
    const expectedModules = [
      '@signalk/instrumentpanel',
      '@signalk/freeboard-sk',
      '@mxtommy/kip'
    ]
    const updateInstalledModule = '@signalk/instrumentpanel'

    const testTempDir = path.join(
      require('os').tmpdir(),
      '_skservertest_modules' + Date.now()
    )

    const app = {
      config: {
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

    const moduleList = modulesWithKeyword(app.config, 'signalk-webapp')
    chai.expect(_.map(moduleList, 'module')).to.have.members(expectedModules)

    chai.expect(moduleList[0].location).to.not.eql(tempNodeModules)

    const installedModuleInfo = moduleList.find(
      (moduleInfo) => moduleInfo.module === updateInstalledModule
    )
    chai.expect(installedModuleInfo.location).to.eql(tempNodeModules)
  })
})

describe('checkForNewServerVersion', () => {
  it('normal version upgrade', (done) => {
    checkForNewServerVersion(
      '1.17.0',
      (err, newVersion) => {
        if (err) {
          done(err)
        } else {
          chai.expect(newVersion).to.equal('1.18.0')
          done()
        }
      },
      () => Promise.resolve('1.18.0')
    )
  })

  it('normal version does not upgrade to beta', (done) => {
    checkForNewServerVersion(
      '1.17.0',
      () => {
        done('callback should not be called')
      },
      () => Promise.resolve('1.18.0-beta.1')
    )
    done()
  })

  it('beta upgrades to same minor newer beta', (done) => {
    checkForNewServerVersion(
      '1.18.0-beta.1',
      (err, newVersion) => {
        if (err) {
          done(err)
        } else {
          chai.expect(newVersion).to.equal('1.18.0-beta.2')
          done()
        }
      },
      () => Promise.resolve('1.18.0-beta.2')
    )
  })

  it('beta upgrades to same normal version', (done) => {
    checkForNewServerVersion(
      '1.18.0-beta.2',
      (err, newVersion) => {
        if (err) {
          done(err)
        } else {
          chai.expect(newVersion).to.equal('1.18.0')
          done()
        }
      },
      () => Promise.resolve('1.18.0')
    )
  })

  it('beta upgrades to newer normal version', (done) => {
    checkForNewServerVersion(
      '1.18.0-beta.2',
      (err, newVersion) => {
        if (err) {
          done(err)
        } else {
          chai.expect(newVersion).to.equal('1.19.0')
          done()
        }
      },
      () => Promise.resolve('1.19.0')
    )
  })

  it('beta does not upgrade to newer minor beta', (done) => {
    checkForNewServerVersion(
      '1.17.0-beta.1',
      () => {
        done('callback should not be called')
      },
      () => Promise.resolve('1.18.0-beta.2')
    )
    done()
  })
})

describe('getLatestServerVersion', () => {
  it('latest for normal is normal', () => {
    return getLatestServerVersion('1.17.0', () =>
      Promise.resolve({
        json: () => ({
          latest: '1.18.3',
          beta: '1.19.0-beta.1'
        })
      })
    ).then((newVersion) => {
      chai.expect(newVersion).to.equal('1.18.3')
    })
  })

  it('latest for beta is newer same series beta', (done) => {
    getLatestServerVersion('1.18.0-beta.2', () =>
      Promise.resolve({
        json: () => ({
          latest: '1.17.3',
          beta: '1.18.0-beta.3'
        })
      })
    ).then((newVersion) => {
      chai.expect(newVersion).to.equal('1.18.0-beta.3')
      done()
    })
  })

  it('latest for beta is newer real release', () => {
    return getLatestServerVersion('1.18.0-beta.2', () =>
      Promise.resolve({
        json: () => ({
          latest: '1.18.0',
          beta: '1.18.0-beta.3'
        })
      })
    ).then((newVersion) => {
      chai.expect(newVersion).to.equal('1.18.0')
    })
  })
})

describe('importOrRequire', () => {
  it('imports a cjs directory', async () => {
    const dir = path.join(
      __dirname,
      'plugin-test-config/node_modules/testplugin'
    )
    const mod = await importOrRequire(dir)
    chai.expect(mod).to.be.a('function')
  })

  it('imports an esm directory', async () => {
    const dir = path.join(
      __dirname,
      'plugin-test-config/node_modules/esm-plugin'
    )
    const mod = await importOrRequire(dir)
    chai.expect(mod).to.be.a('function')
  })
})
