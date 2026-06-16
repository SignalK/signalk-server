import { expect } from 'chai'
import { getGlobalDispatcher, setGlobalDispatcher, Agent } from 'undici'

// networkConfig sets a global undici dispatcher at import time so that
// every fetch() in the server uses a relaxed Happy Eyeballs per-attempt
// connect timeout. Loading the compiled module is the behaviour under
// test: it must replace the global dispatcher with its own Agent.
const modulePath = require.resolve('../dist/networkConfig.js')

describe('networkConfig global dispatcher', () => {
  it('installs a new global dispatcher on load', () => {
    const sentinel = new Agent()
    setGlobalDispatcher(sentinel)
    delete require.cache[modulePath]

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../dist/networkConfig.js')

    const installed = getGlobalDispatcher()
    expect(installed).to.be.instanceOf(Agent)
    expect(installed).to.not.equal(sentinel)
  })
})
