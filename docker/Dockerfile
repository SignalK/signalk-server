ARG REGISTRY="cr.signalk.io"
ARG UBUNTU_VERSION="24.04-22.x"

FROM ${REGISTRY}/signalk/signalk-server-base:latest-${UBUNTU_VERSION} AS base

USER node
RUN mkdir -p /home/node/.signalk/ \
  && mkdir -p /home/node/signalk/

WORKDIR /home/node/signalk

RUN npm config rm proxy \
  && npm config rm https-proxy \
  && npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 60000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm cache clean -f

FROM base AS tarballs_installed
WORKDIR /home/node/signalk
COPY *.tgz .
USER root

RUN npm i -g *.tgz
# move workspace dependencies that get installed under root also under signalk-server of signalk-server
# use cp & rm to avoid 'directory not empty' with some deps already present
RUN cp -rf /usr/lib/node_modules/@signalk/* /usr/lib/node_modules/signalk-server/node_modules/@signalk/ && rm -rf /usr/lib/node_modules/@signalk

FROM base

USER root
# add signalk-server on path like in production build
RUN ln -s /usr/lib/node_modules/signalk-server/bin/signalk-server /usr/bin/signalk-server
# all -g installed modules
COPY --from=tarballs_installed /usr/lib/node_modules /usr/lib/node_modules

USER node
COPY --chown=node docker/startup.sh startup.sh
RUN chmod +x startup.sh

EXPOSE 3000
ENV IS_IN_DOCKER=true
ENV SKIP_ADMINUI_VERSION_CHECK=true
WORKDIR /home/node/.signalk
ENTRYPOINT ["/home/node/signalk/startup.sh"]
