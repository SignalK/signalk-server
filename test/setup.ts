process.env.SKIP_NODE_VERSION_CHECK = 'true'

const originalConsoleError = console.error
console.error = (...args: unknown[]) => {
  if (args.length === 1 && typeof args[0] === 'string') {
    if (args[0].includes('Too many pending access requests')) {
      return
    }
  }
  originalConsoleError(...args)
}
