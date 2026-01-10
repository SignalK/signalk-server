---
title: Plugin Wizard
---

# Plugin Wizard

The Plugin Wizard helps you get started with Signal K Server by installing curated bundles of plugins for common use cases.

## Accessing the Wizard

- **Fresh installation**: The Dashboard shows a prompt to run the Plugin Wizard
- **Anytime**: Navigate to **Appstore -> Plugin Wizard**

## Using the Wizard

1. **Select Bundles** - Choose one or more bundles that match your needs. Bundles already installed show an "Installed" badge.

2. **Confirm** - Review the packages to be installed. Duplicates across bundles are automatically handled.

3. **Install** - The wizard installs packages sequentially, showing progress.

4. **Restart** - Click **Restart Server** to activate the installed plugins.

## Available Bundles

| Bundle                      | Description                                                                |
| --------------------------- | -------------------------------------------------------------------------- |
| **Administration**          | Log viewer and system time sync from GPS                                   |
| **Plotter & Navigation**    | Freeboard-SK chart plotter with routes, waypoints, and navigation features |
| **Dashboard & Instruments** | KIP instrument panel with gauges and data visualization                    |
| **NMEA Integration**        | NMEA 0183 and NMEA 2000 network connectivity                               |
| **Bluetooth Sensors**       | Victron, Renogy, Xiaomi and other BLE device integration                   |
| **WilhelmSK Mobile**        | iOS app integration with push notifications                                |

## After Installation

1. **Configure Plugins** - Go to **Server -> Plugin Config** to configure each plugin
2. **Access Webapps** - Installed webapps appear in the **Webapps** menu
3. **Check Status** - Monitor plugin status on the Dashboard

## Troubleshooting

- **Installation fails**: Check internet connection and server log for details
- **Plugins not working**: Verify plugin is enabled and configured in Plugin Config
- **Need help**: Visit [Signal K Discussions](https://github.com/SignalK/signalk/discussions)
