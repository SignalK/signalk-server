import { expect } from 'chai'
import { createRequire } from 'module'
import fs from 'fs'

const require = createRequire(import.meta.url)

describe('interfaces index', () => {
  it('exports modules for js files except index.js', () => {
    const indexPath = require.resolve('../../src/interfaces')
    const playgroundPath = require.resolve('../../src/interfaces/playground')
    const wsPath = require.resolve('../../src/interfaces/ws')

    const originalReaddir = fs.readdirSync
    const originalPlayground = require.cache[playgroundPath]
    const originalWs = require.cache[wsPath]
    const originalIndex = require.cache[indexPath]

    fs.readdirSync = () => ['index.js', 'playground.js', 'ws.js', 'notes.txt']

    require.cache[playgroundPath] = {
      id: playgroundPath,
      filename: playgroundPath,
      loaded: true,
      exports: { marker: 'playground' }
    }

    require.cache[wsPath] = {
      id: wsPath,
      filename: wsPath,
      loaded: true,
      exports: { marker: 'ws' }
    }

    delete require.cache[indexPath]
    const indexModule = require('../../src/interfaces') as {
      playground?: { marker: string }
      ws?: { marker: string }
      index?: unknown
    }

    expect(indexModule.playground?.marker).to.equal('playground')
    expect(indexModule.ws?.marker).to.equal('ws')
    expect(indexModule.index).to.equal(undefined)

    fs.readdirSync = originalReaddir
    if (originalPlayground) {
      require.cache[playgroundPath] = originalPlayground
    } else {
      delete require.cache[playgroundPath]
    }
    if (originalWs) {
      require.cache[wsPath] = originalWs
    } else {
      delete require.cache[wsPath]
    }
    if (originalIndex) {
      require.cache[indexPath] = originalIndex
    } else {
      delete require.cache[indexPath]
    }
  })
})
