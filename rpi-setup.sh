#!/bin/bash

if [[ $EUID > 0 ]]
  then echo "Please run as root if you want this server configuration to run at every startup, type:"
  echo "\"sudo bash rpi-setup.sh\""
  echo ""
fi

echo "YOU ARE LOGGED IN AS $SUDO_USER AND THE SERVER WILL BE STARTED AS THIS USER"
echo "ARE YOU SURE YOU WANT TO DELETE ANY CONFIGURATION"
echo "EXISTING AND SET UP A NEW STARTUP SERVICE?"
echo ""
echo "IF NOT, PRESS <CTRL+C> TO ABORT"
echo ""

systemd="/etc/systemd/system/signalk.service"
dir=$(pwd)
socket="/etc/systemd/system/signalk.socket"


echo -n "Enter your vessel name and press [enter]:"
read vesselName
vesselName=${vesselName// /_}
echo ""
echo "Signal K default port is 3000 as per documentation"
echo "port 80 does not require \":3000\" in browser and app interfaces"
read -p "Do you want Signal K to change to port 80? [Y/n]" ans;
case $ans in
  n|N)
    port=3000;;
  y|Y|*)
    port=80;;
esac 

echo "port $port selected" 

read -p "Do you want to enable SSL? [Y/n]" ans;
case $ans in
  n|N)
    ssl="false";;
  y|Y|*)
    ssl="true";;
esac 

if [ $ssl == "true" ]; then
  if [ $port == 80 ]; then
    primaryPort=443
    secondaryPort=80
  else
    primaryPort=3443
    secondaryPort=3000
  fi
else
  primaryPort=$port
fi

UUIDFile="$dir/UUID"
if [ -f $UUIDFile ]
then
  UUID=$( cat $UUIDFile)
  echo "UUID=$UUID"
else
  UUID=$( cat /proc/sys/kernel/random/uuid)
  echo $UUID > $UUIDFile
  echo "UUID generated: $UUID"
fi


vesselBash="$dir/bin/$vesselName"
vesselJson="$dir/settings/$vesselName.json"

echo "A file will be created with your settings in"
echo "$vesselJson."
echo "This uses stored NMEA data to set up the server."
echo "See configuration examples in same folder."


cat > $vesselBash <<bashScript
#!/bin/sh

DIR=\`dirname \$0\`
\${DIR}/signalk-server -s /settings/$vesselName.json \$*
bashScript

sudo chmod 755 $vesselBash

cat > $vesselJson <<jsonfile
{
  "vessel": {
    "name": "$vesselName",
    "uuid"	: "urn:mrn:signalk:uuid:$UUID"
  },

  "interfaces": {},

  "ssl": $ssl,

  "pipedProviders": [{
    "id": "nmeaFromFile",
    "pipeElements": [
       { 
         "type": "providers/filestream",
         "options": {
           "filename": "samples/plaka.log"
         },
         "optionMappings": [
           {
             "fromAppProperty": "argv.nmeafilename",
             "toOption": "filename"
           }
         ]
       },
       { 
         "type": "providers/throttle",
         "options": {
            "rate": 500
         }
       },
       {
         "type": "providers/liner"
       },
       {
          "type": "providers/nmea0183-signalk",
          "optionMappings": [
            {
             "fromAppProperty": "selfId",
             "toOption": "selfId"
            },
            {
             "fromAppProperty": "selfType",
             "toOption": "selfType"
            }
          ]
       }
    ]
  }]
}
jsonfile

group_full=$(getent group $SUDO_GID)
group="$( cut -d ':' -f 1 <<< "$group_full" )"
sudo chmod 644 $vesselJson
sudo chown $SUDO_USER $vesselJson
sudo chgrp $group $vesselJson 


cat > $systemd <<systemdfile
[Service]
ExecStart=$vesselBash
Restart=always
StandardOutput=syslog
StandardError=syslog
WorkingDirectory=$dir
User=$SUDO_USER
Environment=EXTERNALPORT=$primaryPort
[Install]
WantedBy=multi-user.target
systemdfile

sudo chmod 755 $systemd

if [ $secondaryPort != "" ]; then
  secondListen="ListenStream=$secondaryPort"
fi

cat > $socket <<socket
[Socket]
ListenStream=$primaryPort
$secondListen

[Install]
WantedBy=sockets.target
socket

sudo chmod 755 $socket

echo "A reboot is recommended"

sudo systemctl daemon-reload
sudo systemctl enable signalk.service
sudo systemctl enable signalk.socket
