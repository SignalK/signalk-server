---
title: NPM
---

# Installing from NPM

Signal K Server can be installed directly using NPM.

## Linux / macOS

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

You are ready to now **[configure](../setup/configuration.md)** your installation and connect data from devices on your boat.

## Windows

See [Installing on Windows](https://github.com/SignalK/signalk-server-windows).
