ARG SK_VERSION
ARG MAYARA_VERSION=3.17.5
FROM ghcr.io/marineyachtradar/mayara-server:${MAYARA_VERSION} AS mayara

FROM signalk/signalk-server:${SK_VERSION}
# A statically linked build, so it runs on the server image's base as it is
COPY --from=mayara /usr/local/bin/mayara-server /usr/local/bin/mayara-server
COPY --chmod=755 start.sh /home/node/start.sh
COPY --chown=node:node demo-director /home/node/demo-director
COPY --chown=node:node boat-systems /home/node/boat-systems
COPY --chown=node:node config/ /home/node/.signalk/
# Charts, ENC cells and tidal data made by build-assets.ts before the deploy
COPY --chown=node:node assets/ /home/node/.signalk/
# --install-links copies the local demo packages instead of linking them,
# so their own dependencies (magvar) are installed with them
RUN cd /home/node/.signalk && npm install --omit=dev --install-links --no-audit --no-fund
# With no users in security.json, anyone could otherwise make themselves admin.
# Server releases before 2.25.0 ignore the variable, so the build refuses them.
RUN grep -qs DISABLE_SECURITY_ACTIVATION /home/node/signalk/node_modules/signalk-server/dist/serverroutes.js \
  || { echo "this server release ignores DISABLE_SECURITY_ACTIVATION" >&2; exit 1; }
ENV DISABLE_SECURITY_ACTIVATION=true
# Set by the image's own startup.sh, which start.sh replaces
ENV IS_IN_DOCKER=true SIGNALK_SERVER_IS_UPDATABLE=true
COPY --chown=node:node --chmod=600 security.json /home/node/.signalk/security.json
ENTRYPOINT ["/home/node/start.sh"]
