# Getting Started

Signal K Server can be installed on a variety of devices and operating systems.

See the relevant sections below based on your target system.


### Prerequisites:

_Signal K server requires NodeJs version >= 18 be available on the target system._

---

## Installation using NPM:    

To install Signal K Server directly from NPM:

_Linux / macOS:_
```
$ sudo npm install -g signalk-server
```

Once installation is complete, generate a settings file and configure the server to start automatically, enter the following in a terminal window:
```
$ sudo signalk-server-setup
```

If you shoose not to use `signalk-server-setup` you can start the server by entering the following in a terminal window:
```
signalk-server 
```

## Raspberry Pi Installation

To install Signal K server on a RaspberryPi running Raspberry Pi OS, use the link below.
This document details how to install Signal K Server as well as supporting services.

* [Installation on a RaspberryPi](raspberry_pi_installation.md)


## Installing on Windows

For installation on a device with Windows please use the [Signal K installer for Windows](https://github.com/SignalK/signalk-server-windows).


## Using Docker:

A Signal K Server Docker image is available on Docker Hub.

You can start a local server on port 3000  with demo data with

```
docker run --rm signalk/signalk-server --publish 3000:3000
```

See [Docker quickstart instructions](https://github.com/SignalK/signalk-server/blob/master/docker/README.md#quickstart) for details about how to configure and use docker on your vessel.





