import React, { Component, Suspense } from 'react'
import {
  PLUGIN_CONFIG_PANEL,
  toLazyDynamicComponent
} from '../Webapps/dynamicutilities'

export default class EmbeddedPluginConfigurationForm extends Component {
  constructor(props) {
    super(props)
    this.state = {
      component: toLazyDynamicComponent(
        props.plugin.packageName,
        PLUGIN_CONFIG_PANEL
      ),
      configuration: this.props.plugin.data.configuration
    }
  }

  render() {
    return (
      <div>
        <Suspense fallback="Loading...">
          {React.createElement(this.state.component, {
            configuration: this.state.configuration,
            save: (configuration) => {
              this.props.saveData({
                ...this.props.plugin.data,
                configuration
              })
              this.setState({ configuration })
            }
          })}
        </Suspense>
      </div>
    )
  }
}
