---
title: NPM
---

# Installing from NPM

Signal K Server can be installed directly using NPM.

## Linux / macOS

```shell
sudo npm install -g signalk-server --allow-scripts=@canboat/canboatjs
```

npm 12 and later block install scripts they are not told to allow, so `--allow-scripts` lets npm run the one that builds the server's native CAN bus support. npm 11 runs install scripts by default, and older npm ignores the option.

The App Store installs plugins and webapps with [pnpm](https://pnpm.io), so install it as well:

```shell
sudo npm install -g pnpm@11
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
