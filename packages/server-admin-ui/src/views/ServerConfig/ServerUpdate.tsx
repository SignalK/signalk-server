import React, { useState, useEffect, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CardHeader, CardBody } from 'reactstrap'

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

interface RootState {
  appStore: AppStore
}

const ServerUpdate: React.FC = () => {
  const navigate = useNavigate()
  const appStore = useSelector((state: RootState) => state.appStore)
  const [changelog, setChangelog] = useState<string | null>(null)

  const fetchChangelog = useCallback(() => {
    fetch(
      `https://raw.githubusercontent.com/SignalK/signalk-server-node/master/CHANGELOG.md`
    )
      .then((response) => response.text())
      .then((data) => {
        setChangelog(data)
      })
  }, [])

  useEffect(() => {
    fetchChangelog()
  }, [fetchChangelog])

  const handleUpdate = useCallback(() => {
    console.log('handleUpdate')
    if (confirm(`Are you sure you want to update the server?'`)) {
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
          <CardHeader>Waiting for App store data to load...</CardHeader>
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
          <CardHeader>Server Update</CardHeader>
          <CardBody>
            This installation is not updatable from the admin user interface.
          </CardBody>
        </Card>
      )}
      {appStore.isInDocker && (
        <Card className="border-warning">
          <CardHeader>Running as a Docker container</CardHeader>
          <CardBody>
            <p>
              The server is running as a Docker container. You need to pull a
              new server version from Container registry to update.
              <ul>
                <code>docker pull cr.signalk.io/signalk/signalk-server</code>
              </ul>
            </p>
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
          </CardBody>
        </Card>
      )}
      {appStore.canUpdateServer &&
        appStore.serverUpdate &&
        !isInstalling &&
        !isInstalled && (
          <Card>
            <CardHeader>
              Server version {appStore.serverUpdate} is available
            </CardHeader>
            <CardBody>
              <a href="https://github.com/SignalK/signalk-server/releases/">
                Release Notes for latest releases.
              </a>
              <br />
              <br />
              <Button
                className="btn btn-danger"
                size="sm"
                color="primary"
                onClick={handleUpdate}
              >
                Update
              </Button>
            </CardBody>
          </Card>
        )}
      {isInstalling && (
        <Card>
          <CardHeader>Server Update</CardHeader>
          <CardBody>The update is being installed</CardBody>
        </Card>
      )}
      {isInstalled && (
        <Card>
          <CardHeader>Server Update</CardHeader>
          <CardBody>
            The update has been installed, please restart the Signal K server.
          </CardBody>
        </Card>
      )}
      {appStore.canUpdateServer && !appStore.serverUpdate && (
        <Card>
          <CardHeader>Server Update</CardHeader>
          <CardBody>Your server is up to date.</CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>Sponsoring</CardHeader>
        <CardBody>
          <p>
            If you find Signal K valuable to you consider sponsoring our work on
            developing it further.
          </p>
          <p>
            Your support allows us to do things like
            <ul>
              <li>travel to meet in person and push things forward</li>
              <li>purchase equipment to develop on</li>
              <li>upgrade our cloud resources beyond the free tiers</li>
            </ul>
          </p>
          <p>
            See{' '}
            <a href="https://opencollective.com/signalk">
              Signal K in Open Collective
            </a>{' '}
            for details.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

export default ServerUpdate
