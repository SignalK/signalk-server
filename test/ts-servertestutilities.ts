import net from 'net'
import path from 'path'
import { rimraf } from 'rimraf'
import {
  sendDelta,
  serverTestConfigDirectory,
  startServerP,
  WsPromiser
} from './servertestutilities'
import { SERVERSTATEDIRNAME } from '../src/serverstate/store'
import { expect } from 'chai'
import { Delta, hasValues, PathValue, Value } from '@signalk/server-api'

export const DATETIME_REGEX = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)Z?$/

const emptyConfigDirectory = () =>
  Promise.all(
    [SERVERSTATEDIRNAME, 'resources', 'plugin-config-data', 'baseDeltas.json']
      .map((subDir) => path.join(serverTestConfigDirectory(), subDir))
      .map((dir) => rimraf(dir).then(() => console.error(dir)))
  )

export const startServer = async () => {
  const port = await freeport()
  const host = 'http://localhost:' + port
  const sendDeltaUrl = host + '/signalk/v1/api/_test/delta'
  const api = host + '/signalk/v2/api'
  const v1Api = host + '/signalk/v1/api'

  await emptyConfigDirectory()
  const server = await startServerP(port, false, {
    settings: {
      interfaces: {
        plugins: true
      }
    }
  })
  return {
    server,
    createWsPromiser: () =>
      new WsPromiser(
        'ws://localhost:' +
          port +
          '/signalk/v1/stream?subscribe=self&metaDeltas=none&sendCachedValues=false'
      ),
    selfPut: (path: string, body: object) =>
      fetch(`${api}/vessels/self/${path}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
      }),
    selfPutV1: (path: string, body: object) =>
      fetch(`${v1Api}/vessels/self/${path}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
      }),
    selfDelete: (path: string) =>
      fetch(`${api}/vessels/self/${path}`, {
        method: 'DELETE'
      }),
    get: (path: string) => fetch(`${api}${path}`),
    getV1: (path: string) => fetch(`${v1Api}${path}`),
    post: (path: string, body: object) =>
      fetch(`${api}${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
      }),
    put: (path: string, body: object) =>
      fetch(`${api}${path}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
      }),
    selfGetJson: (path: string) =>
      fetch(`${api}/vessels/self/${path}`).then((r) => r.json()),
    selfGetJsonV1: (path: string) =>
      fetch(`${v1Api}/vessels/self/${path}`).then((r) => r.json()),
    host,
    sendDelta: (path: string, value: Value) =>
      sendDelta(
        {
          updates: [
            {
              values: [
                {
                  path,
                  value
                }
              ]
            }
          ]
        },
        sendDeltaUrl
      ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendADelta: (delta: any) => sendDelta(delta, sendDeltaUrl),
    stop: () => server.stop()
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deltaHasPathValue = (delta: Delta, path: string, value: any) => {
  try {
    const pathValue = delta.updates.reduce<PathValue | undefined>(
      (acc, update) => {
        if (!acc && hasValues(update)) {
          acc = update.values.find((x: PathValue) => x.path === path)
        }
        return acc
      },
      undefined
    )
    expect(pathValue?.value).to.deep.equal(value)
  } catch (_) {
    throw new Error(
      `No such pathValue ${path}:${JSON.stringify(value)} in ${JSON.stringify(delta, null, 2)}`
    )
  }
}

export function freeport(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    let port = 0

    server.on('listening', () => {
      const address = server.address()

      if (address == null) {
        return reject(new Error('Server was not listening'))
      }

      if (typeof address === 'string') {
        return reject(new Error('Server was Unix Socket'))
      }

      port = address.port
      server.close()
    })

    server.once('close', () => resolve(port))
    server.once('error', reject)
    server.listen(0, '127.0.0.1')
  })
}
