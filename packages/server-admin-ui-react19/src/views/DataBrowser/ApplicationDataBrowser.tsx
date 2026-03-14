import React, { useState, useCallback } from 'react'
import { JSONTree } from 'react-json-tree'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import Spinner from 'react-bootstrap/Spinner'
import { useLoginStatus } from '../../store'

interface VersionData {
  version: string
  data: unknown
}

interface AppDataResult {
  global: VersionData[]
  user: VersionData[]
}

const expandAll = () => true
const expandRoot = (
  _keyPath: readonly (string | number)[],
  _data: unknown,
  level: number
) => level < 1

const ApplicationDataBrowser: React.FC = () => {
  const [appId, setAppId] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AppDataResult | null>(null)
  const [expandAllNodes, setExpandAllNodes] = useState(false)
  const loginStatus = useLoginStatus()

  const isLoggedIn = loginStatus.status === 'loggedIn'

  const fetchData = useCallback(async () => {
    const trimmed = appId.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const fetched: AppDataResult = { global: [], user: [] }

      // Fetch global versions
      const globalVersionsRes = await fetch(
        `/signalk/v1/applicationData/global/${encodeURIComponent(trimmed)}`,
        { credentials: 'include' }
      )
      if (globalVersionsRes.ok) {
        const versions: string[] = await globalVersionsRes.json()
        for (const version of versions) {
          const dataRes = await fetch(
            `/signalk/v1/applicationData/global/${encodeURIComponent(trimmed)}/${encodeURIComponent(version)}`,
            { credentials: 'include' }
          )
          if (dataRes.ok) {
            fetched.global.push({ version, data: await dataRes.json() })
          }
        }
      }

      // Fetch user versions (only if logged in)
      if (isLoggedIn) {
        const userVersionsRes = await fetch(
          `/signalk/v1/applicationData/user/${encodeURIComponent(trimmed)}`,
          { credentials: 'include' }
        )
        if (userVersionsRes.ok) {
          const versions: string[] = await userVersionsRes.json()
          for (const version of versions) {
            const dataRes = await fetch(
              `/signalk/v1/applicationData/user/${encodeURIComponent(trimmed)}/${encodeURIComponent(version)}`,
              { credentials: 'include' }
            )
            if (dataRes.ok) {
              fetched.user.push({ version, data: await dataRes.json() })
            }
          }
        }
      }

      setResult(fetched)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [appId, isLoggedIn])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      fetchData()
    },
    [fetchData]
  )

  const hasGlobal = result && result.global.length > 0
  const hasUser = result && result.user.length > 0
  const hasNoData = result && !hasGlobal && !hasUser

  return (
    <Card>
      <Card.Header
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded((prev) => !prev)}
      >
        Application Data {expanded ? '[-]' : '[+]'}
      </Card.Header>
      {expanded && (
        <Card.Body>
          <Form onSubmit={handleSubmit}>
            <Form.Group as={Row} className="mb-3">
              <Col xs="12" md="6">
                <Form.Control
                  type="text"
                  placeholder="Enter application ID (e.g. unitpreferences)"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  autoComplete="off"
                />
              </Col>
              <Col xs="12" md="2">
                <Button
                  variant="primary"
                  type="submit"
                  disabled={loading || !appId.trim()}
                >
                  {loading ? <Spinner animation="border" size="sm" /> : 'Fetch'}
                </Button>
              </Col>
            </Form.Group>
          </Form>

          {(hasGlobal || hasUser) && (
            <Form.Check
              type="checkbox"
              id="appdata-expand-all"
              label="Expand all"
              checked={expandAllNodes}
              onChange={(e) => setExpandAllNodes(e.target.checked)}
              className="mb-2"
            />
          )}

          {error && <div className="text-danger mb-2">{error}</div>}

          {hasNoData && (
            <div className="text-muted">
              No data found for &quot;{appId.trim()}&quot;
            </div>
          )}

          {hasGlobal && (
            <div className="mb-3">
              <h6>Global</h6>
              {result.global.map(({ version, data }) => (
                <div key={version} className="mb-2">
                  <strong>{version}</strong>
                  <JSONTree
                    key={`global-${version}-${expandAllNodes}`}
                    data={data}
                    theme="default"
                    invertTheme={true}
                    sortObjectKeys
                    hideRoot
                    shouldExpandNodeInitially={
                      expandAllNodes ? expandAll : expandRoot
                    }
                  />
                </div>
              ))}
            </div>
          )}

          {hasUser && (
            <div>
              <h6>User ({loginStatus.username})</h6>
              {result.user.map(({ version, data }) => (
                <div key={version} className="mb-2">
                  <strong>{version}</strong>
                  <JSONTree
                    key={`user-${version}-${expandAllNodes}`}
                    data={data}
                    theme="default"
                    invertTheme={true}
                    sortObjectKeys
                    hideRoot
                    shouldExpandNodeInitially={
                      expandAllNodes ? expandAll : expandRoot
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </Card.Body>
      )}
    </Card>
  )
}

export default ApplicationDataBrowser
