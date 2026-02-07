import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type BinaryStreamApp = {
  binaryStreamManager?: { emitData: (id: string, data: Buffer) => void }
}

const binaryStreamModule = require('../../src/wasm/bindings/binary-stream') as {
  createBinaryDataReader: (memoryRef: {
    current: WebAssembly.Memory | null
  }) => (ptr: number, len: number) => Buffer
  createBinaryStreamBinding: (
    pluginId: string,
    app: BinaryStreamApp,
    readUtf8String: (ptr: number, len: number) => string,
    readBinaryData: (ptr: number, len: number) => Buffer
  ) => (
    streamPtr: number,
    streamLen: number,
    dataPtr: number,
    dataLen: number
  ) => number
}

describe('wasm binary stream bindings', () => {
  it('reads binary data from wasm memory', () => {
    const memory = new WebAssembly.Memory({ initial: 1 })
    const memoryRef = { current: memory }

    const bytes = new Uint8Array(memory.buffer, 0, 3)
    bytes.set([1, 2, 3])

    const reader = binaryStreamModule.createBinaryDataReader(memoryRef)
    const data = reader(0, 3)

    expect(Array.from(data)).to.deep.equal([1, 2, 3])
  })

  it('throws when wasm memory is missing', () => {
    const reader = binaryStreamModule.createBinaryDataReader({ current: null })
    expect(() => reader(0, 1)).to.throw('WASM memory not initialized')
  })

  it('validates stream ids and emits binary data', () => {
    let emitted: { id: string; data: Buffer } | null = null
    const app: BinaryStreamApp = {
      binaryStreamManager: {
        emitData: (id: string, data: Buffer) => {
          emitted = { id, data }
        }
      }
    }

    const binding = binaryStreamModule.createBinaryStreamBinding(
      'plugin-1',
      app,
      () => 'plugins/plugin-1/stream',
      () => Buffer.from([9])
    )

    const result = binding(0, 0, 0, 1)

    expect(result).to.equal(1)
    expect(emitted?.id).to.equal('plugins/plugin-1/stream')
    expect(Array.from(emitted?.data || [])).to.deep.equal([9])
  })

  it('rejects invalid stream ids or missing manager', () => {
    const binding = binaryStreamModule.createBinaryStreamBinding(
      'plugin-1',
      {},
      () => 'invalid',
      () => Buffer.from([1])
    )

    expect(binding(0, 0, 0, 1)).to.equal(0)
  })

  it('returns failure on errors', () => {
    const binding = binaryStreamModule.createBinaryStreamBinding(
      'plugin-1',
      { binaryStreamManager: { emitData: () => undefined } },
      () => {
        throw new Error('boom')
      },
      () => Buffer.from([1])
    )

    expect(binding(0, 0, 0, 1)).to.equal(0)
  })
})
