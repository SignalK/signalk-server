import path from 'path'

export const PLUGIN_CONFIG_DATA_DIR = 'plugin-config-data'

export function pluginConfigPath(configPath: string, pluginId: string): string {
  return path.join(configPath, PLUGIN_CONFIG_DATA_DIR, pluginId + '.json')
}

export function pluginDataDir(configPath: string, pluginId: string): string {
  return path.join(configPath, PLUGIN_CONFIG_DATA_DIR, pluginId)
}
