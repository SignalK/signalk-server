ARG SK_VERSION
FROM signalk/signalk-server:${SK_VERSION}
# With no users in security.json, anyone could otherwise make themselves admin
ENV DISABLE_SECURITY_ACTIVATION=true
COPY --chown=node:node --chmod=600 security.json /home/node/.signalk/security.json
ENTRYPOINT ["/home/node/signalk/node_modules/signalk-server/bin/signalk-server", "--securityenabled", "--sample-n2k-data", "--override-timestamps"]