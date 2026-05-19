import { expect } from 'chai'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tcpInterface = require('../dist/interfaces/tcp.js')

describe('Error logging', () => {
  describe('tcp socketMessageHandler', () => {
    it('logs the full error (including stack) when subscriptionmanager.unsubscribe throws', () => {
      const originalError = console.error
      const logged: unknown[] = []
      console.error = (...args: unknown[]) => {
        logged.push(args[0])
      }

      try {
        const thrown = new Error('boom')
        const app = {
          securityStrategy: { isDummy: () => true },
          subscriptionmanager: {
            unsubscribe: () => {
              throw thrown
            }
          }
        }
        const socket = {
          name: 'testsocket',
          write: () => undefined,
          end: () => undefined
        }

        const handler = tcpInterface.socketMessageHandler(app, socket, [])
        handler({ unsubscribe: [{ path: 'foo' }] })

        // First logged argument must be the Error itself, not a string,
        // so the stack trace is preserved in the output.
        expect(logged.length).to.be.greaterThan(0)
        expect(logged[0]).to.be.instanceOf(Error)
        expect((logged[0] as Error).stack).to.be.a('string')
        expect((logged[0] as Error).stack).to.contain('Error: boom')
      } finally {
        console.error = originalError
      }
    })
  })
})
