#!/bin/bash

echo "Building Documentation..."
USER_INFO=$(id -u):$(id -g) docker compose run mdbook build
echo "Done."


