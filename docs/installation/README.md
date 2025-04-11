---
title: Installation
children:
  - raspberry_pi_installation.md
  - updating.md
  - command_line.md
---

# Getting Started

Signal K Server is a NodeJS application which can be installed on a variety of devices and operating systems.

It is available for installation via:

1. NPM package
1. Docker image
1. GitHub repository

See the relevant section below for instructions based on your target system.

## Prerequisites

> [!NOTE]
> Signal K server requires [NodeJS](https://nodejs.org) version >= 20 be installed on the target system prior to commencing installation.

---

## Raspberry Pi Installation

[Install Signal K Server on Raspberry Pi](raspberry_pi_installation.md) outlines the process for getting Signal K Server up and running _(including supporting services)_ on Raspberry Pi OS.

---

## Using Docker

Signal K Server is available as a Docker image on _Docker Hub_ and _cr.signalk.io/signalk/signalk-server_.

To simply run a Signal K Server with some sample data on a device with docker installed, enter the following into a terminal:

```shell
docker run -it --rm --publish 3000:3000 signalk/signalk-server
```

This will start an instance of Signal K Server on port 3000 which you can then access via the web based Admin UI by pointing your web browser at `http://localhost:3000`.

If you are wanting to use docker to deploy Signal K Server on your vessel you will need to:

1. Specify a location to persist the server's configuration so it is not lost between restarts
1. Run the instance as a background process

_Example: Run as background process and store server configuration in the current folder:_

```shell
docker run -d --init --name signalk-server -p 3000:3000 -v $(pwd):/home/node/.signalk signalk/signalk-server
```

You are ready to now **[configure](../setup/configuration.md)** your installation and connect data from devices on your boat.

---

## Installation via NPM

Signal K Server can be installed directly using NPM.

_Windows:_

- See [Installing on Windows](#installing-on-windows) below.

_Linux / macOS:_

```shell
sudo npm install -g signalk-server
```

Once installation is complete, enter the following in a terminal window, to generate a settings file and configure the server to start automatically:

```shell
sudo signalk-server-setup
```

If you choose not to use `signalk-server-setup` you can start the server by entering the following in a terminal window:

```shell
signalk-server
```

---

## Installing on Windows

Please use the [Signal K installer for Windows](https://github.com/SignalK/signalk-server-windows) to install Signal K Server on a Windows device.

---

## Install using Git

Installation from the GitHub repository is useful when developing plugins and components.

To do this enter the following commands in a terminal window:

```shell
# Copy the files to your device
git clone https://github.com/SignalK/signalk-server.git

# change to the folder containing the downloaded files
cd signalk-server

# install the dependencies
npm install

# build all packages in the repository
npm run build:all
```

To start Signal K Server with a sample configuration file and some sample data, enter the following into a terminal:
_To use NMEA0183 sample data:_

```shell
bin/nmea-from-file
```

_To use NMEA2000 sample data:_

```shell
bin/n2k-from-file
```

The server will start playing back data from the specified sample file that can be viewed using the _Data Browser_ in the Admin UI _(`http://localhost:3000`)_ or via REST API / websocket connection.

---
