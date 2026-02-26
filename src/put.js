const _ = require('lodash')
import { createDebug } from './debug'
const debug = createDebug('signalk-server:put')
const { createRequest, updateRequest } = require('./requestResponse')
const skConfig = require('./config/config')
const { getMetadata } = require('@signalk/server-api')
const { validateCategoryAssignment } = require('./unitpreferences')

const pathPrefix = '/signalk'
const versionPrefix = '/v1'
const apiPathPrefix = pathPrefix + versionPrefix + '/api/'

const actionHandlers = {}
let putMetaHandler, deleteMetaHandler, putNotificationHandler

module.exports = {
  start: function (app) {
    app.registerActionHandler = registerActionHandler
    app.deRegisterActionHandler = deRegisterActionHandler

    app.delete(apiPathPrefix + '*', function (req, res) {
      let path = String(req.path).replace(apiPathPrefix, '')

      path = path.replace(/\/$/, '').replace(/\//g, '.')

      const parts = path.length > 0 ? path.split('.') : []

      if (parts.length < 3) {
        res.status(400).send('invalid path')
        return
      }

      const context = `${parts[0]}.${parts[1]}`
      const skpath = parts.slice(2).join('.')

      deletePath(app, context, skpath, req)
        .then((reply) => {
          res.status(reply.statusCode)
          res.json(reply)
        })
        .catch((err) => {
          console.error(err)
          res.status(500).send(err.message)
        })
    })

    app.put(apiPathPrefix + '*', function (req, res) {
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
        .then((reply) => {
          res.status(reply.statusCode)
          res.json(reply)
        })
        .catch((err) => {
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

      // Validate displayUnits.category if present
      if (metaValue.displayUnits?.category) {
        const schemaMeta = getMetadata('vessels.self.' + metaPath)
        // Allow override: use PUT's units if provided, otherwise use schema's units
        const pathSiUnit = metaValue.units || schemaMeta?.units
        const validationError = validateCategoryAssignment(
          pathSiUnit,
          metaValue.displayUnits.category
        )
        if (validationError) {
          return {
            state: 'COMPLETED',
            statusCode: 400,
            message: validationError
          }
        }
      }

      // set empty zones array explicitly to null
      for (const prop in metaValue) {
        if (Array.isArray(metaValue[prop]) && metaValue[prop].length === 0) {
          metaValue[prop] = null
        }
      }

      app.config.baseDeltaEditor.setMeta(context, metaPath, metaValue)

      let full_meta = getMetadata('vessels.self.' + metaPath)

      app.handleMessage('defaults', {
        context: 'vessels.self',
        updates: [
          {
            meta: [
              {
                path: metaPath,
                value: { ...full_meta, ...metaValue }
              }
            ]
          }
        ]
      })

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

        skConfig.writeDefaultsFile(app, data, (err) => {
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
          .catch(() => {
            cb({ state: 'FAILURE', message: 'Unable to save to defaults file' })
          })
      }

      return { state: 'PENDING' }
    }

    deleteMetaHandler = (context, path, cb) => {
      let parts = path.split('.')
      let metaPath = path
      let full_meta

      //fixme, make sure meta path exists...

      if (parts[parts.length - 1] !== 'meta') {
        let name = parts[parts.length - 1]
        metaPath = parts.slice(0, parts.length - 2).join('.')

        let metaValue = {
          ...app.config.baseDeltaEditor.getMeta(context, metaPath)
        }

        if (typeof metaValue[name] === 'undefined') {
          return { state: 'COMPLETED', statusCode: 404 }
        }

        delete metaValue[name]

        full_meta = getMetadata('vessels.self.' + metaPath)
        delete full_meta[name]

        app.config.baseDeltaEditor.setMeta(context, metaPath, metaValue)

        if (Object.keys(metaValue).length === 0) {
          app.config.baseDeltaEditor.removeMeta(context, metaPath)
        }
      } else {
        metaPath = parts.slice(0, parts.length - 1).join('.')

        full_meta = getMetadata('vessels.self.' + metaPath)
        let metaValue = app.config.baseDeltaEditor.getMeta(context, metaPath)

        if (!metaValue) {
          return { state: 'COMPLETED', statusCode: 404 }
        }

        Object.keys(metaValue).forEach((key) => {
          delete full_meta[key]
        })

        app.config.baseDeltaEditor.removeMeta(context, metaPath)
      }

      app.handleMessage('defaults', {
        context: 'vessels.self',
        updates: [
          {
            meta: [
              {
                path: metaPath,
                value: full_meta
              }
            ]
          }
        ]
      })

      skConfig
        .writeBaseDeltasFile(app, app.config.baseDeltas)
        .then(() => {
          cb({ state: 'COMPLETED', statusCode: 200 })
        })
        .catch(() => {
          cb({
            state: 'COMPLETED',
            statusCode: 502,
            message: 'Unable to save to defaults file'
          })
        })

      return { state: 'PENDING' }
    }
    putNotificationHandler = (context, path, value) => {
      return putNotification(app, context, path, value)
    }
  },

  registerActionHandler: registerActionHandler,
  putPath: putPath,
  deletePath
}

function deletePath(app, contextParam, path, req, requestId, updateCb) {
  const context = contextParam || 'vessels.self'
  debug('received delete %s %s', context, path)
  return new Promise((resolve, reject) => {
    createRequest(
      app,
      'delete',
      {
        context: context,
        requestId: requestId,
        delete: { path: path }
      },
      req && req.skPrincipal ? req.skPrincipal.identifier : undefined,
      null,
      updateCb
    )
      .then((request) => {
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

        const parts = path.split('.')
        let handler

        if (
          (parts.length > 1 && parts[parts.length - 1] === 'meta') ||
          (parts.length > 1 && parts[parts.length - 2] === 'meta')
        ) {
          handler = deleteMetaHandler
        }

        if (handler) {
          const actionResult = handler(context, path, (reply) => {
            debug('got result: %j', reply)
            updateRequest(request.requestId, reply.state, reply)
              .then(() => undefined)
              .catch((err) => {
                console.error(err)
              })
          })

          Promise.resolve(actionResult)
            .then((result) => {
              debug('got result: %j', result)
              updateRequest(request.requestId, result.state, result)
                .then((reply) => {
                  if (reply.state === 'PENDING') {
                    // backwards compatibility
                    reply.action = { href: reply.href }
                  }
                  resolve(reply)
                })
                .catch(reject)
            })
            .catch((err) => {
              updateRequest(request.requestId, 'COMPLETED', {
                statusCode: 500,
                message: err.message
              })
                .then(resolve)
                .catch(reject)
            })
        } else {
          updateRequest(request.requestId, 'COMPLETED', {
            statusCode: 405,
            message: `DELTETE not supported for ${path}`
          })
            .then(resolve)
            .catch(reject)
        }
      })
      .catch(reject)
  })
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
      .then((request) => {
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

          if (!handler && parts[0] === 'notifications') {
            handler = putNotificationHandler
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

          const actionResult = handler(context, path, body.value, (reply) => {
            debug('got result: %j', reply)
            fixReply(reply)
            updateRequest(request.requestId, reply.state, reply)
              .then(() => undefined)
              .catch((err) => {
                console.error(err)
              })
          })

          Promise.resolve(actionResult)
            .then((result) => {
              debug('got result: %j', result)
              fixReply(result)
              updateRequest(request.requestId, result.state, result)
                .then((reply) => {
                  if (reply.state === 'PENDING') {
                    // backwards compatibility
                    reply.action = { href: reply.href }
                  }
                  resolve(reply)
                })
                .catch(reject)
            })
            .catch((err) => {
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

function putNotification(app, context, path, value) {
  const parts = path.split('.')
  const notifPath = parts.slice(0, parts.length - 1).join('.')
  const key = parts[parts.length - 1]

  const existing = _.get(app.signalk.self, notifPath)

  if (_.isUndefined(existing) || !existing.value) {
    return { state: 'COMPLETED', statusCode: 404 }
  }

  if (key !== 'method' && key !== 'state') {
    return { state: 'COMPLETED', statusCode: 405 }
  }

  existing.value[key] = value
  existing.timestamp = new Date().toISOString()

  const delta = {
    updates: [
      {
        $source: existing.$source,
        values: [
          {
            path: notifPath,
            value: existing.value
          }
        ]
      }
    ]
  }
  app.handleMessage('server', delta)

  return { state: 'COMPLETED', statusCode: 200 }
}
