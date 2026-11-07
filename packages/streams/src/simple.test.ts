import { expect } from 'chai'
import Simple from './simple'
import { createMockApp, createDebugStub } from './test-helpers'

// A connection's input opens as it is made. When a later element of the
// pipeline cannot be made, the input must be closed again, or a serial
// port stays open with nothing reading it.
describe('Simple: a pipeline that cannot be built', () => {
  const serialportPath = require.resolve('./serialport')
  let saved: NodeModule | undefined
  const ended: object[] = []

  before(() => {
    saved = require.cache[serialportPath]
    class FakeSerialport {
      options: object
      constructor(options: object) {
        this.options = options
      }
      pipe(destination: NodeJS.WritableStream) {
        return destination
      }
      end() {
        ended.push(this.options)
        return this
      }
    }
    require.cache[serialportPath] = {
      id: serialportPath,
      filename: serialportPath,
      loaded: true,
      exports: { default: FakeSerialport }
    } as unknown as NodeModule
  })

  after(() => {
    if (saved) {
      require.cache[serialportPath] = saved
    } else {
      delete require.cache[serialportPath]
    }
  })

  it('closes a YDWG-02 USB serial port when its quirks are refused', () => {
    const app = createMockApp()
    expect(
      () =>
        new Simple({
          app,
          providerId: 'ydwg-usb',
          type: 'NMEA2000',
          createDebug: createDebugStub(),
          emitPropertyValue: () => {},
          onPropertyValues: () => {},
          subOptions: {
            type: 'ydwg02-usb-canboatjs',
            device: '/dev/null',
            quirks: 'not-a-list' as unknown as string[]
          }
        } as unknown as ConstructorParameters<typeof Simple>[0])
    ).to.throw(/quirks/)
    expect(ended).to.have.length(1)
  })
})
