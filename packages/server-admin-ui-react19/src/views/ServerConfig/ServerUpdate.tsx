import React, { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import { useAppStore } from '../../store'

interface InstallingApp {
  name: string
  isWaiting?: boolean
  isInstalling?: boolean
}

interface AppStore {
  storeAvailable: boolean
  canUpdateServer: boolean
  isInDocker: boolean
  serverUpdate: string | null
  installing: InstallingApp[]
}

const ServerUpdate: React.FC = () => {
  const navigate = useNavigate()
  const appStore = useAppStore() as AppStore

  const handleUpdate = useCallback(() => {
    if (confirm('Are you sure you want to update the server?')) {
      navigate('/appstore/updates')
      fetch(
        `${window.serverRoutesPrefix}/appstore/install/signalk-server/${appStore.serverUpdate}`,
        {
          method: 'POST',
          credentials: 'include'
        }
      )
    }
  }, [appStore.serverUpdate, navigate])

  if (!appStore.storeAvailable) {
    return (
      <div className="animated fadeIn">
        <Card>
          <Card.Header>Waiting for App store data to load...</Card.Header>
        </Card>
      </div>
    )
  }

  let isInstalling = false
  let isInstalled = false
  const info = appStore.installing.find((p) => p.name === 'signalk-server')
  if (info) {
    if (info.isWaiting || info.isInstalling) {
      isInstalling = true
    } else {
      isInstalled = true
    }
  }

  return (
    <div className="animated fadeIn">
      {!appStore.canUpdateServer && (
        <Card className="border-warning">
          <Card.Header>Server Update</Card.Header>
          <Card.Body>
            This installation is not updatable from the admin user interface.
          </Card.Body>
        </Card>
      )}
      {appStore.isInDocker && (
        <Card className="border-warning">
          <Card.Header>Running as a Docker container</Card.Header>
          <Card.Body>
            <p>
              The server is running as a Docker container. You need to pull a
              new server version from Container registry to update.
            </p>
            <pre>
              <code>docker pull cr.signalk.io/signalk/signalk-server</code>
            </pre>
            <p>
              More info about running Signal K in Docker can be found at{' '}
              <a
                href="https://github.com/SignalK/signalk-server/blob/master/docker/README.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Docker README
              </a>{' '}
              .
            </p>
          </Card.Body>
        </Card>
      )}
      {appStore.canUpdateServer &&
        appStore.serverUpdate &&
        !isInstalling &&
        !isInstalled && (
          <Card>
            <Card.Header>
              Server version {appStore.serverUpdate} is available
            </Card.Header>
            <Card.Body>
              <a href="https://github.com/SignalK/signalk-server/releases/">
                Release Notes for latest releases.
              </a>
              <br />
              <br />
              <Button
                className="btn btn-danger"
                size="sm"
                variant="primary"
                onClick={handleUpdate}
              >
                Update
              </Button>
            </Card.Body>
          </Card>
        )}
      {isInstalling && (
        <Card>
          <Card.Header>Server Update</Card.Header>
          <Card.Body>The update is being installed</Card.Body>
        </Card>
      )}
      {isInstalled && (
        <Card>
          <Card.Header>Server Update</Card.Header>
          <Card.Body>
            The update has been installed, please restart the Signal K server.
          </Card.Body>
        </Card>
      )}
      {appStore.canUpdateServer && !appStore.serverUpdate && (
        <Card>
          <Card.Header>Server Update</Card.Header>
          <Card.Body>Your server is up to date.</Card.Body>
        </Card>
      )}

      <Card>
        <Card.Header>Sponsoring</Card.Header>
        <Card.Body>
          <p>
            If you find Signal K valuable to you consider sponsoring our work on
            developing it further.
          </p>
          <p>Your support allows us to do things like</p>
          <ul>
            <li>travel to meet in person and push things forward</li>
            <li>purchase equipment to develop on</li>
            <li>upgrade our cloud resources beyond the free tiers</li>
          </ul>
          <p>
            See{' '}
            <a href="https://opencollective.com/signalk">
              Signal K in Open Collective
            </a>{' '}
            for details.
          </p>
        </Card.Body>
      </Card>
    </div>
  )
}

export default ServerUpdate
