ARG SK_VERSION
FROM signalk/signalk-server:${SK_VERSION}
COPY --chown=node:node --chmod=600 security.json /home/node/.signalk/security.json
ENTRYPOINT ["/home/node/signalk/node_modules/signalk-server/bin/signalk-server", "--securityenabled", "--sample-n2k-data"]