import { expect } from 'chai'
import J1939Can from './j1939-can'
import { createMockApp, createDebugStub } from './test-helpers'

const CAN_SOCKET = require.resolve('@canboat/canboatjs/dist/canSocket')

class FailingStopChannel {
  addListener(): void {}
  start(): void {}
  removeAllListeners(): void {}
  stop(): void {
    throw new Error('stop failed')
  }
}

describe('J1939Can', () => {
  let saved: NodeJS.Module | undefined

  beforeEach(() => {
    saved = require.cache[CAN_SOCKET]
    require.cache[CAN_SOCKET] = {
      id: CAN_SOCKET,
      filename: CAN_SOCKET,
      loaded: true,
      exports: { CanChannel: FailingStopChannel }
    } as unknown as NodeJS.Module
  })

  afterEach(() => {
    if (saved) {
      require.cache[CAN_SOCKET] = saved
    } else {
      delete require.cache[CAN_SOCKET]
    }
  })

  it('ends even when the CAN channel fails to stop', () => {
    const stream = new J1939Can({
      app: createMockApp(),
      interface: 'can0',
      createDebug: createDebugStub()
    })

    expect(() => stream.end()).to.not.throw()
    expect(stream.writableEnded).to.equal(true)
  })
})
