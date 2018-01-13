FROM mhart/alpine-node:6
RUN apk update && apk add openssl git python build-base gcc abuild binutils
#RUN adduser signalk -D -h /signalk
RUN git clone https://github.com/SignalK/signalk-server-node.git &&\
 cd signalk-server-node/ &&\
 npm install

RUN git clone https://github.com/canboat/canboat.git && cd canboat && make bin && make -C analyzer
ENV PATH="/canboat/rel/linux-x86_64:${PATH}"

EXPOSE 3000
#USER signalk
ENTRYPOINT cd /signalk-server-node && exec bin/n2k-from-file

