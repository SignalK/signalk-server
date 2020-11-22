import React from 'react'

function AddonPanel(props) {
  return (
    <div style={{borderStyle: 'solid', borderColor: 'darkgreen'}}>
      <h5>Demo Add On Panel</h5>
      <p>This is a demonstration of the SK Server's ability to embed seamlessly user interface components from plugins loaded from the App store.</p>
      <ul>
        {props.webapps.map(webapp => <li key={webapp.name}>{webapp.name}({webapp.version})</li>)}
      </ul>
    </div>
  )


}

export default AddonPanel
