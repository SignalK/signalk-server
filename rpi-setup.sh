#!/bin/bash

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

UUIDFile="$dir/UUID"
if [ -f $UUIDFile ]
then
  UUID=$( cat $UUIDFile)
  echo "UUID=$UUID"
else
  UUID=$( cat /proc/sys/kernel/random/uuid)
  sudo touch $UUIDFile
  sudo echo $UUID > $UUIDFile
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

cat > $systemd <<systemdfile
[Service]
ExecStart=$vesselBash
Restart=always
StandardOutput=syslog
StandardError=syslog
WorkingDirectory=$dir
[Install]
WantedBy=multi-user.target
systemdfile

sudo chmod 755 $systemd

cat > $socket <<socket
[Socket]
ListenStream=$port

[Install]
WantedBy=sockets.target
socket

sudo chmod 755 $socket

sed -i -e "s/env.PORT || [0-9]\+;/env.PORT || $port;/g" $dir/lib/config/config.js

echo "A reboot is recommended"

sudo systemctl daemon-reload
sudo systemctl enable signalk.service
sudo systemctl enable signalk.socket
