import { useEffect, useRef, useState } from 'react'
import Card from 'react-bootstrap/Card'
import Table from 'react-bootstrap/Table'
import { useLoginStatus } from '../../store'

interface WebSocketClient {
  id: string
  ip: string
  userAgent?: string
  principal?: string
  connectedAt?: string
}

// The count arrives with the server statistics, but a client can leave and
// another arrive between two of them, so the list is also polled.
const REFRESH_INTERVAL_MS = 10000

export default function WebSocketClients({
  clientCount
}: {
  clientCount: number
}) {
  const loginStatus = useLoginStatus()
  // The list belongs to the login that fetched it, so another login never
  // sees it, even while its own first request is still pending.
  const identity = `${loginStatus.status}:${loginStatus.username ?? ''}`
  const [loaded, setLoaded] = useState<{
    identity: string
    clients: WebSocketClient[] | null
  } | null>(null)
  const loadRef = useRef<(() => void) | null>(null)
  const lastClientCount = useRef(clientCount)

  useEffect(() => {
    let cancelled = false
    // Requests can take longer than the polling interval, so responses may
    // arrive out of order; an older one must not replace a newer list.
    let sentRequests = 0
    let appliedRequest = 0
    const load = () => {
      const request = ++sentRequests
      const apply = (clients: WebSocketClient[] | null) => {
        if (cancelled || request < appliedRequest) return
        appliedRequest = request
        setLoaded({ identity, clients })
      }
      fetch(`${window.serverRoutesPrefix}/websocketClients`, {
        credentials: 'include'
      })
        .then((response) => (response.ok ? response.json() : null))
        .then(apply)
        .catch(() => apply(null))
    }
    loadRef.current = load
    load()
    const timer = setInterval(load, REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      loadRef.current = null
      clearInterval(timer)
    }
  }, [identity])

  // A changed count means a client came or went: refresh at once, without
  // restarting the polling and dropping the requests still in flight.
  useEffect(() => {
    if (lastClientCount.current === clientCount) return
    lastClientCount.current = clientCount
    loadRef.current?.()
  }, [clientCount])

  const clients = loaded?.identity === identity ? loaded.clients : null
  if (!clients) return null

  return (
    <Card>
      <Card.Header>WebSocket Clients</Card.Header>
      <Card.Body>
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
                <td>{client.userAgent ?? ''}</td>
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
      </Card.Body>
    </Card>
  )
}
