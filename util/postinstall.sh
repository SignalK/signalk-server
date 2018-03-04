#!/bin/bash
# Signalk postInstall script. Based on node-deb template
set -e
set -o pipefail

declare -r init_type='{{ node_deb_init }}'
declare -ri no_rebuild='{{ node_deb_no_rebuild }}'
declare -r install_strategy='{{ install_strategy }}'

add_user() {
  : "${1:?'User was not defined'}"
  declare -r user="$1"
  declare -r uid="$2"

  if [ -z "$uid" ]; then
    declare -r uid_flags=""
  else
    declare -r uid_flags="--uid $uid"
  fi

  declare -r group="${3:-$user}"
  declare -r descr="${4:-No description}"
  declare -r shell="${5:-/bin/false}"

  if ! getent passwd | grep -q "^$user:"; then
    echo "Creating system user: $user in $group with $descr and shell $shell"
    useradd $uid_flags --gid $group --system --shell $shell -c "$descr" -m $user
  fi
}

add_group() {
  : "${1:?'Group was not defined'}"
  declare -r group="$1"
  declare -r gid="$2"

  if [ -z "$gid" ]; then
    declare -r gid_flags=""
  else
    declare -r gid_flags="--gid $gid"
  fi

  if ! getent group | grep -q "^$group:" ; then
    echo "Creating system group: $group"
    groupadd $gid_flags --system $group
  fi
}

start_service () {
  : "${1:?'Service name was not defined'}"
  declare -r service_name="$1"

  if hash systemctl 2> /dev/null; then
    if [[ "$init_type" == 'auto' || "$init_type" == 'systemd' ]]; then
      {
        systemctl enable "$service_name.service" && \
        systemctl start "$service_name.service"
      } || echo "$service_name could not be registered or started"
    fi
  elif hash service 2> /dev/null; then
    if [[ "$init_type" == 'auto' || "$init_type" == 'upstart' || "$init_type" == 'sysv' ]]; then
      service "$service_name" start || echo "$service_name could not be registered or started"
    fi
  elif hash start 2> /dev/null; then
    if [[ "$init_type" == 'auto' || "$init_type" == 'upstart' ]]; then
      start "$service_name" || echo "$service_name could not be registered or started"
    fi
  elif hash update-rc.d 2> /dev/null; then
    if [[ "$init_type" == 'auto' || "$init_type" == 'sysv' ]]; then
      {
        update-rc.d "$service_name" defaults && \
        "/etc/init.d/$service_name" start
      } || echo "$service_name could not be registered or started"
    fi
  else
    echo 'Your system does not appear to use systemd, Upstart, or System V, so the service could not be started'
  fi
}

dependency_install() {
  : "${1:?'Package name was not defined'}"
  cd "/usr/share/$1/app"

  case $install_strategy in
    auto)
      if hash npm 2> /dev/null; then
        if [ ! -d './node_modules' ]; then
          echo "Directory 'node_modules' did not exist. Running 'npm install'"
          npm install --production
        else
          if [ "$no_rebuild" -eq 0 ]; then
	    echo "Installint node-pre-gyp in order to compile node libraries"
	    npm install -g node-pre-gyp
            echo "Directory 'node_modules' exists. Running 'npm rebuild'"
            npm rebuild --production --unsafe-perm
          fi
        fi
      else
        echo "WARN: 'npm' was not on the path. Dependencies may be missing."
      fi
      ;;
    copy)
      # pass
      ;;
    npm-install)
      echo 'Installing dependenencies from NPM'
      npm install --production
      ;;
    *)
      echo "WARN: Unexpected install strategy: $install_strategy"
      echo 'WARN: Dependencies may be missing.'
      ;;
  esac
}

dependency_install '{{ node_deb_package_name }}'

if [[ "$init_type" != 'none' ]]; then
  add_group '{{ node_deb_group }}' ''
  add_user '{{ node_deb_user }}' '' '{{ node_deb_group }}' '{{ node_deb_user }} user-daemon' '/bin/false'

  mkdir -p '/var/log/signalk-server'
  chown -R '{{ node_deb_user }}:{{ node_deb_group }}' '/var/log/signalk-server'

  mkdir -p '/etc/signalk-server'

  chown -R '{{ node_deb_user }}:{{ node_deb_group }}' '/etc/signalk-server'


  start_service '{{ node_deb_package_name }}'
fi