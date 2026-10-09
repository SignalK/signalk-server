ARG REGISTRY="cr.signalk.io"
ARG BASE_IMAGE="24.04-24.x"

FROM ${REGISTRY}/signalk/signalk-server-base:latest-${BASE_IMAGE} AS base

# Base images published before pnpm was added to them lack it, and the App
# Store needs it at runtime too.
RUN command -v pnpm >/dev/null || (npm install -g pnpm@11 && npm cache clean --force)

USER node
RUN mkdir -p /home/node/.signalk/ \
  && mkdir -p /home/node/signalk/

WORKDIR /home/node/signalk

FROM base AS tarballs_installed
WORKDIR /home/node/signalk
COPY --chown=node:node *.tgz .

# EDITION selects the published variant: "full" bundles the optional webapps and
# plugins; "core" leaves out optional dependencies, keeping the server, the
# admin UI, serialport, local Bluetooth support, and required libraries.
# The admin UI ships in core as a direct dependency from its workspace tarball;
# serialport and the Bluetooth packages are external optional packages, so core
# reinstalls them explicitly at the versions the server declares. They cannot
# be added back at the .signalk layer, so the image must carry them.
ARG EDITION=full

# pnpm runs dependency install scripts only for approved packages.
# @canboat/canboatjs builds its native SocketCAN addon (canSocket.node) from an
# "install" script and ships no prebuilt binaries, so without approval the CAN
# interface silently disappears. The build is asserted below so a regression
# fails loudly. Other dependencies' scripts are not needed at runtime and are
# skipped instead of failing the build; the explicit "false" entries keep pnpm
# from reporting them as ignored.
# Release-age gating is off because an image build must install the versions
# the packages declare, which pnpm would otherwise silently replace with older
# ones when they are less than a day old.
# "optional: false" keeps the core edition's later additions from bringing the
# optional dependencies back. The overrides make the server's dependencies on
# the workspace packages resolve to these tarballs instead of the registry, so
# only the server — and in core the admin UI, which "optional: false" would
# otherwise leave out — is added as a direct dependency.
RUN case "$EDITION" in \
      full) optional=true ;; \
      core) optional=false ;; \
      *) echo "Unknown EDITION: $EDITION" >&2; exit 1 ;; \
    esac \
  && printf '%s\n' \
       "optional: $optional" \
       'strictDepBuilds: false' \
       'allowBuilds:' \
       "  '@canboat/canboatjs': true" \
       "  '@serialport/bindings-cpp': true" \
       "  '@parcel/watcher': false" \
       "  '@scarf/scarf': false" \
       '  core-js: false' \
       '  es5-ext: false' \
       '  storage-engine: false' \
       'minimumReleaseAge: 0' \
       'overrides:' > pnpm-workspace.yaml \
  && for tgz in *.tgz; do \
       name=$(tar -xOzf "$tgz" package/package.json | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).name') \
       && printf "  '%s': file:./%s\n" "$name" "$tgz" >> pnpm-workspace.yaml \
       && case "$name" in \
            signalk-server) direct="$direct ./$tgz" ;; \
            @signalk/server-admin-ui) if [ "$EDITION" = core ]; then direct="$direct ./$tgz"; fi ;; \
          esac; \
     done \
  && printf '{"name":"signalk","private":true}\n' > package.json \
  && pnpm add $direct \
  && if [ "$EDITION" = core ]; then \
       serialport_spec=$(node -p "require('signalk-server/package.json').optionalDependencies.serialport") \
       && node_ble_spec=$(node -p "require('signalk-server/package.json').optionalDependencies['@naugehyde/node-ble']") \
       && dbus_next_spec=$(node -p "require('signalk-server/package.json').optionalDependencies['@jellybrick/dbus-next']") \
       && pnpm add "serialport@$serialport_spec" "@naugehyde/node-ble@$node_ble_spec" "@jellybrick/dbus-next@$dbus_next_spec"; \
     fi \
  && rm *.tgz \
  && can_socket=$(find node_modules -path '*/@canboat/canboatjs/build/Release/canSocket.node' -print -quit) \
  && if [ -z "$can_socket" ]; then \
       echo "canSocket.node missing — canboatjs install script did not build the native CAN addon (not approved in allowBuilds, or node-gyp rebuild failed)" >&2; \
       exit 1; \
     fi

FROM base

# Copy locally installed modules from tarballs_installed stage
COPY --from=tarballs_installed --chown=node:node /home/node/signalk /home/node/signalk

COPY --chown=node:node --chmod=755 docker/startup.sh startup.sh

EXPOSE 3000
ENV SKIP_ADMINUI_VERSION_CHECK=true
WORKDIR /home/node/.signalk
ENTRYPOINT ["/home/node/signalk/startup.sh"]
