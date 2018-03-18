cat >docker-manifest.yml <<EOF
image: 'signalk/signalk-server:$BRANCH'
manifests:
  -
    image: 'signalk/signalk-server:linux-amd64-$BRANCH'
    platform:
      architecture: amd64
      os: linux
  -
    image: 'signalk/signalk-server:linux-arm32v7-$BRANCH'
    platform:
      architecture: arm
      variant: v7
      os: linux