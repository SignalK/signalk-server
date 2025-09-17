---
title: Docker
---

# Installing from Docker

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
