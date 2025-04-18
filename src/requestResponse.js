import { v4 as uuidv4 } from 'uuid'
import { createDebug } from './debug.js'
const debug = createDebug('signalk-server:requestResponse')

const requests = {}

const pruneRequestTimeout = 60 * 60 * 1000
const pruneIntervalRate = 15 * 60 * 1000
let pruneInterval

export function createRequest(
  app,
  type,
  clientRequest,
  user,
  clientIp,
  updateCb
) {
  return new Promise((resolve) => {
    const requestId = clientRequest.requestId
      ? clientRequest.requestId
      : uuidv4()
    const request = {
      requestId: requestId,
      type: type,
      clientRequest: clientRequest,
      ip: clientIp || undefined,
      date: new Date(),
      state: 'PENDING',
      statusCode: 202,
      updateCb: updateCb,
      user: user || undefined
    }
    requests[request.requestId] = request
    debug('createRequest %j', request)

    if (!pruneInterval) {
      pruneInterval = setInterval(pruneRequests, pruneIntervalRate)
      app.intervals.push(pruneInterval)
    }

    resolve(request)
  })
}

export function createReply(request) {
  const reply = {
    state: request.state,
    requestId: request.requestId,
    [request.type]: request.data,
    statusCode: request.statusCode,
    message: request.message,
    href: `/signalk/v1/requests/${request.requestId}`,
    ip: request.ip,
    user: request.user
  }
  debug('createReply %j', reply)
  return reply
}

export function updateRequest(
  requestId,
  state,
  { statusCode = null, data = null, message = null, percentComplete = null }
) {
  return new Promise((resolve, reject) => {
    const request = requests[requestId]

    if (!request) {
      reject(new Error('request not found'))
    } else {
      if (state) {
        request.state = state
      }
      if (statusCode != null) {
        request.statusCode = statusCode
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

export function queryRequest(requestId) {
  return new Promise((resolve, reject) => {
    const request = requests[requestId]

    if (!requestId || !request) {
      reject(new Error('not found'))
      return
    }

    resolve(createReply(request))
  })
}

export function findRequest(matcher) {
  return Object.values(requests).find(matcher)
}

export function filterRequests(type, state) {
  return Object.values(requests).filter(
    (r) => r.type === type && (state === null || r.state === state)
  )
}

export function pruneRequests() {
  debug('pruning requests')
  Object.keys(requests).forEach((id) => {
    const request = requests[id]

    const diff = new Date() - new Date(request.date)
    if (diff > pruneRequestTimeout) {
      delete requests[id]
      debug('pruned request %s', id)
    }
  })
}
