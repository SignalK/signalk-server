import { strict as assert } from 'assert'
import { PluginWebapps } from '../src/pluginWebapps'
import { Package } from '../src/modules'
import { ServerAPI } from '@signalk/server-api'

describe('Dynamic plugin webapps', () => {
  const metadata = { version: '1.0.0', license: 'Apache-2.0', author: 'Test' }

  it('registers independent entries and updates without duplicating', () => {
    const app: { webapps?: Package[] } = {}
    const owner = new PluginWebapps(app, 'navico', metadata)
    owner.start(() => {})
    assert.equal(
      owner.register('a', { displayName: 'A' }),
      '/plugins/navico/webapps/a/'
    )
    owner.register('b', { displayName: 'B', appIcon: 'icon.png' })
    owner.register('a', { displayName: 'New A' })
    assert.equal(app.webapps?.length, 2)
    assert.deepEqual(
      app.webapps?.map((entry) => entry.name),
      ['plugins/navico/webapps/a', 'plugins/navico/webapps/b']
    )
    const updated = app.webapps?.[0]
    assert.ok(updated && 'signalk' in updated)
    assert.deepEqual(updated.signalk, { displayName: 'New A' })
    assert.equal(app.webapps?.[0]?.version, metadata.version)
    assert.equal(app.webapps?.[0]?.author, metadata.author)
    owner.unregister('a')
    assert.equal(app.webapps?.length, 1)
    owner.unregister('a')
    owner.clear()
    assert.equal(app.webapps?.length, 0)
  })

  it('keeps npm webapps and other owners intact across cleanup and restart', () => {
    const installed = {
      name: 'installed',
      ...metadata,
      description: '',
      dependencies: {}
    }
    const app = { webapps: [installed] }
    const first = new PluginWebapps(app, 'first', metadata)
    const second = new PluginWebapps(app, 'second', metadata)
    first.start(() => {})
    second.start(() => {})
    first.register('same', { displayName: 'First' })
    second.register('same', { displayName: 'Second' })
    app.webapps = [...app.webapps]
    first.unregister('unknown')
    first.clear()
    assert.deepEqual(
      app.webapps.map((entry) => entry.name),
      ['installed', 'plugins/second/webapps/same']
    )
    first.register('same', { displayName: 'Restarted' })
    assert.equal(app.webapps.length, 3)
    assert.equal(app.webapps[0], installed)
  })

  it('rejects invalid ids, icon paths, names and collisions', () => {
    const app = { webapps: [] as Package[] }
    const owner = new PluginWebapps(app, 'test', metadata)
    owner.start(() => {})
    for (const id of ['', '..', '../other', 'a/b', 'a?b', 'a'.repeat(129)]) {
      assert.throws(() => owner.register(id, { displayName: 'Test' }))
    }
    for (const id of [42, null, undefined, {}]) {
      assert.throws(() =>
        Reflect.apply(owner.register, owner, [id, { displayName: 'Test' }])
      )
    }
    assert.throws(() => owner.register('a', { displayName: ' ' }))
    for (const appIcon of [
      '/icon',
      '../icon',
      'http://host/icon',
      'a/../../icon'
    ]) {
      assert.throws(() => owner.register('a', { displayName: 'Test', appIcon }))
    }
    app.webapps.push({
      name: 'plugins/test/webapps/a',
      ...metadata,
      description: '',
      dependencies: {}
    })
    assert.throws(() => owner.register('a', { displayName: 'Test' }))
    owner.clear()
    assert.equal(app.webapps.length, 1)
  })

  it('rejects non-string descriptions without changing registered entries', () => {
    const app = { webapps: [] as Package[] }
    const owner = new PluginWebapps(app, 'test', metadata)
    owner.start(() => {})
    owner.register('a', { displayName: 'A', description: 'Original' })
    for (const description of [42, null, true, {}, []]) {
      assert.throws(
        () =>
          Reflect.apply(owner.register, owner, [
            'a',
            { displayName: 'Changed', description }
          ]),
        /description must be a string/
      )
      assert.equal(app.webapps[0].description, 'Original')
      assert.equal(app.webapps.length, 1)
    }
    owner.register('default', { displayName: 'Default' })
    assert.equal(app.webapps[1].description, '')
    owner.register('empty', { displayName: 'Empty', description: '' })
    assert.equal(app.webapps[2].description, '')
  })

  it('rejects stopped and stale APIs, including callbacks reading the shared API', async () => {
    const app = { webapps: [] as Package[] }
    const api: Partial<Pick<ServerAPI, 'registerWebapp' | 'unregisterWebapp'>> =
      {}
    const owner = new PluginWebapps(app, 'test', metadata, api)
    const beforeStart = api.registerWebapp!
    assert.throws(
      () => beforeStart('early', { displayName: 'Early' }),
      /active plugin lifecycle/
    )
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let oldCallback = Promise.resolve()
    owner.start(() => {
      api.registerWebapp!('same', { displayName: 'Old' })
      oldCallback = gate.then(() => {
        assert.throws(
          () => api.registerWebapp!('late', { displayName: 'Late' }),
          /active plugin lifecycle/
        )
        api.unregisterWebapp!('same')
      })
    })
    const previousRegister = api.registerWebapp!
    const previousUnregister = api.unregisterWebapp!
    owner.stop()
    assert.equal(app.webapps.length, 0)
    assert.throws(
      () => api.registerWebapp!('stopped', { displayName: 'Stopped' }),
      /active plugin lifecycle/
    )
    owner.start(() => api.registerWebapp!('same', { displayName: 'Current' }))
    assert.throws(
      () => beforeStart('early', { displayName: 'Early' }),
      /active plugin lifecycle/
    )
    assert.throws(
      () => previousRegister('old', { displayName: 'Old' }),
      /active plugin lifecycle/
    )
    previousUnregister('same')
    release()
    await oldCallback
    assert.deepEqual(
      app.webapps.map((entry) => entry.name),
      ['plugins/test/webapps/same']
    )
    assert.ok('signalk' in app.webapps[0])
    assert.deepEqual(app.webapps[0].signalk, { displayName: 'Current' })
    owner.stop()
    assert.equal(app.webapps.length, 0)
  })

  it('withdraws entries and closes registration after a failed start', () => {
    const app = { webapps: [] as Package[] }
    const owner = new PluginWebapps(app, 'test', metadata)
    assert.throws(
      () =>
        owner.start(() => {
          owner.register('failed', { displayName: 'Failed' })
          throw new Error('Intentional start failure')
        }),
      /Intentional start failure/
    )
    assert.equal(app.webapps.length, 0)
    assert.throws(
      () => owner.register('late', { displayName: 'Late' }),
      /active plugin lifecycle/
    )
    owner.start(() => owner.register('restarted', { displayName: 'Restarted' }))
    assert.equal(app.webapps.length, 1)
  })
})
