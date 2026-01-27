/* eslint-disable @eslint-react/no-array-index-key -- log entries don't have unique IDs */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  ButtonGroup,
  Spinner,
  Alert,
  Input,
  Row,
  Col
} from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'
import { faPlay } from '@fortawesome/free-solid-svg-icons/faPlay'
import { faPause } from '@fortawesome/free-solid-svg-icons/faPause'
import { faSync } from '@fortawesome/free-solid-svg-icons/faSync'
import { faCopy } from '@fortawesome/free-solid-svg-icons/faCopy'
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck'
import { faTimes } from '@fortawesome/free-solid-svg-icons/faTimes'
import { faServer } from '@fortawesome/free-solid-svg-icons/faServer'
import { faDatabase } from '@fortawesome/free-solid-svg-icons/faDatabase'
import { faChartLine } from '@fortawesome/free-solid-svg-icons/faChartLine'
import { faCog } from '@fortawesome/free-solid-svg-icons/faCog'
import { getKeeperApi } from '../../services/api'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

interface LogLine {
  timestamp: string
  message: string
  level: string
}

interface LogsResponse {
  lines: LogLine[]
  count: number
}

type LogSource = 'signalk' | 'keeper' | 'influxdb' | 'grafana'
type CopyStatus = 'idle' | 'copying' | 'success' | 'success-selection' | 'error'

interface LogSourceInfo {
  id: LogSource
  label: string
  icon: IconDefinition
}

const LOG_SOURCES: LogSourceInfo[] = [
  { id: 'signalk', label: 'SignalK', icon: faServer },
  { id: 'keeper', label: 'Keeper', icon: faCog },
  { id: 'influxdb', label: 'InfluxDB', icon: faDatabase },
  { id: 'grafana', label: 'Grafana', icon: faChartLine }
]

const LINE_OPTIONS = [100, 250, 500, 1000, 2500, 5000]

interface HistoryStatus {
  status: string
  influxdb: { status: string } | null
  grafana: { status: string } | null
}

export default function ContainerLogs() {
  const [filter, setFilter] = useState('')
  const [debouncedFilter, setDebouncedFilter] = useState('')
  const [isFollowing, setIsFollowing] = useState(true)
  const [lineCount, setLineCount] = useState(1000)
  const [logSource, setLogSource] = useState<LogSource>('signalk')
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [hasSelection, setHasSelection] = useState(false)

  const [logsData, setLogsData] = useState<LogsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus | null>(null)

  const logContainerRef = useRef<HTMLDivElement>(null)
  const keeperApi = getKeeperApi()

  // Debounce filter input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(filter)
    }, 300)
    return () => clearTimeout(timer)
  }, [filter])

  // Fetch history status to determine available log sources
  useEffect(() => {
    if (!keeperApi) return

    const fetchHistoryStatus = async () => {
      try {
        const status = await keeperApi.history.status()
        setHistoryStatus(status)
      } catch {
        // Ignore errors - just means history not available
      }
    }

    fetchHistoryStatus()
    const interval = setInterval(fetchHistoryStatus, 30000)
    return () => clearInterval(interval)
  }, [keeperApi])

  // Determine available log sources
  const availableSources = useMemo(() => {
    const sources: LogSourceInfo[] = [
      LOG_SOURCES[0], // SignalK always available
      LOG_SOURCES[1] // Keeper always available
    ]
    if (historyStatus?.influxdb?.status === 'running') {
      sources.push(LOG_SOURCES[2])
    }
    if (historyStatus?.grafana?.status === 'running') {
      sources.push(LOG_SOURCES[3])
    }
    return sources
  }, [historyStatus])

  // Effective log source - fallback to signalk if current becomes unavailable
  const effectiveLogSource = useMemo(() => {
    return availableSources.find((s) => s.id === logSource)
      ? logSource
      : 'signalk'
  }, [availableSources, logSource])

  // Fetch logs
  const fetchLogs = useCallback(
    async (setLoadingState = false) => {
      if (!keeperApi) return

      if (setLoadingState) {
        setIsLoading(true)
      }

      try {
        const data = await keeperApi.container.logs(
          lineCount,
          effectiveLogSource
        )
        setLogsData(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch logs')
      } finally {
        setIsLoading(false)
      }
    },
    [keeperApi, lineCount, effectiveLogSource]
  )

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchLogs(true)

    if (isFollowing) {
      const interval = setInterval(() => fetchLogs(false), 2000)
      return () => clearInterval(interval)
    }
    return undefined
  }, [fetchLogs, isFollowing])

  // Auto-scroll when following
  useEffect(() => {
    if (isFollowing && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logsData, isFollowing])

  // Filter logs
  const logs = useMemo(() => {
    if (!logsData?.lines) return []
    if (!debouncedFilter) return logsData.lines

    const filterLower = debouncedFilter.toLowerCase()
    return logsData.lines.filter(
      (line) =>
        line.message.toLowerCase().includes(filterLower) ||
        line.level.toLowerCase().includes(filterLower) ||
        line.timestamp.toLowerCase().includes(filterLower)
    )
  }, [logsData, debouncedFilter])

  // Get selected text within log container
  const getSelectedText = useCallback((): string | null => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !logContainerRef.current) {
      return null
    }

    const range = selection.getRangeAt(0)
    if (!logContainerRef.current.contains(range.commonAncestorContainer)) {
      return null
    }

    const selectedText = selection.toString().trim()
    return selectedText.length > 0 ? selectedText : null
  }, [])

  // Track selection changes
  useEffect(() => {
    const handleSelectionChange = () => {
      const selectedText = getSelectedText()
      setHasSelection(!!selectedText)
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () =>
      document.removeEventListener('selectionchange', handleSelectionChange)
  }, [getSelectedText])

  // Copy logs to clipboard
  const copyLogs = useCallback(async () => {
    setCopyStatus('copying')

    const selectedText = getSelectedText()
    const isSelectionCopy = !!selectedText

    const text =
      selectedText ||
      logs
        .map(
          (line) =>
            `${line.timestamp} [${line.level.toUpperCase()}] ${line.message}`
        )
        .join('\n')

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback for HTTP
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        textarea.style.top = '-9999px'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        const success = document.execCommand('copy')
        document.body.removeChild(textarea)
        if (!success) {
          throw new Error('execCommand copy failed')
        }
      }
      setCopyStatus(isSelectionCopy ? 'success-selection' : 'success')
      setTimeout(() => setCopyStatus('idle'), 2500)
    } catch (err) {
      console.error('Failed to copy:', err)
      setCopyStatus('error')
      setTimeout(() => setCopyStatus('idle'), 2500)
    }
  }, [logs, getSelectedText])

  // Get copy button content
  const getCopyButtonContent = () => {
    switch (copyStatus) {
      case 'copying':
        return {
          icon: <Spinner size="sm" />,
          text: 'Copying...',
          color: 'secondary' as const
        }
      case 'success':
        return {
          icon: <FontAwesomeIcon icon={faCheck} />,
          text: `Copied ${logs.length} lines`,
          color: 'primary' as const
        }
      case 'success-selection':
        return {
          icon: <FontAwesomeIcon icon={faCheck} />,
          text: 'Copied selection',
          color: 'primary' as const
        }
      case 'error':
        return {
          icon: <FontAwesomeIcon icon={faTimes} />,
          text: 'Failed',
          color: 'danger' as const
        }
      default:
        if (hasSelection) {
          return {
            icon: <FontAwesomeIcon icon={faCopy} />,
            text: 'Copy Selection',
            color: 'secondary' as const
          }
        }
        return {
          icon: <FontAwesomeIcon icon={faCopy} />,
          text: 'Copy All',
          color: 'secondary' as const
        }
    }
  }

  const copyButtonContent = getCopyButtonContent()

  // Get level color class
  const getLevelClass = (level: string): string => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'text-danger'
      case 'warn':
      case 'warning':
        return 'text-warning'
      case 'debug':
        return 'text-info'
      case 'trace':
        return 'text-muted'
      default:
        return ''
    }
  }

  const currentSourceLabel =
    LOG_SOURCES.find((s) => s.id === effectiveLogSource)?.label || 'Server'

  if (isLoading && !logsData) {
    return (
      <Card>
        <CardBody>
          <div className="d-flex justify-content-center">
            <Spinner />
          </div>
        </CardBody>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardBody>
          <Alert color="danger">
            <strong>Failed to load logs</strong>
            <p className="mb-2">{error}</p>
            <Button color="link" onClick={() => fetchLogs()}>
              Retry
            </Button>
          </Alert>
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="animated fadeIn">
      <Card>
        <CardHeader>
          <Row className="align-items-center">
            <Col>
              <FontAwesomeIcon icon={faAlignJustify} />{' '}
              <strong>{currentSourceLabel} Logs</strong>
            </Col>
            <Col xs="auto">
              <span className="text-muted">
                {debouncedFilter ? `${logs.length} / ` : ''}
                {logsData?.count || 0} lines
                {isFollowing && <span className="text-success"> (live)</span>}
              </span>
            </Col>
          </Row>
        </CardHeader>
        <CardBody>
          {/* Source Selector */}
          {availableSources.length > 1 && (
            <div className="mb-3">
              <ButtonGroup>
                {availableSources.map((source) => (
                  <Button
                    key={source.id}
                    color={
                      effectiveLogSource === source.id ? 'primary' : 'secondary'
                    }
                    outline={effectiveLogSource !== source.id}
                    onClick={() => setLogSource(source.id)}
                    size="sm"
                  >
                    <FontAwesomeIcon icon={source.icon} className="me-1" />
                    {source.label}
                  </Button>
                ))}
              </ButtonGroup>
            </div>
          )}

          {/* Toolbar */}
          <div className="mb-3">
            <Row className="align-items-center g-2">
              <Col>
                <div className="position-relative">
                  <Input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter logs..."
                    aria-label="Filter logs"
                  />
                  {filter && (
                    <Button
                      color="link"
                      className="position-absolute"
                      onClick={() => setFilter('')}
                      aria-label="Clear filter"
                      style={{
                        right: '5px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        padding: '0 5px'
                      }}
                    >
                      <FontAwesomeIcon icon={faTimes} />
                    </Button>
                  )}
                </div>
              </Col>
              <Col xs="auto">
                <Input
                  type="select"
                  aria-label="Lines to show"
                  value={lineCount}
                  onChange={(e) => setLineCount(Number(e.target.value))}
                  style={{ width: 'auto' }}
                >
                  {LINE_OPTIONS.map((num) => (
                    <option key={num} value={num}>
                      {num} lines
                    </option>
                  ))}
                </Input>
              </Col>
              <Col xs="auto">
                <Button
                  color={isFollowing ? 'primary' : 'secondary'}
                  outline={!isFollowing}
                  onClick={() => setIsFollowing(!isFollowing)}
                  title={
                    isFollowing
                      ? 'Stop auto-refresh'
                      : 'Start auto-refresh (2s)'
                  }
                >
                  <FontAwesomeIcon
                    icon={isFollowing ? faPause : faPlay}
                    className="me-1"
                  />
                  {isFollowing ? 'Pause' : 'Follow'}
                </Button>
              </Col>
              <Col xs="auto">
                <Button
                  color="secondary"
                  outline
                  onClick={() => fetchLogs()}
                  title="Refresh logs now"
                >
                  <FontAwesomeIcon icon={faSync} className="me-1" />
                  Refresh
                </Button>
              </Col>
              <Col xs="auto">
                <Button
                  color={copyButtonContent.color}
                  outline={copyButtonContent.color === 'secondary'}
                  onClick={copyLogs}
                  disabled={copyStatus === 'copying' || logs.length === 0}
                  title={
                    hasSelection
                      ? 'Copy selected text to clipboard'
                      : `Copy ${logs.length} filtered lines to clipboard`
                  }
                >
                  <span className="me-1">{copyButtonContent.icon}</span>
                  {copyButtonContent.text}
                </Button>
              </Col>
            </Row>
          </div>

          {/* Log Content */}
          <div
            ref={logContainerRef}
            style={{
              overflowY: 'scroll',
              maxHeight: '60vh',
              border: '1px solid #ccc',
              padding: '5px',
              fontFamily: 'monospace',
              fontSize: '12px',
              backgroundColor: '#1e1e1e',
              color: '#d4d4d4'
            }}
          >
            {logs.length === 0 ? (
              <div className="text-center text-muted py-3">
                {debouncedFilter
                  ? 'No logs match the filter'
                  : 'No logs available'}
              </div>
            ) : (
              logs.map((line, index) => (
                <div
                  key={`${line.timestamp}-${index}`}
                  style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                >
                  <span style={{ color: '#808080' }}>{line.timestamp}</span>{' '}
                  <span className={getLevelClass(line.level)}>
                    [{line.level.toUpperCase()}]
                  </span>{' '}
                  <span>{line.message}</span>
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
