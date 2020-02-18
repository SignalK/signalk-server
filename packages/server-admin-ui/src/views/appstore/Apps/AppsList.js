import React from 'react'

import { Button } from 'reactstrap'

export default props => (
  <ul className='icons-list'>
    {props.apps.map(app => (
      <li key={app.name} style={{borderBottom: '1px solid #a4b7c1'}}>
        {mainIcon(app)}
        <div className='desc' style={{overflow: 'hidden', whiteSpace: 'nowrap', marginRight: '90px'}}>
          <a href={app.npmUrl} target='_blank' title='Open package on npmjs.com'>
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
             props.listName !== 'installed' &&
              ' \u27a1 ' + app.version}
          </strong>
        </div>
        <div className='actions'>

      {(props.listName !== 'installed' && (!app.installedVersion || app.version != app.installedVersion)) && (
            <Button
              color='link'
              className='text-muted'
              onClick={installApp.bind(this, app.name, app.version)}
            >
              <i className='icon-cloud-download' />
            </Button>
       )}
      
      {(props.listName === 'installed') && (
            <Button
              color='link'
              className='text-danger'
              onClick={removeApp.bind(this, app.name)}
            >
          <i className='fas fa-trash' />
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
      {app.isWebapp && <i className='icon-grid bg-primary' title="webapp" />}
      {app.isPlugin && <i className='icon-settings bg-success' title="plugin" />}
    </span>
  )
}

function installApp (name, version) {
  fetch(`/appstore/install/${name}/${version}`, {
    method: 'POST',
    credentials: 'include'
  })
}


function removeApp (name) {
  if (confirm(`Are you sure you want to remove ${name}?`)) {
    fetch(`/appstore/remove/${name}`, {
      method: 'POST',
      credentials: 'include'
    })
  }
}
