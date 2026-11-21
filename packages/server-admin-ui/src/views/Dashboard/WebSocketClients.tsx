import { useEffect, useRef, useState } from 'react'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Collapse from 'react-bootstrap/Collapse'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronUp } from '@fortawesome/free-solid-svg-icons/faChevronUp'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons/faChevronDown'
import { faRotateRight } from '@fortawesome/free-solid-svg-icons/faRotateRight'
import { useLoginStatus } from '../../store'
import type { LoginStatus } from '../../store/types'

interface WebSocketClient {
  id: string
  ip: string
  userAgent?: string
  principal?: string
  connectedAt?: string
  serverEvents?: boolean
}

// Long enough for a busy server, short enough that a request that never
// answers does not block the reloads queued behind it.
const REQUEST_TIMEOUT_MS = 60000

const OPTIONAL_TEXT_FIELDS = ['userAgent', 'principal', 'connectedAt'] as const

// A proxy or portal in between can answer 200 with something else, and the
// table needs every entry in the shape it renders.
function isWebSocketClient(value: unknown): value is WebSocketClient {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.ip === 'string' &&
    OPTIONAL_TEXT_FIELDS.every(
      (field) => entry[field] === undefined || typeof entry[field] === 'string'
    ) &&
    (entry.serverEvents === undefined ||
      typeof entry.serverEvents === 'boolean')
  )
}

function toClients(data: unknown): WebSocketClient[] | null {
  return Array.isArray(data) && data.every(isWebSocketClient) ? data : null
}

// The server lists the clients to admins, and to everyone when security is off.
export function canListWebSocketClients(loginStatus: LoginStatus): boolean {
  return (
    loginStatus.authenticationRequired === false ||
    loginStatus.userLevel === 'admin'
  )
}

export default function WebSocketClients({
  clientCount,
  open,
  onToggle
}: {
  clientCount: number
  open: boolean
  onToggle: () => void
}) {
  const loginStatus = useLoginStatus()
  // The list belongs to the login that fetched it, so another login never
  // sees it, even while its own first request is still pending.
  const identity = `${loginStatus.status}:${loginStatus.username ?? ''}:${String(loginStatus.userLevel ?? '')}`
  const [loaded, setLoaded] = useState<{
    identity: string
    clients: WebSocketClient[] | null
  } | null>(null)
  const loadRef = useRef<(() => void) | null>(null)
  const lastClientCount = useRef(clientCount)
  const allowed = canListWebSocketClients(loginStatus)

  useEffect(() => {
    if (!open || !allowed) return
    let stopped = false
    let request: AbortController | null = null
    // One request at a time: a reload asked for while one is pending runs
    // once it has answered, so a count that changes faster than the server
    // answers cannot keep the list loading.
    let reloadWanted = false
    const load = () => {
      if (request) {
        reloadWanted = true
        return
      }
      const current = new AbortController()
      request = current
      const timeout = setTimeout(() => current.abort(), REQUEST_TIMEOUT_MS)
      const done = (clients: WebSocketClient[] | null) => {
        clearTimeout(timeout)
        if (stopped) return
        request = null
        setLoaded({ identity, clients })
        if (reloadWanted) {
          reloadWanted = false
          load()
        }
      }
      fetch(`${window.serverRoutesPrefix}/websocketClients`, {
        credentials: 'include',
        signal: current.signal
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: unknown) => done(toClients(data)))
        .catch(() => done(null))
    }
    loadRef.current = load
    load()
    return () => {
      stopped = true
      request?.abort()
      loadRef.current = null
    }
  }, [open, allowed, identity])

  // The count arrives with every server statistics update, and a change
  // means a client came or went.
  useEffect(() => {
    if (lastClientCount.current === clientCount) return
    lastClientCount.current = clientCount
    loadRef.current?.()
  }, [clientCount])

  if (!allowed) return null

  const clients = loaded?.identity === identity ? loaded.clients : null

  return (
    <Card>
      <Card.Header onClick={onToggle} style={{ cursor: 'pointer' }}>
        WebSocket Clients
        <span className="float-end">
          {open && (
            <Button
              variant="link"
              size="sm"
              className="p-0 me-3"
              title="Refresh WebSocket Clients"
              onClick={(event) => {
                event.stopPropagation()
                loadRef.current?.()
              }}
            >
              <FontAwesomeIcon icon={faRotateRight} />
            </Button>
          )}
          <Button
            variant="link"
            size="sm"
            className="p-0"
            title={open ? 'Hide WebSocket Clients' : 'Show WebSocket Clients'}
            aria-expanded={open}
            onClick={(event) => {
              event.stopPropagation()
              onToggle()
            }}
          >
            <FontAwesomeIcon icon={open ? faChevronUp : faChevronDown} />
          </Button>
        </span>
      </Card.Header>
      <Collapse in={open}>
        <div>
          <Card.Body>
            {clients ? (
              <Table hover responsive bordered striped size="sm">
                <thead>
                  <tr>
                    <th>IP</th>
                    <th>User-Agent</th>
                    <th>User / Device</th>
                    <th>Connected</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.id}>
                      <td>{client.ip}</td>
                      <td>
                        {client.serverEvents && (
                          <Badge
                            bg="secondary"
                            className="me-2"
                            title="Receives server events, as the admin UI does"
                          >
                            Admin UI
                          </Badge>
                        )}
                        {client.userAgent ?? ''}
                      </td>
                      <td>{client.principal ?? ''}</td>
                      <td>
                        {client.connectedAt
                          ? new Date(client.connectedAt).toLocaleString()
                          : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <span className="text-muted">
                {loaded?.identity === identity
                  ? 'The client list is not available.'
                  : 'Loading…'}
              </span>
            )}
          </Card.Body>
        </div>
      </Collapse>
    </Card>
  )
}
