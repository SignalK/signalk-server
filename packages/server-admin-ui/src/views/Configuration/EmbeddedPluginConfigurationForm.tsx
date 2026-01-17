import {
  useState,
  Suspense,
  createElement,
  ComponentType,
  Component,
  ReactNode
} from 'react'
import {
  PLUGIN_CONFIG_PANEL,
  toLazyDynamicComponent
} from '../Webapps/dynamicutilities'

interface PluginErrorBoundaryProps {
  children: ReactNode
  pluginName: string
}

interface PluginErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class PluginErrorBoundary extends Component<
  PluginErrorBoundaryProps,
  PluginErrorBoundaryState
> {
  state: PluginErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): PluginErrorBoundaryState {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="alert alert-warning">
          <h5>Plugin Configuration Unavailable</h5>
          <p>
            The configuration panel for <strong>{this.props.pluginName}</strong>{' '}
            could not be loaded. This plugin may need to be updated for React 19
            compatibility.
          </p>
          <details>
            <summary>Technical details</summary>
            <pre style={{ fontSize: '0.8rem' }}>
              {this.state.error?.message}
            </pre>
          </details>
        </div>
      )
    }
    return this.props.children
  }
}

interface PluginData {
  packageName: string
  data: {
    configuration?: unknown
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface EmbeddedPluginConfigurationFormProps {
  plugin: PluginData
  saveData: (data: Record<string, unknown>) => Promise<boolean>
}

interface ConfigPanelProps {
  configuration: unknown
  save: (configuration: unknown) => void
}

export default function EmbeddedPluginConfigurationForm({
  plugin,
  saveData
}: EmbeddedPluginConfigurationFormProps) {
  // Initialize component once from plugin.packageName
  const [Component] = useState<ComponentType<ConfigPanelProps>>(() =>
    toLazyDynamicComponent(plugin.packageName, PLUGIN_CONFIG_PANEL)
  )
  const [configuration, setConfiguration] = useState<unknown>(
    plugin.data.configuration
  )

  const handleSave = (newConfiguration: unknown) => {
    saveData({
      ...plugin.data,
      configuration: newConfiguration
    })
    setConfiguration(newConfiguration)
  }

  return (
    <PluginErrorBoundary pluginName={plugin.packageName}>
      <Suspense fallback="Loading...">
        {createElement(Component, {
          configuration,
          save: handleSave
        })}
      </Suspense>
    </PluginErrorBoundary>
  )
}
