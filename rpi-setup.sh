#!/bin/bash

echo "ARE YOU SURE YOU WANT TO DELETE ANY CONFIGURATION"
echo "EXISTING AND SET UP A NEW STARTUP SERVICE?"
echo ""
echo "IF NOT, PRESS <CTRL+C> TO ABORT"
echo ""

systemd="/etc/systemd/system/signalk.service"
dir=$(pwd)


echo -n "Enter your vessel name and press [enter]:"
read vesselName

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
echo "This uses stored NMEA data to set up the server,"
echo "but settings can be changed by going to <ipaddress>:3000,"
echo "selecting \"Server Plugins Configuration\""
echo "and \"Vessel Setup\""

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

sudo systemctl daemon-reload
sudo systemctl enable signalk.service
sudo systemctl start signalk.service
