import ConfigurationForm from "./ConfigurationForm.jsx"

function saveData(id, data) {
  fetch('/plugins/' + id + "/config", {
    method: 'POST',
    body: JSON.stringify(data),
    headers: new Headers({'Content-Type': 'application/json'})
  }).then((response) => {
    console.log(response)
  })
}

fetch(`/plugins`).then((response) => {
  if (response.status == 200) {
    response.json().then((plugins) => {
      ReactDOM.render(
        <div className="container">
        {plugins.map((plugin, i) => (
          <div className="panel panel-default">
            <div className="panel-body">
              <ConfigurationForm plugin={plugin} onSubmit={saveData.bind(null, plugin.id)}/>
            </div>
          </div>
        ))}
      </div>, document.getElementById('main'))
    })
  } else {
    console.log(response.status)
  }
})
