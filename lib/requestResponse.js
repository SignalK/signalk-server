const uuidv4 = require('uuid/v4')
const debug = require('debug')('signalk-server:requestResponse')
const _ = require('lodash')

const requests = {}

function createRequest (type, clientRequest, user, clientIp, updateCb) {
  return new Promise((resolve, reject) => {
    let requestId = clientRequest.requestId ? clientRequest.requestId : uuidv4()
    const request = {
      requestId: requestId,
      type: type,
      clientRequest: clientRequest,
      ip: clientIp || undefined,
      date: new Date(),
      state: 'PENDING',
      updateCb: updateCb,
      user: user || undefined
    }
    requests[request.requestId] = request
    debug('createRequest %j', request)
    resolve(request)
  })
}

function createReply (request) {
  const reply = {
    state: request.state,
    requestId: request.requestId,
    [request.type]: request.data,
    result: request.result,
    message: request.message,
    href: `/signalk/v1/requests/${request.requestId}`,
    ip: request.ip,
    user: request.user
  }
  debug('createReply %j', reply)
  return reply
}

function updateRequest (
  requestId,
  state,
  { result = null, data = null, message = null, percentComplete = null }
) {
  return new Promise((resolve, reject) => {
    const request = requests[requestId]

    if (!request) {
      reject(new Error('request not found'))
    } else {
      if (state) {
        request.state = state
      }
      if (result != null) {
        request.result = result
      }
      if (message) {
        request.message = message
      }
      if (percentComplete != null) {
        request.percentComplete = percentComplete
      }

      if (data) {
        request.data = data
      }

      const reply = createReply(request)
      if (request.updateCb) {
        request.updateCb(reply)
      }
      resolve(reply)
    }
  })
}

function queryRequest (requestId) {
  return new Promise((resolve, reject) => {
    const request = requests[requestId]

    if (!requestId) {
      reject(new Error('not found'))
      return
    }

    resolve(createReply(request))
  })
}

function findRequest (matcher) {
  return _.values(requests).find(matcher)
}

function filterRequests (type, state) {
  return _.values(requests).filter(
    r => r.type == type && (state === null || r.state == state)
  )
}

module.exports = {
  createRequest,
  updateRequest,
  findRequest,
  filterRequests,
  queryRequest
}
