FROM ubuntu:20.04

RUN groupadd --gid 1000 node \
  && useradd --uid 1000 --gid node --shell /bin/bash --create-home node

RUN DEBIAN_FRONTEND=noninteractive apt-get update && DEBIAN_FRONTEND=noninteractive apt-get -y install git python3 python build-essential avahi-daemon avahi-discover avahi-utils libnss-mdns mdns-scan libavahi-compat-libdnssd-dev sysstat procps nano curl
RUN groupadd -r docker -g 998 && groupadd -r i2c -g 997 && groupadd -r spi -g 999 && usermod -a -G dialout,i2c,spi,netdev,docker node

RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
RUN DEBIAN_FRONTEND=noninteractive apt-get -y install nodejs
RUN npm install pm2 -g

USER node
RUN mkdir -p /home/node/signalk
WORKDIR /home/node/signalk

COPY --chown=node:node ./.. .
RUN chmod +x docker/startup.sh

USER root
COPY --chown=root avahi/avahi-dbus.conf /etc/dbus-1/system.d/avahi-dbus.conf
RUN mkdir -p /var/run/dbus/
RUN chmod -R 777 /var/run/dbus/
RUN mkdir -p /var/run/avahi-daemon/
RUN chmod -R 777 /var/run/avahi-daemon/
RUN chown -R avahi:avahi /var/run/avahi-daemon/
USER node

RUN npm install

WORKDIR /home/node/signalk/packages/server-api
RUN npm run build

WORKDIR /home/node/signalk/packages/server-admin-ui
RUN npm run build

WORKDIR /home/node/signalk
RUN npm run build
RUN mkdir -p /home/node/.signalk

RUN rm -rf /home/node/signalk/packages/server-admin-ui/node_modules
RUN rm -rf /home/node/signalk/packages/server-api/node_modules
RUN rm -rf /home/node/signalk/packages/streams/node_modules

EXPOSE 3000
ENV IS_IN_DOCKER true
WORKDIR /home/node/.signalk
ENTRYPOINT /home/node/signalk/docker/startup.sh
