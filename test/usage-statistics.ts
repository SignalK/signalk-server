import { expect } from 'chai'
import express from 'express'
import fs from 'fs'
import { Server } from 'http'
import os from 'os'
import path from 'path'
import { withFetch } from './appstore/fetch-stub'
import { freeport } from './ts-servertestutilities'

import { resetModuleCaches } from '../dist/modules'
import {
  mountUsageStatisticsApi,
  systemDescription,
  usageReport,
  usageReportSender,
  USAGE_STATISTICS_FILE
} from '../dist/usage-statistics'

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE
const REPORT_URL = 'https://usage.signalk.org/v1/report'

const appStore: Record<string, string[]> = {
  'signalk-node-server-plugin': ['listed-plugin', 'disabled-plugin'],
  'signalk-embeddable-webapp': [],
  'signalk-webapp': ['listed-webapp']
}

function npmSearch(url: string) {
  const keyword = new URL(url).searchParams.get('text')!.split(':')[1]
  const names = appStore[keyword]
  return Response.json({
    objects: names.map((name) => ({ package: { name, version: '1.0.0' } })),
    total: names.length
  })
}

const configDirs: string[] = []

function testApp() {
  const configPath = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-statistics-'))
  configDirs.push(configPath)
  return Object.assign(express(), {
    config: {
      configPath,
      version: '2.30.0-beta.1'
    },
    plugins: [
      { id: 'listed', packageName: 'listed-plugin', version: '1.2.3-beta.4' },
      { id: 'disabled', packageName: 'disabled-plugin', version: '0.1.0+b5' },
      { id: 'mine', packageName: 'my-own-plugin', version: '1.0.0' }
    ],
    getPluginOptions: (id: string) => ({ enabled: id !== 'disabled' }),
    webapps: [
      { name: 'listed-webapp', version: '3.0.0' },
      { name: '@signalk/server-admin-ui', version: '2.30.0' },
      { name: 'my-own-plugin', version: '1.0.0' }
    ],
    embeddablewebapps: [
      { name: 'listed-webapp', version: '3.0.0' },
      { name: 'private-webapp', version: '1.0.0' }
    ]
  })
}

type TestApp = ReturnType<typeof testApp>

const settingsFile = (app: TestApp) =>
  path.join(app.config.configPath, USAGE_STATISTICS_FILE)
const readSettings = (app: TestApp) =>
  JSON.parse(fs.readFileSync(settingsFile(app), 'utf8'))

describe('usage statistics', () => {
  beforeEach(() => resetModuleCaches())
  afterEach(() => {
    for (const dir of configDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('names only App Store packages, without pre-release versions', async () => {
    await withFetch(npmSearch, async () => {
      expect(await usageReport(testApp(), 'an-id')).to.deep.equal({
        installationId: 'an-id',
        signalkVersion: '2.30.0',
        nodeVersion: process.versions.node,
        os: process.platform,
        arch: process.arch,
        ...systemDescription(),
        plugins: [
          { name: 'listed-plugin', version: '1.2.3', enabled: true },
          { name: 'disabled-plugin', version: '0.1.0', enabled: false }
        ],
        webapps: [{ name: 'listed-webapp', version: '3.0.0' }],
        unlistedCount: 2
      })
    })
  })

  const systems = [
    {
      system: 'a Cerbo GX',
      files: {
        '/proc/device-tree/model': 'Cerbo GX\0',
        '/opt/victronenergy/version':
          'v3.90-beta11\nVictron Energy\n20261106213207\n'
      },
      expected: {
        hardware: 'Cerbo GX',
        distro: 'venus',
        distroVersion: 'v3.90-beta11',
        docker: false
      }
    },
    {
      system: 'Raspberry Pi OS',
      files: {
        '/proc/device-tree/model': 'Raspberry Pi 4 Model B Rev 1.4\0',
        '/etc/os-release':
          'NAME="Raspbian GNU/Linux"\nVERSION_ID="12"\nID=raspbian\n'
      },
      expected: {
        hardware: 'Raspberry Pi 4 Model B',
        distro: 'raspbian',
        distroVersion: '12',
        docker: false
      }
    },
    {
      system: 'Docker on Ubuntu',
      docker: 'true',
      files: {
        '/etc/os-release': 'ID_LIKE=debian\nID=ubuntu\nVERSION_ID="24.04"\n'
      },
      expected: {
        hardware: undefined,
        distro: 'ubuntu',
        distroVersion: '24.04',
        docker: true
      }
    },
    {
      system: 'a PC without these files',
      files: {},
      expected: {
        hardware: undefined,
        distro: undefined,
        distroVersion: undefined,
        docker: false
      }
    }
  ]
  for (const { system, docker, files, expected } of systems) {
    it(`describes ${system}`, () => {
      const inDocker = process.env.IS_IN_DOCKER
      process.env.IS_IN_DOCKER = docker ?? 'false'
      const read = (file: string) => (files as Record<string, string>)[file]
      try {
        expect(systemDescription(read)).to.deep.equal(expected)
      } finally {
        if (inDocker === undefined) {
          delete process.env.IS_IN_DOCKER
        } else {
          process.env.IS_IN_DOCKER = inDocker
        }
      }
    })
  }

  it('reports no packages when the plugin and webapp interfaces are off', async () => {
    const app = Object.assign(testApp(), {
      plugins: undefined,
      webapps: undefined,
      embeddablewebapps: undefined
    })
    await withFetch(npmSearch, async () => {
      expect(await usageReport(app)).to.include({ unlistedCount: 0 })
    })
  })

  describe('sending', () => {
    const originalRandom = Math.random
    afterEach(() => {
      Math.random = originalRandom
    })

    let code: number
    const network = (url: string) =>
      url === REPORT_URL ? new Response(null, { status: code }) : npmSearch(url)
    const reportsSent = (calls: { url: string }[]) =>
      calls.filter((call) => call.url === REPORT_URL).length

    it('sends daily from a random moment in the first hour, retrying with back-off', async () => {
      Math.random = () => 0.5
      const app = testApp()
      fs.writeFileSync(
        settingsFile(app),
        JSON.stringify({ enabled: true, installationId: 'an-id' })
      )
      const start = Date.now()
      const sendIfDue = usageReportSender(app, start)
      const steps = [
        { at: 29 * MINUTE, code: 500, sends: 0 },
        { at: 30 * MINUTE, code: 500, sends: 1 },
        { at: 34 * MINUTE, code: 500, sends: 1 },
        { at: 35 * MINUTE, code: 500, sends: 2 },
        { at: 44 * MINUTE, code: 200, sends: 2 },
        { at: 45 * MINUTE, code: 200, sends: 3 },
        { at: 45 * MINUTE + DAY - 1, code: 200, sends: 3 },
        { at: 45 * MINUTE + DAY, code: 200, sends: 4 }
      ]
      await withFetch(network, async (calls) => {
        for (const step of steps) {
          code = step.code
          const { at, sends } = step
          await sendIfDue(start + at)
          expect(reportsSent(calls), `at ${at / MINUTE} min`).to.equal(sends)
        }
        const sent = JSON.parse(String(calls.at(-1)!.init!.body))
        expect(sent.installationId).to.equal('an-id')

        // A restart sends again only a day after the last send
        const lastSent = start + 45 * MINUTE + DAY
        const afterRestart = usageReportSender(app, lastSent)
        await afterRestart(lastSent + DAY - 1)
        expect(reportsSent(calls)).to.equal(4)
        await afterRestart(lastSent + DAY)
        expect(reportsSent(calls)).to.equal(5)
      })
    })

    it('keeps an opt-out made during a send', async () => {
      const app = testApp()
      fs.writeFileSync(
        settingsFile(app),
        JSON.stringify({ enabled: true, installationId: 'an-id' })
      )
      const optOutDuringSend = (url: string) => {
        if (url === REPORT_URL) {
          fs.writeFileSync(
            settingsFile(app),
            JSON.stringify({ enabled: false })
          )
        }
        return network(url)
      }
      code = 200
      await withFetch(optOutDuringSend, async () => {
        await usageReportSender(app, Date.now())(Date.now() + DAY)
      })
      expect(readSettings(app)).to.include({ enabled: false })
      expect(readSettings(app)).to.not.have.property('installationId')
    })

    it('sends nothing when off', async () => {
      const app = testApp()
      fs.writeFileSync(settingsFile(app), JSON.stringify({ enabled: false }))
      code = 200
      await withFetch(network, async (calls) => {
        await usageReportSender(app, Date.now())(Date.now() + DAY)
        expect(calls).to.have.length(0)
      })
    })
  })

  describe('API', () => {
    const realFetch = globalThis.fetch
    let app: TestApp
    let server: Server
    let apiUrl: string

    beforeEach(async () => {
      app = testApp()
      app.use(express.json())
      mountUsageStatisticsApi(app)
      const port = await freeport()
      server = app.listen(port)
      apiUrl = `http://127.0.0.1:${port}/skServer/settings/usageStatistics`
    })

    afterEach(() => server.close())

    const put = (enabled: unknown) =>
      fetch(apiUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      })
    const json = async (response: Promise<Response>) => (await response).json()

    it('keeps an installation id only while sharing', async () => {
      expect(await json(fetch(apiUrl))).to.deep.equal({
        enabled: false,
        answered: false
      })
      expect(await json(put(true))).to.deep.equal({
        enabled: true,
        answered: true
      })
      const id = readSettings(app).installationId
      expect(id).to.be.a('string')
      await put(true)
      expect(readSettings(app).installationId).to.equal(id)
      expect(await json(put(false))).to.deep.equal({
        enabled: false,
        answered: true
      })
      expect(readSettings(app).installationId).to.equal(undefined)
      await put(true)
      expect(readSettings(app).installationId)
        .to.be.a('string')
        .and.not.equal(id)
    })

    it('rejects a choice that is not a boolean', async () => {
      expect((await put('yes')).status).to.equal(400)
    })

    it('says why when the choice can not be saved', async () => {
      app.config.configPath = path.join(app.config.configPath, 'missing')
      const response = await put(true)
      expect(response.status).to.equal(500)
      expect(await response.text()).to.match(/^Unable to save the choice: /)
    })

    it('previews the report, with the id only while sharing', async () => {
      // the npm searches are stubbed, the requests to the API are not
      async function preview(npm: (url: string) => Response) {
        resetModuleCaches()
        let response: Response | undefined
        await withFetch(
          (url, init) =>
            url.startsWith(apiUrl) ? realFetch(url, init) : npm(url),
          async () => {
            response = await fetch(`${apiUrl}/report`)
          }
        )
        return response!
      }

      expect((await (await preview(npmSearch)).json()).installationId).to.equal(
        undefined
      )
      await put(true)
      expect((await (await preview(npmSearch)).json()).installationId).to.equal(
        readSettings(app).installationId
      )
      const npmDown = () => new Response('unavailable', { status: 503 })
      expect((await preview(npmDown)).status).to.equal(503)
    })
  })
})
