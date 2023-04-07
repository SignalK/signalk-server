# docker buildx build --platform linux/amd64 -f  Dockerfile_heroku_api_demo -t registry.heroku.com/signalk-course-resources-api/web . && \
# docker push registry.heroku.com/signalk-course-resources-api/web && \
# heroku container:release web -a signalk-course-resources-api
FROM signalk/signalk-server:resources_course_api

USER root

WORKDIR /home/node/signalk
COPY startup_heroku_demo.sh startup.sh
RUN chmod +x startup.sh

COPY resources /home/node/.signalk/resources
COPY resources-provider.json /home/node/.signalk/plugin-config-data/
COPY course-data.json /home/node/.signalk/plugin-config-data/
COPY serverState /home/node/.signalk/serverState
RUN chown -R node /home/node/.signalk

USER node
