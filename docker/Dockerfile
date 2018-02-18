FROM node:8

RUN apt-get update && apt-get install sudo
RUN useradd -ms /bin/bash sk &&\
 echo "sk:sk" | chpasswd &&\
 adduser sk sudo &&\
 echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

USER sk
WORKDIR /home/sk

RUN git clone https://github.com/canboat/canboat.git && cd canboat && make bin && make -C analyzer
ENV PATH="/home/sk/canboat/rel/linux-x86_64:${PATH}"

RUN sudo npm install -g --unsafe-perm signalk-server

USER root
RUN gpasswd -d sk sudo

USER sk

EXPOSE 3000
ENTRYPOINT signalk-server
