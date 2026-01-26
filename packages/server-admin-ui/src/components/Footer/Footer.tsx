import { Link } from 'react-router-dom'
import {
  useZustandLoginStatus,
  useZustandAppStore,
  useVesselInfo,
  useServerSpecification
} from '../../store'

export default function Footer() {
  const loginStatus = useZustandLoginStatus()
  const serverSpecification = useServerSpecification()
  const appStore = useZustandAppStore()
  const vesselInfo = useVesselInfo()

  const { name, mmsi, uuid } = vesselInfo

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
