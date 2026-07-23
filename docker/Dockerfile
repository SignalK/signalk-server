ARG REGISTRY="cr.signalk.io"
ARG BASE_IMAGE="24.04-22.x"

FROM ${REGISTRY}/signalk/signalk-server-base:latest-${BASE_IMAGE} AS base

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

# EDITION selects the published variant: "full" bundles the optional webapps and
# plugins; "core" installs the server with --omit=optional, leaving the server,
# the admin UI, serialport, and required libraries. The admin UI ships in core
# via its workspace tarball (kept in both editions below); serialport is an
# external optional package, so core reinstalls it explicitly at the version the
# server declares. Both stay in optionalDependencies but cannot be added back at
# the .signalk layer, so the image must carry them.
ARG EDITION=full

# npm 12 gates dependency install-time lifecycle scripts behind an allowlist
# (allow-scripts defaults to empty). @canboat/canboatjs builds its native
# SocketCAN addon (canSocket.node) from an "install" script and ships no
# prebuilt binaries, so without this the CAN interface silently disappears.
# The install is asserted below so a future regression fails the build loudly.
RUN printf 'allow-scripts[]=@canboat/canboatjs\n' > /home/node/signalk/.npmrc

# Install workspace tarballs locally (not globally) to avoid permission issues,
# then install signalk-server. The grep excludes the top-level signalk-server
# tarball (installed separately below); the admin UI tarball is intentionally
# kept in both editions. The @signalk relocation is guarded on presence.
RUN case "$EDITION" in \
      full) npm_flags="" ;; \
      core) npm_flags="--omit=optional" ;; \
      *) echo "Unknown EDITION: $EDITION" >&2; exit 1 ;; \
    esac \
  && npm init -y \
  && workspace_tarballs=$(ls *.tgz 2>/dev/null | grep -Ev '^signalk-server-[0-9]' || true) \
  && if [ -n "$workspace_tarballs" ]; then npm install $workspace_tarballs; fi \
  && server_tarball=$(ls signalk-server-[0-9]*.tgz) \
  && npm install "$server_tarball" --install-strategy=nested $npm_flags \
  && if [ "$EDITION" = core ]; then \
       serialport_spec=$(node -p "require('signalk-server/package.json').optionalDependencies.serialport") \
       && npm install $npm_flags "serialport@$serialport_spec"; \
     fi \
  && if [ -d node_modules/@signalk ]; then \
       mkdir -p node_modules/signalk-server/node_modules/@signalk/ \
       && cp -rf node_modules/@signalk/* node_modules/signalk-server/node_modules/@signalk/ \
       && rm -rf node_modules/@signalk/; \
     fi \
  && rm *.tgz \
  && can_socket=$(find node_modules -path '*/@canboat/canboatjs/build/Release/canSocket.node' -print -quit) \
  && if [ -z "$can_socket" ]; then \
       echo "canSocket.node missing — canboatjs install script did not build the native CAN addon (npm allow-scripts gate skipped it, or node-gyp rebuild failed)" >&2; \
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
