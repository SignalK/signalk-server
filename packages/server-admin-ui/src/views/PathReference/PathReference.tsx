import { useState, useEffect, useMemo, useDeferredValue } from 'react'
import Badge from 'react-bootstrap/Badge'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'

// Intentional subset of the canonical PathMetadataEntry type from
// @signalk/path-metadata — only the fields this viewer actually renders.
interface PathMetadataEntry {
  description: string
  units?: string
  enum?: ReadonlyArray<{ id: number; name: string } | string>
  properties?: Record<
    string,
    {
      type?: string
      description?: string
      units?: string
      example?: number | string
      title?: string
    }
  >
}

type AllMetadata = Record<string, PathMetadataEntry>

// Approximate height of card header + filter row + table heading in the viewer
const TABLE_VIEWPORT_OFFSET_PX = 280

const GROUP_LABELS: Record<string, string> = {
  navigation: 'Navigation',
  environment: 'Environment',
  electrical: 'Electrical',
  tanks: 'Tanks',
  propulsion: 'Propulsion',
  performance: 'Performance',
  sails: 'Sails',
  steering: 'Steering',
  design: 'Design',
  registrations: 'Registrations',
  communication: 'Communication',
  sensors: 'Sensors',
  notifications: 'Notifications',
  resources: 'Resources'
}

function getGroup(path: string): string {
  if (path.startsWith('/resources/')) return 'resources'
  if (!path.startsWith('/vessels/*/')) return 'other'
  const parts = path.split('/')
  return (parts[3] || '').toLowerCase()
}

function toDotPath(slashPath: string): string {
  return slashPath.replace(/^\//, '').replace(/\//g, '.')
}

export default function PathReference() {
  const [allMeta, setAllMeta] = useState<AllMetadata | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [expandedPath, setExpandedPath] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${window.serverRoutesPrefix}/paths`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: AllMetadata) => setAllMeta(data))
      .catch((err) => setError(err.message))
  }, [])

  // Show /vessels/* paths plus root-level paths (/resources/*, /self, etc.)
  // The same metadata also applies to /aircraft/*, /aton/*, /sar/* contexts
  const vesselPaths = useMemo(() => {
    if (!allMeta) return []
    return Object.entries(allMeta)
      .filter(
        ([key]) =>
          key.startsWith('/vessels/*/') ||
          key.startsWith('/resources/') ||
          (!key.startsWith('/aircraft/') &&
            !key.startsWith('/aton/') &&
            !key.startsWith('/sar/'))
      )
      .sort(([a], [b]) => a.localeCompare(b))
  }, [allMeta])

  const groups = useMemo(() => {
    const groupSet = new Set<string>()
    for (const [key] of vesselPaths) {
      const g = getGroup(key)
      if (g) groupSet.add(g)
    }
    return Array.from(groupSet).sort()
  }, [vesselPaths])

  const filtered = useMemo(() => {
    const lowerSearch = deferredSearch.toLowerCase()
    return vesselPaths.filter(([key, meta]) => {
      if (groupFilter !== 'all' && getGroup(key) !== groupFilter) return false
      if (!lowerSearch) return true
      const dotPath = toDotPath(key)
      return (
        dotPath.toLowerCase().includes(lowerSearch) ||
        meta.description?.toLowerCase().includes(lowerSearch) ||
        meta.units?.toLowerCase().includes(lowerSearch)
      )
    })
  }, [vesselPaths, deferredSearch, groupFilter])

  if (error) {
    return (
      <Card>
        <Card.Header>
          <i className="icon-list" /> Path Reference
        </Card.Header>
        <Card.Body>
          <p style={{ color: '#e74c3c' }}>
            Failed to load path metadata: {error}
          </p>
        </Card.Body>
      </Card>
    )
  }

  if (!allMeta) {
    return (
      <Card>
        <Card.Header>
          <i className="icon-list" /> Path Reference
        </Card.Header>
        <Card.Body>Loading path metadata...</Card.Body>
      </Card>
    )
  }

  return (
    <Card>
      <Card.Header>
        <i className="icon-list" /> Path Reference
        <Badge bg="secondary" className="ms-2">
          {filtered.length} / {vesselPaths.length} paths
        </Badge>
      </Card.Header>
      <Card.Body>
        <p className="text-muted small mb-2">
          Vessel paths also apply to <code>/aircraft/*</code>,{' '}
          <code>/aton/*</code>, and <code>/sar/*</code> contexts.
        </p>
        <Row className="mb-3">
          <Col md={8}>
            <Form.Group>
              <Form.Label htmlFor="pathSearch">Search</Form.Label>
              <Form.Control
                id="pathSearch"
                type="text"
                placeholder="Search paths, descriptions, or units..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group>
              <Form.Label htmlFor="groupFilter">Group</Form.Label>
              <Form.Select
                id="groupFilter"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <option value="all">All groups</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {GROUP_LABELS[g] || g}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
        </Row>

        <div
          style={{
            maxHeight: `calc(100vh - ${TABLE_VIEWPORT_OFFSET_PX}px)`,
            overflowY: 'auto'
          }}
        >
          <table className="table table-sm table-striped">
            <thead
              style={{
                position: 'sticky',
                top: 0,
                backgroundColor: 'var(--bs-body-bg, #fff)',
                zIndex: 1
              }}
            >
              <tr>
                <th style={{ width: '40%' }}>Path</th>
                <th style={{ width: '45%' }}>Description</th>
                <th style={{ width: '15%' }}>Units</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(([key, meta]) => {
                const dotPath = toDotPath(key)
                const displayPath = dotPath.replace(/^vessels\.\*\./, '')
                const isExpanded = expandedPath === key
                const toggleExpanded = () =>
                  setExpandedPath(isExpanded ? null : key)
                return (
                  <tr
                    key={key}
                    onClick={toggleExpanded}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        toggleExpanded()
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <code style={{ fontSize: '0.85em' }}>{displayPath}</code>
                    </td>
                    <td>
                      <span>{meta.description}</span>
                      {isExpanded && meta.enum && (
                        <div className="mt-2">
                          <strong>Enum values:</strong>
                          <ul className="mb-0" style={{ fontSize: '0.85em' }}>
                            {meta.enum.map((e) => (
                              <li key={typeof e === 'string' ? e : e.id}>
                                {typeof e === 'string'
                                  ? e
                                  : `${e.id}: ${e.name}`}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {isExpanded && meta.properties && (
                        <div className="mt-2">
                          <strong>Properties:</strong>
                          <ul className="mb-0" style={{ fontSize: '0.85em' }}>
                            {Object.entries(meta.properties).map(
                              ([propName, prop]) => (
                                <li key={propName}>
                                  <code>{propName}</code>
                                  {prop.type && (
                                    <span className="text-muted">
                                      {' '}
                                      ({prop.type})
                                    </span>
                                  )}
                                  {prop.description && (
                                    <span> — {prop.description}</span>
                                  )}
                                  {prop.units && (
                                    <Badge bg="info" className="ms-1">
                                      {prop.units}
                                    </Badge>
                                  )}
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      )}
                    </td>
                    <td>
                      {meta.units && <Badge bg="info">{meta.units}</Badge>}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-muted py-4">
                    No paths match your search
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card.Body>
    </Card>
  )
}
