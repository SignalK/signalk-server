---
title: From Source
---

# Installing from source

Installation from the GitHub repository is useful when developing plugins and components.

To do this enter the following commands in a terminal window:

```shell
# Copy the files to your device
git clone https://github.com/SignalK/signalk-server.git

# change to the folder containing the downloaded files
cd signalk-server

# install pnpm, the package manager used by the repository
npm install -g pnpm@11

# install the dependencies
pnpm install

# build all packages in the repository
pnpm build:all
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
