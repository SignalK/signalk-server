import ConfigurationForm from "./ConfigurationForm.jsx"
import PluginList from "./PluginList.jsx"


fetch(`/plugins`).then((response) => {
  if (response.status == 200) {
    response.json().then((plugins) => {
      ReactDOM.render(
      <div className="container">
        {plugins.map((plugin, i) => (
        <div className="panel panel-default">
          <div className="panel-body">
            <ConfigurationForm schema={plugin.schema}/>
          </div>
        </div>
        ))}

      </div>,
        document.getElementById('main')
      )
    })
  } else {
    console.log(response.status)
  }
})
