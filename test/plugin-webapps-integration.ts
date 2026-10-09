import { strict as assert } from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ServerAPI } from '@signalk/server-api'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Server = require('../dist/')

describe('Dynamic webapp plugin integration', () => {
  it('lists multiple apps in both APIs and removes registrations on stop and failed start', async () => {
    const original = process.env.SIGNALK_NODE_CONFIG_DIR
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sk-plugin-webapps-')
    )
    fs.mkdirSync(path.join(directory, 'node_modules'))
    fs.symlinkSync(
      path.join(__dirname, 'plugin-test-config/node_modules/testplugin'),
      path.join(directory, 'node_modules/testplugin')
    )
    fs.mkdirSync(path.join(directory, 'plugin-config-data'))
    fs.writeFileSync(
      path.join(directory, 'plugin-config-data/testplugin.json'),
      JSON.stringify({ enabled: true, configuration: {} })
    )
    process.env.SIGNALK_NODE_CONFIG_DIR = directory
    const port = await freeport()
    const server = new Server({
      config: {
        appPath: directory,
        settings: {
          port,
          mdns: false,
          interfaces: {
            mfd_webapp: false,
            tcp: false,
            'nmea-tcp': false,
            'n2k-discovery': false
          }
        }
      }
    })
    try {
      await server.start()
      const plugin = server.app.plugins.find(
        (entry: { id: string }) => entry.id === 'testplugin'
      ) as { app: ServerAPI; start: () => void }
      assert.ok(plugin)
      const names = async (endpoint: string): Promise<string[]> => {
        const entries = (await fetch(
          `http://127.0.0.1:${port}${endpoint}`
        ).then((response) => response.json())) as Array<{ name: string }>
        return entries.map((entry) => entry.name)
      }
      const installed = await names('/skServer/webapps')
      const first = plugin.app.registerWebapp('first', {
        displayName: 'First',
        appIcon: 'icon.png'
      })
      const second = plugin.app.registerWebapp('second', {
        displayName: 'Second'
      })
      for (const endpoint of ['/skServer/webapps', '/signalk/v1/apps/list']) {
        const list = await names(endpoint)
        assert.ok(list.includes(first.slice(1, -1)))
        assert.ok(list.includes(second.slice(1, -1)))
      }
      const originalRegister = plugin.app.registerWebapp
      const configure = async (enabled: boolean) => {
        const response = await fetch(
          `http://127.0.0.1:${port}/plugins/testplugin/config`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled, configuration: {} })
          }
        )
        assert.equal(response.status, 200)
      }
      await configure(false)
      assert.deepEqual(await names('/skServer/webapps'), installed)
      assert.throws(
        () => plugin.app.registerWebapp('late', { displayName: 'Late' }),
        /active plugin lifecycle/
      )
      plugin.start = () => {
        plugin.app.registerWebapp('failed', { displayName: 'Failed' })
        throw new Error('Intentional start failure')
      }
      await configure(true)
      assert.deepEqual(await names('/skServer/webapps'), installed)
      assert.throws(
        () => plugin.app.registerWebapp('late', { displayName: 'Late' }),
        /active plugin lifecycle/
      )
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      let oldCallback = Promise.resolve()
      plugin.start = () => {
        plugin.app.registerWebapp('restarted', { displayName: 'Restarted' })
        oldCallback = gate.then(() => {
          assert.throws(
            () => plugin.app.registerWebapp('late', { displayName: 'Late' }),
            /active plugin lifecycle/
          )
          plugin.app.unregisterWebapp('restarted')
        })
      }
      await configure(true)
      assert.ok(
        (await names('/skServer/webapps')).includes(
          'plugins/testplugin/webapps/restarted'
        )
      )
      const previousRegister = plugin.app.registerWebapp
      const previousUnregister = plugin.app.unregisterWebapp
      plugin.start = () => {
        plugin.app.registerWebapp('restarted', { displayName: 'Current' })
      }
      await configure(true)
      assert.throws(
        () => originalRegister('late', { displayName: 'Late' }),
        /active plugin lifecycle/
      )
      assert.throws(
        () => previousRegister('late', { displayName: 'Late' }),
        /active plugin lifecycle/
      )
      previousUnregister('restarted')
      release()
      await oldCallback
      for (const endpoint of ['/skServer/webapps', '/signalk/v1/apps/list']) {
        assert.deepEqual(await names(endpoint), [
          ...installed,
          'plugins/testplugin/webapps/restarted'
        ])
      }
      await server.stop()
      assert.throws(
        () => plugin.app.registerWebapp('late', { displayName: 'Late' }),
        /active plugin lifecycle/
      )
      assert.ok(
        !server.app.webapps.some((entry: { name: string }) =>
          entry.name.startsWith('plugins/testplugin/webapps/')
        )
      )
    } finally {
      await server.stop()
      if (original === undefined) delete process.env.SIGNALK_NODE_CONFIG_DIR
      else process.env.SIGNALK_NODE_CONFIG_DIR = original
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
