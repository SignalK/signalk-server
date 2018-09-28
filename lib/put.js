const _ = require('lodash')
const debug = require('debug')('signalk-server:put')
const uuidv4 = require('uuid/v4')

const pathPrefix = '/signalk'
const versionPrefix = '/v1'
const apiPathPrefix = pathPrefix + versionPrefix + '/api/'

const State = {
  pending: 'PENDING',
  completed: 'COMPLETED',
  notSupported: 'NOT SUPPORTED',
  denied: 'PERMISSION DENIED',
  noSource: 'NO SOURCE'
}

const actionHandlers = {}
const actions = {}

const pruneActionTimeout = 60 * 60 * 1000
const pruneInterval = 15 * 60 * 1000

module.exports = {
  start: function(app) {
    app.registerActionHandler = registerActionHandler
    app.deRegisterActionHandler = deRegisterActionHandler

    setInterval(pruneActions, pruneInterval)

    app.get(apiPathPrefix + 'actions', function(req, res) {
      res.json(actions)
    })

    app.get(apiPathPrefix + 'actions/:id', function(req, res) {
      const action = actions[req.params.id]
      if (!action) {
        res.status(404).send()
      } else {
        res.json(action)
      }
    })

    app.put(apiPathPrefix + '*', function(req, res) {
      let path = String(req.path).replace(apiPathPrefix, '')

      const value = req.body

      if (_.isUndefined(value.value)) {
        res.status(400).send('input is missing a value')
        return
      }

      path = path.replace(/\/$/, '').replace(/\//g, '.')
      let actionResult = putPath(app, path, value, req)
      if (actionResult.state === State.denied) {
        res.status(403)
      } else if (actionResult.state === State.noSource) {
        res.status(400)
        res.send(
          'there are multiple sources for the given path, but no source was specified in the request'
        )
        actionResult = null
      } else if (actionResult.state === State.completed) {
        res.status(actionResult.resultStatus || 200)
      } else if (actionResult.state === State.pending) {
        if (req.skUser) {
          actions[actionResult.action.id].user = req.skUser.id
        }

        res.status(202)
      } else {
        res.status(405)
      }
      if (actionResult) {
        res.json(actionResult)
      }
    })
  },

  registerActionHandler: registerActionHandler,
  putPath: putPath
}

function putPath(app, fullPath, value, req) {
  const path = fullPath.length > 0 ? fullPath.split('.') : []

  if (path.length > 2) {
    const context = `${path[0]}.${path[1]}`
    const skpath = path.slice(2).join('.')

    if (
      req &&
      app.securityStrategy.shouldAllowPut(req, context, null, skpath) === false
    ) {
      return { state: State.denied }
    }

    const handlers = actionHandlers[context]
      ? actionHandlers[context][skpath]
      : null
    let handler

    if (_.keys(handlers).length > 0) {
      if (value.source) {
        handler = handlers[value.source]
      } else if (_.keys(handlers).length === 1) {
        handler = _.values(handlers)[0]
      } else {
        return { state: State.noSource }
      }
    }

    if (handler) {
      const jobId = uuidv4()

      const actionResult = handler(context, skpath, value.value, result => {
        asyncCallback(jobId, result)
      })
      if (actionResult.state === State.pending) {
        actions[jobId] = {
          id: jobId,
          path: skpath,
          context: context,
          requestedValue: value.value,
          state: actionResult.state,
          startTime: new Date().toISOString()
        }

        return {
          state: actionResult.state,
          action: {
            id: jobId,
            href: apiPathPrefix + `actions/${jobId}`
          }
        }
      } else {
        return actionResult
      }
    } else if (
      app.interfaces['ws'] &&
      app.interfaces.ws.handlePut(context, skpath, value.source, value.value)
    ) {
      return { state: State.pending }
    }
  }
  return { state: State.notSupported }
}

function registerActionHandler(context, path, source, callback) {
  debug(`registered action handler for ${context} ${path}`)

  if (_.isUndefined(actionHandlers[context])) {
    actionHandlers[context] = {}
  }
  if (_.isUndefined(actionHandlers[context][path])) {
    actionHandlers[context][path] = {}
  }
  actionHandlers[context][path][source] = callback

  return () => {
    deRegisterActionHandler(context, path, source, callback)
  }
}

function deRegisterActionHandler(context, path, source, callback) {
  if (
    actionHandlers[context] &&
    actionHandlers[context][path][source] === callback
  ) {
    delete actionHandlers[context][path][source]
    debug(`de-registered action handler for ${context} ${path} ${source}`)
  }
}

function asyncCallback(actionId, status) {
  const action = actions[actionId]
  if (action) {
    action.state = status.state
    action.result = status.result
    action['endTime'] = new Date().toISOString()
    if (status.message) {
      action.message = status.message
    }
    if (status.percentComplete) {
      action.percentComplete = status.percentComplete
    }
  }
}

function pruneActions() {
  debug('pruning actions')
  _.keys(actions).forEach(id => {
    const action = actions[id]

    const diff = new Date() - new Date(action['end-time'])
    if (diff > pruneActionTimeout) {
      delete actions[id]
      debug('pruned action %d', id)
    }
  })
}
