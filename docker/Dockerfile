FROM signalk/signalk-server-base:latest

USER node
RUN mkdir -p /home/node/.signalk/ \
  && mkdir -p /home/node/signalk/

WORKDIR /home/node/signalk
COPY --chown=node . .
COPY --chown=node docker/startup.sh startup.sh
RUN chmod +x startup.sh

RUN npm config rm proxy \
  && npm config rm https-proxy

RUN npm install --package-lock-only \
  && npm ci && npm cache clean --force \
  && npm run build:all

EXPOSE 3000
ENV IS_IN_DOCKER true
WORKDIR /home/node/.signalk
ENTRYPOINT /home/node/signalk/startup.sh
