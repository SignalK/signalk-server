import React from 'react'

import { Button } from 'reactstrap'

export default props => (
  <ul className='icons-list'>
    {props.apps.map(app => (
      <li key={app.name}>
        {mainIcon(app)}
        <div className='desc'>
          <a href={app.npmUrl}>
            <i className='icon-info' />
          </a>
          <div className='title'>
            <b>{app.name}</b>
          </div>
          <small>
            {app.description} by {app.author}
          </small>
        </div>
        <div className='value'>
          <div className='small text-muted'>Version</div>
          <strong>
            {app.installedVersion || app.version}
            {app.installedVersion &&
              app.version != app.installedVersion &&
              ' \u27a1 ' + app.version}
          </strong>
        </div>
        <div className='actions'>
          {(!app.installedVersion || app.version != app.installedVersion) && (
            <Button
              color='link'
              className='text-muted'
              onClick={installApp.bind(this, app.name, app.version)}
            >
              <i className='icon-cloud-download' />
            </Button>
          )}
        </div>
      </li>
    ))}
  </ul>
)

function mainIcon (app) {
  return (
    <span>
      {app.isWebapp && <i className='icon-grid bg-primary' />}
      {app.isPlugin && <i className='icon-settings bg-success' />}
    </span>
  )
}

function installApp (name, version) {
  fetch(`/appstore/install/${name}/${version}`, {
    method: 'POST',
    credentials: 'include'
  })
}
