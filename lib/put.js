const _ = require('lodash')
const debug = require('debug')('signalk-server:put')
const uuidv4 = require('uuid/v4')
const { createRequest, updateRequest } = require('./requestResponse')

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

const Result = {
  success: 'SUCCESS',
  failure: 'FAILURE'
}

const actionHandlers = {}
const actions = {}
var nextActionId = 1

const pruneActionTimeout = 60 * 60 * 1000
const pruneInterval = 15 * 60 * 1000

module.exports = {
  start: function (app) {
    app.registerActionHandler = registerActionHandler
    app.deRegisterActionHandler = deRegisterActionHandler

    setInterval(pruneActions, pruneInterval)

    app.get(apiPathPrefix + 'actions', function (req, res, next) {
      res.json(actions)
    })

    app.get(apiPathPrefix + 'actions/:id', function (req, res, next) {
      var action = actions[req.params.id]
      if (!action) {
        res.status(404).send()
      } else {
        res.json(action)
      }
    })

    app.put(apiPathPrefix + '*', function (req, res, next) {
      var path = String(req.path).replace(apiPathPrefix, '')

      var value = req.body

      if (_.isUndefined(value.value)) {
        res.status(400).send('input is missing a value')
        return
      }

      path = path.replace(/\/$/, '').replace(/\//g, '.')

      var parts = path.length > 0 ? path.split('.') : []

      if (parts.length < 3) {
        res.status(400).send('invalid path')
        return
      }

      var context = `${parts[0]}.${parts[1]}`
      var skpath = parts.slice(2).join('.')

      putPath(app, context, skpath, value, req)
        .then(reply => {
          res.status(reply.result)
          res.json(reply)
        })
        .catch(err => {
          console.error(err)
          res.status(500).send(err.message)
        })
    })
  },

  registerActionHandler: registerActionHandler,
  putPath: putPath
}

function putPath (app, context, path, body, req, requestId, updateCb) {
  debug('received put %s %s %j', context, path, body)
  return new Promise((resolve, reject) => {
    createRequest(
      'put',
      {
        context: context,
        requestId: requestId,
        put: { path: path, value: body.value }
      },
      req && req.skPrincipal ? req.skPrincipal.identifier : undefined,
      null,
      updateCb
    )
      .then(request => {
        if (
          req &&
          app.securityStrategy.shouldAllowPut(req, context, null, path) == false
        ) {
          updateRequest(request.requestId, 'COMPLETED', { result: 403 })
            .then(resolve)
            .catch(reject)
          return
        }

        var handlers = actionHandlers[context]
          ? actionHandlers[context][path]
          : null
        var handler

        if (_.keys(handlers).length > 0) {
          if (body.source) {
            handler = handlers[body.source]
          } else if (_.keys(handlers).length == 1) {
            handler = _.values(handlers)[0]
          } else {
            updateRequest(request.requestId, 'COMPLETED', {
              result: 400,
              message:
                'there are multiple sources for the given path, but no source was specified in the request'
            })
              .then(resolve)
              .catch(reject)
            return
          }
        }

        if (handler) {
          function fixReply (reply) {
            if (reply.state === 'FAILURE') {
              reply.state = 'COMPLETED'
              reply.result = 502
            } else if (reply.state === 'SUCCESS') {
              reply.state = 'COMPLETED'
              reply.result = 200
            }
          }

          var actionResult = handler(context, path, body.value, reply => {
            fixReply(reply)
            updateRequest(request.requestId, reply.state, reply)
              .then(request => {})
              .catch(err => {
                console.error(err)
              })
          })

          Promise.resolve(actionResult)
            .then(result => {
              fixReply(result)
              updateRequest(request.requestId, result.state, result)
                .then(reply => {
                  if (reply.state === 'PENDING') {
                    // backwards compatibility
                    reply.action = { href: reply.href }
                  }
                  resolve(reply)
                })
                .catch(reject)
            })
            .catch(err => {
              updateRequest(request.requestId, 'COMPLETED', {
                result: 500,
                message: err.message
              })
                .then(resolve)
                .catch(reject)
            })
        } else if (
          app.interfaces['ws'] &&
          app.interfaces.ws.handlePut(
            request.requestId,
            context,
            path,
            body.source,
            body.value
          )
        ) {
          updateRequest(request.requestId, 'PENDING')
            .then(resolve)
            .catch(reject)
        } else {
          updateRequest(request.requestId, 'COMPLETED', {
            result: 405,
            message: `PUT not supported for ${path}`
          })
            .then(resolve)
            .catch(reject)
        }
      })
      .catch(reject)
  })
}

function registerActionHandler (context, path, source, callback) {
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

function deRegisterActionHandler (context, path, source, callback) {
  if (
    actionHandlers[context] &&
    actionHandlers[context][path][source] == callback
  ) {
    delete actionHandlers[context][path][source]
    debug(`de-registered action handler for ${context} ${path} ${source}`)
  }
}

function asyncCallback (actionId, status) {
  var action = actions[actionId]
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

function pruneActions () {
  debug('pruning actions')
  _.keys(actions).forEach(id => {
    var action = actions[id]

    var diff = new Date() - new Date(action['end-time'])
    if (diff > pruneActionTimeout) {
      delete actions[id]
      debug('pruned action %d', id)
    }
  })
}
