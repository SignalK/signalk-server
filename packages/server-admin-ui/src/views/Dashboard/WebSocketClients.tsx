import { useEffect, useState } from 'react'
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
  const [refreshes, setRefreshes] = useState(0)
  const allowed = canListWebSocketClients(loginStatus)

  // The client count arrives with every server statistics update, so a
  // changed count reloads the list; the refresh button covers a client
  // leaving and another arriving between two updates.
  useEffect(() => {
    if (!open || !allowed) return
    const request = new AbortController()
    fetch(`${window.serverRoutesPrefix}/websocketClients`, {
      credentials: 'include',
      signal: request.signal
    })
      .then((response) => (response.ok ? response.json() : null))
      // A proxy or portal in between can answer 200 with something else.
      .then((data: unknown) =>
        setLoaded({
          identity,
          clients: Array.isArray(data) ? (data as WebSocketClient[]) : null
        })
      )
      .catch(() => {
        if (!request.signal.aborted) setLoaded({ identity, clients: null })
      })
    return () => request.abort()
  }, [open, allowed, identity, clientCount, refreshes])

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
              title="Refresh"
              onClick={(event) => {
                event.stopPropagation()
                setRefreshes((count) => count + 1)
              }}
            >
              <FontAwesomeIcon icon={faRotateRight} />
            </Button>
          )}
          <FontAwesomeIcon icon={open ? faChevronUp : faChevronDown} />
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
                          <Badge bg="secondary" className="me-2">
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
