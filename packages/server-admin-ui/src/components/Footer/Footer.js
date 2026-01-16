import React from 'react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'

const Footer = () => {
  const loginStatus = useSelector((state) => state.loginStatus)
  const serverSpecification = useSelector((state) => state.serverSpecification)
  const appStore = useSelector((state) => state.appStore)
  const vesselInfo = useSelector((state) => state.vesselInfo)

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
      &nbsp;- {name || mmsi || uuid}
    </footer>
  )
}

export default Footer
