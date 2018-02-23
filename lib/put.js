const _ = require('lodash')
const debug = require('debug')('signalk-server:interfaces:put')

const actionHandlers = {}
const pathPrefix = '/signalk'
const versionPrefix = '/v1'
const apiPathPrefix = pathPrefix + versionPrefix + '/api/'

module.exports = function (app) {
  function registerActionHandler (context, path, callback) {
    debug(`registered action handler for ${context} ${path}`)

    if (_.isUndefined(actionHandlers[context])) {
      actionHandlers[context] = {}
    }
    actionHandlers[context][path] = callback
  }

  function actionResult (context, path, result) {}

  app.registerActionHandler = registerActionHandler

  app.put(apiPathPrefix + '*', function (req, res, next) {
    if (
      app.securityStrategy &&
      app.securityStrategy.shouldAllowWrite(req) == false
    ) {
      res.status(403).send('no permission')
      return
    }

    var path = String(req.path).replace(apiPathPrefix, '')

    path = path.length > 0 ? path.replace(/\/$/, '').split('/') : []

    var value = req.body

    if (_.isUndefined(value.value)) {
      res.status(400).send('input is missing a value')
      return
    }

    if (path.length > 2) {
      var context = `${path[0]}.${path[1]}`
      var skpath = path.slice(2).join('.')
      if (actionHandlers[context] && actionHandlers[context][skpath]) {
        var status = actionHandlers[context][skpath](
          context,
          skpath,
          value.value,
          actionResult
        )
        res.status(status === 'HANDLED' ? 200 : 202).send()
      } else if (app.interfaces['ws']) {
        app.interfaces.ws.handlePut(context, skpath, value.value)
        res.status(202).send()
      } else {
        res.status(405).send()
      }
    } else {
      res.status(405).send()
    }
  })
}
