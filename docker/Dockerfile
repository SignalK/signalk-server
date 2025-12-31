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
COPY --chown=node:node *.tgz .

# Install all tarballs locally (not globally) to avoid permission issues
# npm will resolve dependencies between the local tarballs
RUN npm install ./*.tgz

FROM base

# Copy locally installed modules from tarballs_installed stage
COPY --from=tarballs_installed --chown=node:node /home/node/signalk /home/node/signalk

USER node
COPY --chown=node docker/startup.sh startup.sh
RUN chmod +x startup.sh

EXPOSE 3000
ENV IS_IN_DOCKER=true
ENV SKIP_ADMINUI_VERSION_CHECK=true
WORKDIR /home/node/.signalk
ENTRYPOINT ["/home/node/signalk/startup.sh"]
