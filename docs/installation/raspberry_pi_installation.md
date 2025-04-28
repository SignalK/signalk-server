---
title: Raspberry Pi
---

# Installation on Raspberry Pi

Installation of Signal K server can consists of the following steps:

1. Install the tools and libraries required to run the Signal K server (the dependencies)
1. Install a Signal K Server to process the Signal K data
1. Run the Setup script.

_**Important:** If you are updating a Signal K server installation, especially if upgrading an installed version <= 1.40.0, [please check here first](./updating.md)._

### Prerequisites:

Raspberry Pi OS is installed on the device.

For instructions on how to install the operating system [can be found here.](https://www.raspberrypi.org/documentation/computers/getting-started.html#setting-up-your-raspberry-pi).

_Note: It is also possible to perform a "headless install" using `Raspberry Pi OS Lite` since the GUI for Signal K is browser based._

Once the OS installation has been completed, you are ready to commence.

---

## Install the Dependencies

1. Log in to the RPi Desktop and open a terminal.

1. Update the list of install packages.

   ```
   sudo apt update
   ```

1. Install NodeJS 20 and npm.

   Follow [instructions for Ubuntu and Debian based distributions like Raspberry Pi OS at NodeSource Distributions](https://github.com/nodesource/distributions#installation-instructions).

1. Ensure that we're using the latest version of npm.

   ```
   sudo npm install -g npm@latest
   ```

   Use the following command to check the versions of NodeJS and npm installed.

   ```
   node -v && npm -v
   ```

   Ensure the reported versions are equal to or greater than `v18.15.0, 9.5.0` respectively.

1. Install a Bonjour (mDNS) service for Linux called Avahi, which allows Apps and other network devices to Discover the Signal K server.
   ```
   sudo apt install libnss-mdns avahi-utils libavahi-compat-libdnssd-dev
   ```

## Install Signal K Server

```
sudo npm install -g signalk-server
```

You can test that installation was successful by starting the server using some
sample data.

```
signalk-server --sample-nmea0183-data
```

You should see the terminal output "signalk-server running at 0.0.0.0:3000" as shown below...

```
signalk-server --sample-nmea0183-data
Using sample data from /usr/lib/node_modules/signalk-server/samples/plaka.log
signalk-server running at 0.0.0.0:3000
```

The Signal K Node Server is now reading and publishing sample NMEA0183 data from the specified file.

Using a Web browser enter the following URL: `http://127.0.0.1:3000/signalk` which should display the following information indicating the server is up and running.

```JSON
{
    "endpoints":{
        "v1":{
            "version":"2.0.0",
            "signalk-http":"http://127.0.0.1:3000/signalk/v1/api/",
            "signalk-ws":"ws://127.0.0.1:3000/signalk/v1/stream",
            "signalk-tcp":"tcp://127.0.0.1:3858"
        }
    },
    "server":{
        "id":"signalk-server-node",
        "version":"2.0.0"
    }
}
```

## Run the Setup Script

Now that you have Signal K server installed, you will want to generate a settings file for your vessel
and configure your RPi to start the server automatically. To do this run the setup script by entering the following command and follow the prompts.

```
sudo signalk-server-setup
```

You can re-run this command at any time in the future to change the settings.

_Note: The setup script will enable security which will require you to `Login`` from the Admin UI.
Clicking `Login` for the first time will prompt you to create a user and password._

Signal K server will now be started automatically when your RPi boots up.

If you want to temporarily stop the Signal K server, you can do so by entering the following commands:

```
sudo systemctl stop signalk.service
sudo systemctl stop signalk.socket
```

To start Signal K server again enter the following commands:

```
sudo systemctl start signalk.service
sudo systemctl start signalk.socket
```

To stop Signal K server from starting automatically enter the following commands:

```
sudo systemctl disable signalk.service
sudo systemctl disable signalk.socket
```

You are ready to now **[configure](../setup/configuration.md)** your installation and connect data from devices on your boat.
