const _ = require('lodash')
const debug = require('debug')('signalk-server:put')

const pathPrefix = '/signalk'
const versionPrefix = '/v1'
const apiPathPrefix = pathPrefix + versionPrefix + '/api/'

const Result = {
  handled: 1,
  pending: 2,
  notSupported: 3
}

const actionHandlers = {}

module.exports = {
  start: function (app) {
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

      var value = req.body

      if (_.isUndefined(value.value)) {
        res.status(400).send('input is missing a value')
        return
      }

      path = path.replace(/\/$/, '').replace(/\//g, '.')
      var result = putPath(app, path, value)
      if (result === Result.handled) {
        res.status(200)
      } else if (result === Result.pending) {
        res.status(202)
      } else {
        res.status(405)
      }
      res.send()
    })
  },

  registerActionHandler: registerActionHandler,
  actionResult: actionResult,
  putPath: putPath
}

function putPath (app, fullPath, value) {
  var path = fullPath.length > 0 ? fullPath.split('.') : []

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
      return status === 'HANDLED' ? Result.handled : Result.pending
    } else if (
      app.interfaces['ws'] &&
      app.interfaces.ws.handlePut(context, skpath, value.value)
    ) {
      return Result.pending
    }
  }
  return Result.notSupported
}

function registerActionHandler (context, path, callback) {
  debug(`registered action handler for ${context} ${path}`)

  if (_.isUndefined(actionHandlers[context])) {
    actionHandlers[context] = {}
  }
  actionHandlers[context][path] = callback
}

function actionResult (context, path, result) {}
