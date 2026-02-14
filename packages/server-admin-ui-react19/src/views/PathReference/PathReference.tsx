import { useState, useEffect, useMemo, useDeferredValue } from 'react'
import {
  Card,
  CardHeader,
  CardBody,
  Input,
  FormGroup,
  Label,
  Col,
  Row,
  Badge
} from 'reactstrap'

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
  // path like /vessels/*/navigation/speedOverGround
  const parts = path.split('/')
  // Skip leading empty, context (vessels/aircraft/aton/sar), wildcard
  const groupPart = parts[3] || ''
  return groupPart.toLowerCase()
}

function toDotPath(slashPath: string): string {
  // /vessels/*/navigation/speedOverGround → vessels.*.navigation.speedOverGround
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

  // Only show /vessels/* paths (avoid duplicated aircraft/aton/sar)
  const vesselPaths = useMemo(() => {
    if (!allMeta) return []
    return Object.entries(allMeta)
      .filter(([key]) => key.startsWith('/vessels/*/'))
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
        <CardHeader>
          <i className="icon-list" /> Path Reference
        </CardHeader>
        <CardBody>
          <p style={{ color: '#e74c3c' }}>
            Failed to load path metadata: {error}
          </p>
        </CardBody>
      </Card>
    )
  }

  if (!allMeta) {
    return (
      <Card>
        <CardHeader>
          <i className="icon-list" /> Path Reference
        </CardHeader>
        <CardBody>Loading path metadata...</CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <i className="icon-list" /> Path Reference
        <Badge color="secondary" className="ms-2">
          {filtered.length} / {vesselPaths.length} paths
        </Badge>
      </CardHeader>
      <CardBody>
        <Row className="mb-3">
          <Col md={8}>
            <FormGroup>
              <Label for="pathSearch">Search</Label>
              <Input
                id="pathSearch"
                type="text"
                placeholder="Search paths, descriptions, or units..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </FormGroup>
          </Col>
          <Col md={4}>
            <FormGroup>
              <Label for="groupFilter">Group</Label>
              <Input
                id="groupFilter"
                type="select"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <option value="all">All groups</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {GROUP_LABELS[g] || g}
                  </option>
                ))}
              </Input>
            </FormGroup>
          </Col>
        </Row>

        <div
          style={{
            maxHeight: 'calc(100vh - 280px)',
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
                // Show relative path: strip vessels.*.
                const displayPath = dotPath.replace(/^vessels\.\*\./, '')
                const isExpanded = expandedPath === key
                return (
                  <tr
                    key={key}
                    onClick={() => setExpandedPath(isExpanded ? null : key)}
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
                                    <Badge color="info" className="ms-1">
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
                      {meta.units && <Badge color="info">{meta.units}</Badge>}
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
      </CardBody>
    </Card>
  )
}
