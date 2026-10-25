ARG SK_VERSION
FROM signalk/signalk-server:${SK_VERSION}
COPY --chown=node:node demo-director /home/node/demo-director
COPY --chown=node:node config/ /home/node/.signalk/
# Charts, ENC cells and tidal data made by build-assets.ts before the deploy
COPY --chown=node:node assets/ /home/node/.signalk/
# --install-links copies the local demo-director package instead of linking it,
# so its own dependency (magvar) is installed with it
RUN cd /home/node/.signalk && npm install --omit=dev --install-links --no-audit --no-fund
COPY --chown=node:node --chmod=600 security.json /home/node/.signalk/security.json
ENTRYPOINT ["/home/node/signalk/node_modules/signalk-server/bin/signalk-server", "--securityenabled"]
