import React from 'react'
import ReactDOM from 'react-dom'
import ConfigurationForm from './ConfigurationForm.jsx'

function saveData(id, data) {
  fetch(`${window.serverRoutesPrefix}/plugins/${id}/config`, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: new Headers({ 'Content-Type': 'application/json' }),
    credentials: 'same-origin'
  }).then((response) => {
    if (response.status != 200) {
      console.log(response)
    }
  })
}

fetch(`${window.serverRoutesPrefix}/plugins`, {
  credentials: 'same-origin'
}).then((response) => {
  if (response.status == 200) {
    response.json().then((plugins) => {
      ReactDOM.render(
        <div className="container">
          <div
            className="panel-group"
            id="accordion"
            role="tablist"
            aria-multiselectable="true"
          >
            {plugins.map((plugin, i) => (
              <div key={i} className="panel panel-default">
                <div className="panel-heading">
                  <h4 className="panel-title">
                    <a
                      role="button"
                      data-toggle="collapse"
                      data-parent="#accordion"
                      href={'#collapse' + i}
                    >
                      {plugin.name}
                    </a>
                  </h4>
                </div>
                <div
                  id={'collapse' + i}
                  className="panel-collapse collapse"
                  style={{ height: '0px' }}
                  role="tabpanel"
                >
                  <div className="panel-body">
                    <ConfigurationForm
                      plugin={plugin}
                      onSubmit={saveData.bind(null, plugin.id)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.getElementById('main')
      )
    })
  } else {
    console.log(response.status)
  }
})
