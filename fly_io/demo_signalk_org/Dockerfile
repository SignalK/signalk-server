ARG SK_VERSION
ARG MAYARA_VERSION=latest
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
# A new value per deploy keeps the builder from reusing an install made
# before newer plugin releases came out.
ARG DEMO_BUILD
# --install-links copies the local demo packages instead of linking them,
# so their own dependencies (magvar) are installed with them
RUN cd /home/node/.signalk && npm install --omit=dev --install-links --no-audit --no-fund
# With no admin in security.json, anyone could otherwise make themselves admin.
# Server releases before 2.25.0 ignore the variable, so the build refuses them.
RUN grep -qs DISABLE_SECURITY_ACTIVATION /home/node/signalk/node_modules/signalk-server/dist/serverroutes.js \
  || { echo "this server release ignores DISABLE_SECURITY_ACTIVATION" >&2; exit 1; }
# The demo login may write, so the Notifications API has to check the ACL,
# or that login could silence and clear alarms for every visitor.
RUN grep -qs updateAllowed /home/node/signalk/node_modules/signalk-server/dist/api/notifications/index.js \
  || { echo "this server release lets any login change notifications" >&2; exit 1; }
ENV DISABLE_SECURITY_ACTIVATION=true
# Set by the image's own startup.sh, which start.sh replaces
ENV IS_IN_DOCKER=true SIGNALK_SERVER_IS_UPDATABLE=true
COPY --chown=node:node --chmod=600 security.json /home/node/.signalk/security.json
# start.sh starts as root to hand the history volume to node, then drops to node
USER root
ENTRYPOINT ["/home/node/start.sh"]
