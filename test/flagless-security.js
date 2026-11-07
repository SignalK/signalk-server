// A security strategy that authorizes like tokensecurity but leaves
// skIsAuthenticated unset, as strategies other than tokensecurity may.
module.exports = function (app, config) {
  const strategy = require('../dist/tokensecurity')(app, config)
  const authorizeWS = strategy.authorizeWS
  strategy.authorizeWS = function (req) {
    authorizeWS(req)
    delete req.skIsAuthenticated
  }
  return strategy
}
