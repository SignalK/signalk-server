ARG SK_VERSION
FROM signalk/signalk-server:${SK_VERSION}
# With no admin in security.json, anyone could otherwise make themselves admin.
# Server releases before 2.25.0 ignore the variable, so the build refuses them.
RUN grep -qs DISABLE_SECURITY_ACTIVATION /home/node/signalk/node_modules/signalk-server/dist/serverroutes.js \
  || { echo "this server release ignores DISABLE_SECURITY_ACTIVATION" >&2; exit 1; }
ENV DISABLE_SECURITY_ACTIVATION=true
COPY --chown=node:node --chmod=600 security.json /home/node/.signalk/security.json
ENTRYPOINT ["/home/node/signalk/node_modules/signalk-server/bin/signalk-server", "--securityenabled", "--sample-n2k-data"]
