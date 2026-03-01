import { v4 as uuidv4 } from 'uuid'
import { createDebug } from './debug'

const debug = createDebug('signalk-server:requestResponse')

export type RequestState = 'PENDING' | 'COMPLETED'
export type RequestType = 'put' | 'delete' | 'accessRequest'

export interface ClientRequest {
  requestId?: string
  [key: string]: unknown
}

export interface Request {
  requestId: string
  type: RequestType
  clientRequest: ClientRequest
  ip?: string
  date: Date
  state: RequestState
  statusCode: number
  updateCb?: (reply: Reply) => void
  user?: string
  message?: string
  data?: unknown
  percentComplete?: number
  accessIdentifier?: string
  accessDescription?: string
  accessPassword?: string
  requestedPermissions?: boolean
  permissions?: string
  token?: string
}

export interface AccessRequestData {
  permission?: string
  token?: string
}

export interface Reply {
  state: RequestState
  requestId: string
  statusCode: number
  message?: string
  href: string
  ip?: string
  user?: string
  put?: unknown
  delete?: unknown
  accessRequest?: AccessRequestData
}

export interface UpdateOptions {
  statusCode?: number | null
  data?: unknown | null
  message?: string | null
  percentComplete?: number | null
}

interface AppWithIntervals {
  intervals: NodeJS.Timeout[]
}

const requests: Record<string, Request> = {}

const pruneRequestTimeout = 60 * 60 * 1000
const pruneIntervalRate = 15 * 60 * 1000
let pruneInterval: NodeJS.Timeout | undefined

export function resetRequests(): void {
  Object.keys(requests).forEach((id) => {
    delete requests[id]
  })
}

export function createRequest(
  app: AppWithIntervals,
  type: RequestType,
  clientRequest: ClientRequest,
  user?: string,
  clientIp?: string,
  updateCb?: (reply: Reply) => void
): Promise<Request> {
  return new Promise((resolve) => {
    const requestId = clientRequest.requestId
      ? clientRequest.requestId
      : uuidv4()
    const request: Request = {
      requestId: requestId,
      type: type,
      clientRequest: clientRequest,
      ip: clientIp,
      date: new Date(),
      state: 'PENDING',
      statusCode: 202,
      updateCb: updateCb,
      user: user
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

function createReply(request: Request): Reply {
  const reply: Reply = {
    state: request.state,
    requestId: request.requestId,
    statusCode: request.statusCode,
    message: request.message,
    href: `/signalk/v1/requests/${request.requestId}`,
    ip: request.ip,
    user: request.user
  }
  if (request.type === 'put') {
    reply.put = request.data
  } else if (request.type === 'delete') {
    reply.delete = request.data
  } else if (request.type === 'accessRequest') {
    reply.accessRequest = request.data as AccessRequestData
  }
  debug('createReply %j', reply)
  return reply
}

export function updateRequest(
  requestId: string,
  state: RequestState | null,
  {
    statusCode = null,
    data = null,
    message = null,
    percentComplete = null
  }: UpdateOptions
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const request = requests[requestId]

    if (!request) {
      reject(new Error('request not found'))
      return
    }

    if (state) {
      request.state = state
    }
    if (statusCode !== null) {
      request.statusCode = statusCode
    }
    if (message) {
      request.message = message
    }
    if (percentComplete !== null) {
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
  })
}

export function queryRequest(requestId: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const request = requests[requestId]

    if (!requestId || !request) {
      reject(new Error('not found'))
      return
    }

    resolve(createReply(request))
  })
}

export function findRequest(
  matcher: (request: Request) => boolean
): Request | undefined {
  return Object.values(requests).find(matcher)
}

export function filterRequests(
  type: RequestType,
  state: RequestState | null
): Request[] {
  return Object.values(requests).filter(
    (r) => r.type === type && (state === null || r.state === state)
  )
}

function pruneRequests(): void {
  debug('pruning requests')
  Object.keys(requests).forEach((id) => {
    const request = requests[id]
    const diff = Date.now() - request.date.getTime()
    if (diff > pruneRequestTimeout) {
      delete requests[id]
      debug('pruned request %s', id)
    }
  })
}
