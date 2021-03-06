const _ = require('lodash')
const debug = require('debug')('signalk-server:put')
const { v4: uuidv4 } = require('uuid')
const { createRequest, updateRequest } = require('./requestResponse')
const skConfig = require('./config/config')

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
let putMetaHandler

module.exports = {
  start: function(app) {
    app.registerActionHandler = registerActionHandler
    app.deRegisterActionHandler = deRegisterActionHandler

    app.put(apiPathPrefix + '*', function(req, res, next) {
      let path = String(req.path).replace(apiPathPrefix, '')

      const value = req.body

      if (_.isUndefined(value.value)) {
        res.status(400).send('input is missing a value')
        return
      }

      path = path.replace(/\/$/, '').replace(/\//g, '.')

      const parts = path.length > 0 ? path.split('.') : []

      if (parts.length < 3) {
        res.status(400).send('invalid path')
        return
      }

      const context = `${parts[0]}.${parts[1]}`
      const skpath = parts.slice(2).join('.')

      putPath(app, context, skpath, value, req)
        .then(reply => {
          res.status(reply.statusCode)
          res.json(reply)
        })
        .catch(err => {
          console.error(err)
          res.status(500).send(err.message)
        })
    })

    putMetaHandler = (context, path, value, cb) => {
      let parts = path.split('.')
      let metaPath = path
      let metaValue = value

      if (parts[parts.length - 1] !== 'meta') {
        let name = parts[parts.length - 1]
        metaPath = parts.slice(0, parts.length - 2).join('.')

        metaValue = {
          ...app.config.baseDeltaEditor.getMeta(context, metaPath),
          [name]: value
        }
      } else {
        metaPath = parts.slice(0, parts.length - 1).join('.')
      }

      app.config.baseDeltaEditor.setMeta(context, metaPath, metaValue)
      skConfig.sendBaseDeltas(app)

      if (app.config.hasOldDefaults) {
        let data

        try {
          data = skConfig.readDefaultsFile(app)
        } catch (e) {
          if (e.code && e.code === 'ENOENT') {
            data = {}
          } else {
            console.error(e)
            cb({ state: 'FAILURE', message: 'Unable to read defaults file' })
            return
          }
        }

        const pathWithContext = context + '.' + path
        _.set(data, pathWithContext, value)

        skConfig.writeDefaultsFile(app, data, err => {
          if (err) {
            cb({ state: 'FAILURE', message: 'Unable to save to defaults file' })
          } else {
            cb({ state: 'SUCCESS' })
          }
        })
      } else {
        skConfig
          .writeBaseDeltasFile(app, app.config.baseDeltas)
          .then(() => {
            cb({ state: 'SUCCESS' })
          })
          .catch(err => {
            cb({ state: 'FAILURE', message: 'Unable to save to defaults file' })
          })
      }

      return { state: 'PENDING' }
    }
  },

  registerActionHandler: registerActionHandler,
  putPath: putPath
}

function putPath(app, contextParam, path, body, req, requestId, updateCb) {
  const context = contextParam || 'vessels.self'
  debug('received put %s %s %j', context, path, body)
  return new Promise((resolve, reject) => {
    createRequest(
      app,
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
          app.securityStrategy.shouldAllowPut(req, context, null, path) ===
            false
        ) {
          updateRequest(request.requestId, 'COMPLETED', { statusCode: 403 })
            .then(resolve)
            .catch(reject)
          return
        }

        let handler
        const parts = path.split('.')

        if (
          (parts.length > 1 && parts[parts.length - 1] === 'meta') ||
          (parts.length > 1 && parts[parts.length - 2] === 'meta')
        ) {
          handler = putMetaHandler
        } else {
          const handlers = actionHandlers[context]
            ? actionHandlers[context][path]
            : null

          if (_.keys(handlers).length > 0) {
            if (body.source) {
              handler = handlers[body.source]
            } else if (_.keys(handlers).length === 1) {
              handler = _.values(handlers)[0]
            } else {
              updateRequest(request.requestId, 'COMPLETED', {
                statusCode: 400,
                message:
                  'there are multiple sources for the given path, but no source was specified in the request'
              })
                .then(resolve)
                .catch(reject)
              return
            }
          }
        }

        if (handler) {
          function fixReply(reply) {
            if (reply.state === 'FAILURE') {
              reply.state = 'COMPLETED'
              reply.statusCode = 502
            } else if (reply.state === 'SUCCESS') {
              reply.state = 'COMPLETED'
              reply.statusCode = 200
            }
          }

          const actionResult = handler(context, path, body.value, reply => {
            debug('got result: %j', reply)
            fixReply(reply)
            updateRequest(request.requestId, reply.state, reply)
              .then(() => undefined)
              .catch(err => {
                console.error(err)
              })
          })

          Promise.resolve(actionResult)
            .then(result => {
              debug('got result: %j', result)
              fixReply(result)
              updateRequest(request.requestId, result.state, result)
                .then(reply => {
                  if (reply.state === 'PENDING') {
                    // backwards compatibility
                    reply.action = { href: reply.href }
                    reply.statusCode = 202
                  }
                  resolve(reply)
                })
                .catch(reject)
            })
            .catch(err => {
              updateRequest(request.requestId, 'COMPLETED', {
                statusCode: 500,
                message: err.message
              })
                .then(resolve)
                .catch(reject)
            })
        } else if (
          app.interfaces.ws &&
          app.interfaces.ws.canHandlePut(path, body.source)
        ) {
          app.interfaces.ws
            .handlePut(
              request.requestId,
              context,
              path,
              body.source,
              body.value
            )
            .then(resolve)
            .catch(reject)
        } else {
          updateRequest(request.requestId, 'COMPLETED', {
            statusCode: 405,
            message: `PUT not supported for ${path}`
          })
            .then(resolve)
            .catch(reject)
        }
      })
      .catch(reject)
  })
}

function registerActionHandler(context, path, source, callback) {
  debug(`registered action handler for ${context} ${path} ${source}`)

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
