ARG SK_VERSION
ARG MAYARA_VERSION=f7c1cd5
FROM ghcr.io/marineyachtradar/mayara-server:${MAYARA_VERSION} AS mayara

FROM signalk/signalk-server:${SK_VERSION}
# A statically linked build, so it runs on the server image's base as it is
COPY --from=mayara /usr/local/bin/mayara-server /usr/local/bin/mayara-server
COPY --chmod=755 start.sh /home/node/start.sh
COPY --chown=node:node demo-director /home/node/demo-director
COPY --chown=node:node config/ /home/node/.signalk/
# Charts, ENC cells and tidal data made by build-assets.ts before the deploy
COPY --chown=node:node assets/ /home/node/.signalk/
# --install-links copies the local demo-director package instead of linking it,
# so its own dependency (magvar) is installed with it
RUN cd /home/node/.signalk && npm install --omit=dev --install-links --no-audit --no-fund
# With no users in security.json, anyone could otherwise make themselves admin
ENV DISABLE_SECURITY_ACTIVATION=true
# Set by the image's own startup.sh, which start.sh replaces
ENV IS_IN_DOCKER=true SIGNALK_SERVER_IS_UPDATABLE=true
COPY --chown=node:node --chmod=600 security.json /home/node/.signalk/security.json
ENTRYPOINT ["/home/node/start.sh"]
