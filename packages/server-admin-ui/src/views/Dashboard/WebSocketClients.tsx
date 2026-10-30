import { useEffect, useState } from 'react'
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
  const [clients, setClients] = useState<WebSocketClient[] | null>(null)

  useEffect(() => {
    let cancelled = false
    // A slow response must not overwrite the one from a later request.
    let latestRequest = 0
    const load = () => {
      const request = ++latestRequest
      const apply = (data: WebSocketClient[] | null) => {
        if (!cancelled && request === latestRequest) setClients(data)
      }
      fetch(`${window.serverRoutesPrefix}/websocketClients`, {
        credentials: 'include'
      })
        .then((response) => (response.ok ? response.json() : null))
        .then(apply)
        .catch(() => apply(null))
    }
    load()
    const timer = setInterval(load, REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [clientCount, loginStatus.status, loginStatus.username])

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
