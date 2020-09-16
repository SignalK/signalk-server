ARG IMAGE_BASE=node
FROM $IMAGE_BASE:10

#COPY requires one valid argument, second can be nonexistent
COPY empty_file tmp/qemu-arm-stati[c] /usr/bin/

RUN apt-get update && apt-get -y install apt-utils
RUN apt-get update && apt-get -y install sudo git python3 python build-essential avahi-daemon avahi-discover avahi-utils libnss-mdns mdns-scan libavahi-compat-libdnssd-dev sysstat procps
RUN groupadd -r i2c -g 998 && groupadd -r spi -g 999 && usermod -a -G dialout,i2c,spi,netdev node

USER node
RUN mkdir -p /home/node/signalk
WORKDIR /home/node/signalk

COPY --chown=node:node . .
RUN chmod +x startup.sh
RUN chmod +x avahi/avahi.sh
COPY --chown=root avahi/avahi-dbus.conf /etc/dbus-1/system.d/avahi-dbus.conf

USER root
RUN mkdir -p /var/run/dbus/
RUN chmod -R 777 /var/run/dbus/
RUN mkdir -p /var/run/avahi-daemon/
RUN chmod -R 777 /var/run/avahi-daemon/
RUN chown -R avahi:avahi /var/run/avahi-daemon/
USER node

RUN npm install
RUN npm run build
RUN mkdir -p /home/node/.signalk

EXPOSE 3000
ENV IS_IN_DOCKER true
ENTRYPOINT sh /home/node/signalk/docker-startup.sh
