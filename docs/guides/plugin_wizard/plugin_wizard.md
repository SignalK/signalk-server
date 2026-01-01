---
title: Plugin Wizard
---

# Plugin Wizard

The Plugin Wizard provides an easy way to get started with Signal K Server by installing curated bundles of plugins and webapps that work well together for common use cases.

## Overview

Instead of manually searching through the App Store for individual plugins, the Plugin Wizard lets you select one or more pre-configured bundles tailored to specific needs such as chart plotting, anchor monitoring, or data logging. Each bundle contains a carefully selected set of plugins that complement each other.

## Accessing the Plugin Wizard

There are two ways to access the Plugin Wizard:

### Fresh Installation

On a fresh Signal K Server installation, the Dashboard will display a welcome prompt asking if you'd like to run the Plugin Wizard. Click **Run Plugin Wizard** to get started.

If you choose to skip it, you can dismiss the prompt and access the wizard later.

### From the App Store Menu

You can access the Plugin Wizard at any time by navigating to **Appstore -> Plugin Wizard** in the main menu.

## Using the Plugin Wizard

The wizard guides you through four simple steps:

### Step 1: Welcome

The welcome screen introduces the wizard. Click **Get Started** to proceed to bundle selection.

_Note: If you have already installed plugins, this step is skipped._

### Step 2: Select Bundles

Choose one or more bundles that match your use case. Each bundle card shows:

- **Icon and Name** - Visual identifier for the bundle
- **Description** - What the bundle provides
- **Package Count** - Number of plugins and webapps included
- **Status Badge** - Shows "Installed" if all plugins in the bundle are already installed

Click on a bundle card to select it. You can select multiple bundles - the wizard will automatically handle any duplicate plugins that appear in multiple bundles.

Already-installed bundles can be reinstalled if you need to repair or update them.

### Step 3: Confirm Installation

Review the complete list of packages that will be installed:

- **Plugins** are shown with their npm package name and description
- **Webapps** are shown with a "Landing Page" badge if they will be set as the default landing page
- Packages included in multiple selected bundles are marked with a badge showing the bundle count

Click **Install** to begin the installation process, or **Back** to modify your selection.

### Step 4: Installation Progress

The wizard installs each package sequentially, showing:

- Current package being installed
- Progress through the total package list
- Success or error status for each package

Installation may take several minutes depending on the number of packages and your internet connection speed.

### Step 5: Complete

After installation completes, you'll see a summary showing:

- Successfully installed packages
- Any packages that failed to install (with error details)
- A prompt to restart the server

**Important:** Click **Restart Server** to activate the newly installed plugins. Plugins will not be available until the server restarts.

## Available Bundles

The following bundles are available:

### Administration

Essential server administration tools including log viewing and system time synchronization from GPS. Includes optional Raspberry Pi monitoring and Starlink integration.

**Plugins:**

- `signalk-logviewer` - View Signal K server logs
- `@signalk/set-system-time` - Sets system time from GPS data
- `signalk-rpi-monitor` - Raspberry Pi CPU, memory, storage and temperature monitoring (optional)
- `signalk-starlink` - Starlink Dishy statistics and auto-stow while in transit (optional)

### Plotter & Navigation

Chart display, route planning, waypoints, and navigation features. Perfect for chart plotters and navigation displays.

**Plugins:**

- `@signalk/charts-plugin` - Serves chart tiles to chart plotting apps
- `signalk-charts-provider-simple` - Simple chart provider for local chart files (optional)
- `signalk-pmtiles-plugin` - ProtoMaps chart provider (optional)
- `@signalk/resources-provider` - Stores and serves routes, waypoints, regions, and notes
- `@signalk/course-provider` - Provides course calculations and destination tracking
- `@signalk/signalk-autopilot` - Autopilot control interface (optional)
- `@signalk/vesselpositions` - Displays nearby vessels from AIS data on the chart (optional)
- `@signalk/tracks-plugin` - Records vessel track history (optional)
- `signalk-anchoralarm-plugin` - Monitors anchor position and triggers alarms (optional)
- `signalk-simple-notifications` - Depth alarm notifications (optional)
- `signalk-flags` - Displays country flags for vessels (optional)
- `signalk-activecaptain-resources` - ActiveCaptain POI data integration (optional)
- `signalk-buddylist-plugin` - Track and display buddy vessels (optional)
- `signalk-to-influxdb2` - History API for playback and data logging (optional)

**Webapps:**

- `@signalk/freeboard-sk` - Full-featured chart plotter and navigation display (set as landing page)

### Dashboard & Instruments

Instrument panels, gauges, and real-time data visualization. Great for helm displays and monitoring.

**Plugins:**

- `signalk-derived-data` - Calculates derived values like true wind, VMG, etc. (optional)
- `@signalk/zones` - Configures alert zones for values (optional)
- `signalk-speed-wind-averaging` - Provides smoothed speed and wind readings (optional)
- `bt-sensors-plugin-sk` - Bluetooth sensor integration for Victron, Renogy, Xiaomi and others (optional)

**Webapps:**

- `@signalk/instrumentpanel` - Customizable instrument panel with gauges and displays (set as landing page)
- `@mxtommy/kip` - Modern, customizable instrument display
- `@signalk/sailgauge` - Sailing-focused wind and performance gauges

### Data Logger

Record and analyze historical data. Useful for performance analysis, maintenance tracking, and voyage logs.

**Plugins:**

- `signalk-to-influxdb2` - Logs Signal K data to InfluxDB for analysis
- `signalk-engine-hours` - Track engine running hours (optional)
- `signalk-to-mongodb` - Store Signal K data in MongoDB (optional)
- `signalk-postgsail` - Automatic voyage logging to PostgSail cloud (optional)
- `signalk-to-batch-format` - Compressed batch JSON files for cloud storage (optional)
- `signalk-path-mapper` - Remap data paths for logging compatibility (optional)

### Anchor Watch

Anchor alarm and monitoring features. Get alerts when your vessel moves outside a defined area.

**Plugins:**

- `signalk-anchoralarm-plugin` - Monitors anchor position and triggers alarms
- `signalk-push-notifications` - Sends push notifications to mobile devices (optional)
- `signalk-alarm-silencer` - Provides UI to acknowledge and silence alarms (optional)
- `hoekens-anchor-alarm` - Web app anchor alarm with scope calculator and engine override (optional)
- `signalk-tides` - Provides tide data for scope calculations (optional)
- `@meri-imperiumi/signalk-autostate` - Auto-detect anchored vs moored state (optional)

**Webapps:**

- `@signalk/freeboard-sk` - View anchor position on chart (set as landing page)

### NMEA Integration

Plugins for connecting to NMEA 0183 and NMEA 2000 networks. Essential for integrating with existing marine electronics.

**Plugins:**

- `@signalk/signalk-to-nmea0183` - Outputs Signal K data as NMEA 0183 sentences (optional)
- `@signalk/udp-nmea-plugin` - Receives NMEA data over UDP network (optional)
- `signalk-to-nmea2000` - Outputs Signal K data to NMEA 2000 network (optional)
- `@canboat/visual-analyzer` - NMEA 2000 data visualization and analysis tool (optional)
- `signalk-n2k-switching` - Control NMEA 2000 switching devices (optional)
- `signalk-maretron-proprietary` - Support for Maretron proprietary PGNs (optional)

### AIS & Vessel Tracking

AIS data processing, vessel tracking, collision avoidance, and reporting to services like MarineTraffic.

**Plugins:**

- `@signalk/vesselpositions` - Displays nearby vessels from AIS data
- `ais-forwarder` - Forward AIS data to MarineTraffic, AISHub and others (optional)
- `@signalk/aisreporter` - Report vessel position to MarineTraffic without AIS hardware (optional)
- `signalk-n2kais-to-nmea0183` - Convert NMEA 2000 AIS to NMEA 0183 format (optional)
- `signalk-vessels-to-ais` - Convert vessel data to NMEA 0183 AIS format (optional)
- `signalk-ais-target-prioritizer` - CPA/TCPA collision risk warnings and alarms (optional)
- `@noforeignland/signalk-to-noforeignland` - Upload tracks and logs to NoForeignLand (optional)
- `signalk-saillogger` - Automated sailing log entries (optional)
- `naivegpxlogger` - Simple GPX track logging (optional)
- `signalk-windy` - Send data to Windy.com weather service (optional)
- `signalk-derived-data` - Calculates derived values required by signalk-windy (optional)

### WilhelmSK Mobile

iOS/mobile app integration with push notifications and remote monitoring for users of the WilhelmSK app.

**Plugins:**

- `signalk-wilhelmsk-plugin` - Special functionality for WilhelmSK app
- `signalk-push-notifications` - Sends push notifications to mobile devices
- `signalk-alarm-silencer` - Acknowledge and silence alarms from WilhelmSK (optional)
- `@signalk/zones` - Configure alert zones for values (optional)
- `signalk-anchoralarm-plugin` - Anchor monitoring with mobile alerts (optional)
- `signalk-raymarine-autopilot` - Raymarine autopilot control from WilhelmSK (optional)
- `signalk-fusion-stereo` - Fusion stereo control from WilhelmSK (optional)

### Home Automation

Node-RED, MQTT, and smart home integration for vessel automation.

**Plugins:**

- `@signalk/signalk-node-red` - Node-RED integration for flow-based automation
- `signalk-mqtt-gw` - MQTT gateway for Home Assistant and other systems (optional)
- `signalk-shelly2` - Shelly smart device integration (optional)
- `signalk-philips-hue` - Philips Hue smart lighting control (optional)

## After Installation

After the server restarts with the newly installed plugins:

1. **Configure Plugins** - Navigate to **Server -> Plugin Config** to configure each installed plugin. Most plugins require some configuration before they become active.

2. **Access Webapps** - Installed webapps appear in the **Webapps** menu. If a webapp was set as the landing page, it will be the default page when accessing your server.

3. **Check Status** - Use the Dashboard to monitor plugin status and check for any errors in the server log (**Server -> Server Log**).

## Tips

- **Start Small** - If you're new to Signal K, start with one or two bundles and add more as you become familiar with the system.

- **Plotter Bundle First** - For most users, the "Plotter & Navigation" bundle with Freeboard-SK is a great starting point.

- **Overlap is OK** - Don't worry about selecting bundles with overlapping plugins. The wizard automatically deduplicates packages.

- **Configure After Install** - Remember that most plugins need configuration after installation. Check each plugin's settings in Plugin Config.

- **Check Dependencies** - Some plugins have external dependencies (like InfluxDB for data logging). Check the individual plugin documentation for setup requirements.

## Troubleshooting

### Installation Fails

If a package fails to install:

1. Check your internet connection
2. View the server log for detailed error messages
3. Try installing the package manually via the App Store
4. Check if the package has external dependencies that need to be installed first

### Plugins Not Working After Restart

1. Verify the plugin is enabled in **Server -> Plugin Config**
2. Check the plugin's configuration settings
3. Look for errors in **Server -> Server Log**
4. Some plugins require additional hardware or services to function

### Bundle Shows as "Installed" but Plugins Missing

The wizard considers a bundle installed if all its plugins are present. If you manually removed a plugin, you can reinstall the bundle to restore it.

For additional help, visit [Signal K Discussions](https://github.com/SignalK/signalk/discussions) or join [Signal K Discord](https://discord.gg/uuZrwz4dCS).
