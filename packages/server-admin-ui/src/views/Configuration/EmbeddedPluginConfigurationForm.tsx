import { useState, Suspense, createElement, ComponentType } from 'react'
import {
  PLUGIN_CONFIG_PANEL,
  toLazyDynamicComponent
} from '../Webapps/dynamicutilities'

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
    <div>
      <Suspense fallback="Loading...">
        {createElement(Component, {
          configuration,
          save: handleSave
        })}
      </Suspense>
    </div>
  )
}
