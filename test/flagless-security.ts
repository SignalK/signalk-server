import type { SecurityStrategy, WSConnection } from '../src/security'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tokenSecurityFactory = require('../src/tokensecurity')

// A security strategy that authorizes like tokensecurity but leaves
// skIsAuthenticated unset, as strategies other than tokensecurity may.
module.exports = function (app: unknown, config: unknown): SecurityStrategy {
  const strategy: SecurityStrategy = tokenSecurityFactory(app, config)
  const authorizeWS = strategy.authorizeWS
  strategy.authorizeWS = (req: WSConnection) => {
    authorizeWS(req)
    delete req.skIsAuthenticated
  }
  return strategy
}
