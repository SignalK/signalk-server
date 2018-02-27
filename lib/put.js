const _ = require('lodash')
const debug = require('debug')('signalk-server:put')

const pathPrefix = '/signalk'
const versionPrefix = '/v1'
const apiPathPrefix = pathPrefix + versionPrefix + '/api/'

const State = {
  pending: 'PENDING',
  completed: 'COMPLETED',
  notSupported: 'NOT SUPPORTED'
}

const Result = {
  success: 'SUCCESS',
  failure: 'FAILURE'
}

const actionHandlers = {}
const actions = {}
var nextActionId = 1

module.exports = {
  start: function (app) {
    app.registerActionHandler = registerActionHandler

    app.get(apiPathPrefix + 'actions/:id', function (req, res, next) {
      var action = actions[req.params.id]
      if (!action) {
        res.status(404).send()
      } else {
        res.json(action)
      }
    })

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
      var info = putPath(app, path, value)
      if (info.state === State.completed) {
        res.status(200)
      } else if (info.state === State.pending) {
        res.status(202)
      } else {
        res.status(405)
      }
      res.json(info)
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
      var jobId = nextActionId++

      var info = actionHandlers[context][skpath](
        jobId,
        context,
        skpath,
        value.value,
        actionResult
      )
      if (info.state === State.pending) {
        actions[jobId] = {
          id: jobId,
          path: skpath,
          context: context,
          requestedValue: value,
          state: info.state,
          'start-time': new Date().toISOString()
        }

        return {
          state: info.state,
          action: {
            id: jobId,
            href: apiPathPrefix + `actions/${jobId}`
          }
        }
      } else {
        return info
      }
    } else if (
      app.interfaces['ws'] &&
      app.interfaces.ws.handlePut(context, skpath, value.value)
    ) {
      return { state: State.pending }
    }
  }
  return { state: State.notSupported }
}

function registerActionHandler (context, path, callback) {
  debug(`registered action handler for ${context} ${path}`)

  if (_.isUndefined(actionHandlers[context])) {
    actionHandlers[context] = {}
  }
  actionHandlers[context][path] = callback
}

function actionResult (actionId, result, message) {
  var action = actions[actionId]
  if (action) {
    action.state = State.COMPLETED
    action.result = result
    action['end-time'] = new Date().toISOString()
    if (message) {
      action.message = message
    }
  }
}
