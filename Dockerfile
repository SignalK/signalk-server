ARG IMAGE_BASE=node
FROM $IMAGE_BASE:8

#COPY requires one valid argument, second can be nonexistent
COPY empty_file tmp/qemu-arm-stati[c] /usr/bin/

RUN groupadd -r i2c -g 998 && groupadd -r spi -g 999 && usermod -a -G dialout,i2c,spi node
USER node
RUN mkdir -p /home/node/signalk
WORKDIR /home/node/signalk

COPY . .
RUN npm install --only=production

COPY . .

EXPOSE 3000
ENTRYPOINT /home/node/signalk/bin/signalk-server
