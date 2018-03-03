FROM node:8 as app-builder

WORKDIR /app-build

COPY . .
RUN npm run prepublishOnly

FROM node:8

RUN useradd -ms /bin/bash sk
USER sk
WORKDIR /home/sk

COPY package*.json ./
RUN npm install --only=production

RUN git clone https://github.com/canboat/canboat.git && cd canboat && make bin && make -C analyzer
ENV PATH="/home/sk/canboat/rel/linux-x86_64:${PATH}"

COPY . .
COPY --from=app-builder /app-build/admin-ui/public admin-ui/public
COPY --from=app-builder /app-build/plugin-config/public plugin-config/public

EXPOSE 3000
ENTRYPOINT bin/signalk-server