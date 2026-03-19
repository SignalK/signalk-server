import { Link } from 'react-router-dom'
import Badge from 'react-bootstrap/Badge'
import {
  useLoginStatus,
  useAppStore,
  useVesselInfo,
  useServerSpecification,
  useNodeInfo
} from '../../store'

export default function Footer() {
  const loginStatus = useLoginStatus()
  const serverSpecification = useServerSpecification()
  const appStore = useAppStore()
  const vesselInfo = useVesselInfo()
  const nodeInfo = useNodeInfo()

  const { name, mmsi, uuid } = vesselInfo

  const currentMajor = nodeInfo.nodeVersion
    ? parseInt(nodeInfo.nodeVersion.replace(/^v/, '').split('.')[0], 10)
    : NaN
  const recommendedMajor = nodeInfo.recommendedNodeVersion
    ? parseInt(nodeInfo.recommendedNodeVersion.split('.')[0], 10)
    : NaN
  const showWarning =
    !isNaN(currentMajor) &&
    !isNaN(recommendedMajor) &&
    currentMajor > recommendedMajor

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
      {showWarning && (
        <span>
          &nbsp;
          <Badge bg="warning">
            node {nodeInfo.recommendedNodeVersion} recommended
          </Badge>
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
