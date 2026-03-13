import { Link } from 'react-router-dom'
import Badge from 'react-bootstrap/Badge'
import {
  useLoginStatus,
  useAppStore,
  useVesselInfo,
  useServerSpecification,
  useNodeInfo
} from '../../store'

const NODE_UPGRADE_URL =
  'https://github.com/SignalK/signalk-server/wiki/Installing-and-Updating-Node.js'

function parseMajor(version: string): number {
  return parseInt(version.replace(/^[v>=]+/, '').split('.')[0], 10)
}

function getNodeBadge(
  nodeVersion: string,
  recommendedNodeVersion: string,
  minimumNodeVersion: string
): { variant: 'warning' | 'danger'; label: string } | null {
  const current = parseMajor(nodeVersion)
  const minimum = parseMajor(minimumNodeVersion)
  const recommended = parseMajor(recommendedNodeVersion)

  if (isNaN(current) || isNaN(minimum) || isNaN(recommended)) return null

  if (current < minimum) {
    return { variant: 'danger', label: `node ${recommended} required` }
  }
  if (current !== recommended) {
    return { variant: 'warning', label: `node ${recommended} recommended` }
  }
  return null
}

export default function Footer() {
  const loginStatus = useLoginStatus()
  const serverSpecification = useServerSpecification()
  const appStore = useAppStore()
  const vesselInfo = useVesselInfo()
  const nodeInfo = useNodeInfo()

  const { name, mmsi, uuid } = vesselInfo

  const badge =
    nodeInfo.nodeVersion &&
    nodeInfo.recommendedNodeVersion &&
    nodeInfo.minimumNodeVersion
      ? getNodeBadge(
          nodeInfo.nodeVersion,
          nodeInfo.recommendedNodeVersion,
          nodeInfo.minimumNodeVersion
        )
      : null

  return (
    <footer className="app-footer">
      <span>
        <a href="https://github.com/SignalK/signalk-server-node/">
          Signal K Server
        </a>
      </span>
      {typeof serverSpecification.server !== 'undefined' && (
        <span>&nbsp; version {serverSpecification.server.version}</span>
      )}
      {nodeInfo.nodeVersion && (
        <span>
          &nbsp; node {nodeInfo.nodeVersion.replace(/^v/, '')}
          {nodeInfo.npmVersion && <> · npm {nodeInfo.npmVersion}</>}
        </span>
      )}
      {badge && (
        <span>
          &nbsp;
          <a href={NODE_UPGRADE_URL} style={{ textDecoration: 'none' }}>
            <Badge bg={badge.variant}>{badge.label}</Badge>
          </a>
        </span>
      )}
      <span>
        &nbsp; <a href="https://opencollective.com/signalk">Sponsor Signal K</a>
      </span>
      {typeof appStore.serverUpdate !== 'undefined' && (
        <span>
          <Link to="/serverConfiguration/update">
            &nbsp;(version {appStore.serverUpdate} is available)
          </Link>
        </span>
      )}
      {loginStatus.status === 'loggedIn' && (
        <span className="ms-auto">Logged in as {loginStatus.username}</span>
      )}
      &nbsp;- {name ?? mmsi ?? uuid ?? ''}
    </footer>
  )
}
