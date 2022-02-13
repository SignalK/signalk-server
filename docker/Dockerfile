FROM ubuntu:20.04

RUN DEBIAN_FRONTEND=noninteractive apt-get update && DEBIAN_FRONTEND=noninteractive apt-get -y install git python3 python build-essential avahi-daemon avahi-discover avahi-utils libnss-mdns mdns-scan libavahi-compat-libdnssd-dev sysstat procps nano curl

RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash - \
  && DEBIAN_FRONTEND=noninteractive apt-get -y install nodejs

COPY avahi/avahi-dbus.conf /etc/dbus-1/system.d/avahi-dbus.conf
RUN mkdir -p /var/run/dbus/ \
  && chmod -R 777 /var/run/dbus/ \
  && mkdir -p /var/run/avahi-daemon/ \
  && chmod -R 777 /var/run/avahi-daemon/ \
  && chown -R avahi:avahi /var/run/avahi-daemon/

RUN mkdir -p /root/.signalk/ \
  && mkdir -p /root/signalk/

WORKDIR /root/signalk
COPY ./.. .
COPY startup.sh startup.sh
RUN chmod +x startup.sh

RUN npm install

WORKDIR /root/signalk/packages/server-api
RUN npm run build

WORKDIR /root/signalk/packages/server-admin-ui
RUN npm run build

WORKDIR /root/signalk
RUN npm run build

EXPOSE 3000
ENV IS_IN_DOCKER true
WORKDIR /root/.signalk
ENTRYPOINT /root/signalk/startup.sh
