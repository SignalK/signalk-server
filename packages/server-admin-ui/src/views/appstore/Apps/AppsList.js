import React, { Component } from 'react'

import { Button } from 'reactstrap'

class AppsList extends Component {
  constructor (props) {
    super(props)
    this.state = {
      installing: {}
    }
  }
  
  render () {
    return (
  <ul className='icons-list'>
    {this.props.apps.map(app => (
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
             this.props.listName !== 'installed' &&
              ' \u27a1 ' + app.version}
          </strong>
        </div>
        <div className='actions'>

      {(this.props.listName !== 'installed' && (!app.installedVersion || app.version != app.installedVersion)) && (
            <Button
              color='link'
              className='text-muted'
              onClick={installApp.bind(this, app.name, app.version)}
            >
          <i className={this.state.installing[app.name] ? 'fa fa-spinner fa-spin' : 'icon-cloud-download'} />
            </Button>
       )}
      
      {(this.props.listName === 'installed') && (
            <Button
              color='link'
              className='text-danger'
              onClick={removeApp.bind(this, app.name)}
            >
          <i className={this.state.installing[app.name] ? 'fa fa-spinner fa-spin' :'fas fa-trash'} />
            </Button>
          )}
        </div>
      </li>
    ))}
  </ul>
    )
  }
}

function mainIcon (app) {
  return (
    <span>
      {app.isWebapp && <i className='icon-grid bg-primary' title="webapp" />}
      {app.isEmbeddableWebapp && <i className='icon-puzzle bg-primary' title="embeddable webapp" />}
      {app.isPlugin && <i className='icon-settings bg-success' title="plugin" />}
    </span>
  )
}

function updateInstalling(that, name, value)
{
  that.setState((state, props) => {
    state.installing[name] = value
    return { installing: state.installing }                   
  })
}

function installApp (name, version) {
  updateInstalling(this, name, true)
  fetch(`${window.serverRoutesPrefix}/appstore/install/${name}/${version}`, {
    method: 'POST',
    credentials: 'include'
  })
}


function removeApp (name) {
  if (confirm(`Are you sure you want to remove ${name}?`)) {
    updateInstalling(this, name, true)
    fetch(`${window.serverRoutesPrefix}/appstore/remove/${name}`, {
      method: 'POST',
      credentials: 'include'
    })
  }
}

export default AppsList
