var ReactDOM = require("ReactDOM")



const PluginList = (props) => (
  <ul>{props.plugins.map((plugin, i) => (
    <li key={i}>{plugin.name}</li>
  ))}</ul>
)

fetch(`/plugins`).then((response) => {
  if (response.status == 200) {
    response.json().then((plugins) => {
      ReactDOM.render(<PluginList plugins={plugins}/>,
        document.getElementById('main')
      )
    })
  } else {
    console.log(response.status)
  }
})
