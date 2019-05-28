ARG IMAGE_BASE=node
FROM $IMAGE_BASE:8

#COPY requires one valid argument, second can be nonexistent
COPY empty_file tmp/qemu-arm-stati[c] /usr/bin/

RUN groupadd -r signalk -g 1001 && groupadd -r i2c -g 998 && groupadd -r spi -g 999 && useradd -u 999 --no-log-init -r -g signalk -G dialout,i2c,spi signalk
WORKDIR /home/signalk
RUN chown -R signalk /home/signalk
USER signalk

COPY package*.json ./
RUN npm install --only=production

COPY . .

EXPOSE 3000
ENTRYPOINT bin/signalk-server
