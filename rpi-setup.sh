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

sudo touch $vesselBash
sudo echo "#!/bin/sh" > $vesselBash
sudo echo "" >> $vesselBash
sudo echo "DIR=\`dirname \$0\`" >> $vesselBash
sudo echo "\${DIR}/signalk-server -s /settings/$vesselName.json \$*" >> $vesselBash
sudo chmod 775 $vesselBash

sudo touch $vesselJson
sudo echo "{" > $vesselJson
sudo echo "  \"vessel\": {" >> $vesselJson
sudo echo "    \"name\": \"$vesselName\"," >> $vesselJson
sudo echo "    \"uuid\"	: \"urn:mrn:signalk:uuid:$UUID\"" >> $vesselJson
sudo echo "  }," >> $vesselJson
sudo echo "" >> $vesselJson
sudo echo "  \"interfaces\": {}," >> $vesselJson
sudo echo "" >> $vesselJson
sudo echo "  \"pipedProviders\": [{" >> $vesselJson
sudo echo "    \"id\": \"nmeaFromFile\"," >> $vesselJson
sudo echo "    \"pipeElements\": [" >> $vesselJson
sudo echo "       { " >> $vesselJson
sudo echo "         \"type\": \"providers/filestream\"," >> $vesselJson
sudo echo "         \"options\": {" >> $vesselJson
sudo echo "           \"filename\": \"samples/plaka.log\"" >> $vesselJson
sudo echo "         }," >> $vesselJson
sudo echo "         \"optionMappings\": [" >> $vesselJson
sudo echo "           {" >> $vesselJson
sudo echo "             \"fromAppProperty\": \"argv.nmeafilename\"," >> $vesselJson
sudo echo "             \"toOption\": \"filename\"" >> $vesselJson
sudo echo "           }" >> $vesselJson
sudo echo "         ]" >> $vesselJson
sudo echo "       }," >> $vesselJson
sudo echo "       { " >> $vesselJson
sudo echo "         \"type\": \"providers/throttle\"," >> $vesselJson
sudo echo "         \"options\": {" >> $vesselJson
sudo echo "            \"rate\": 500" >> $vesselJson
sudo echo "         }" >> $vesselJson
sudo echo "       }," >> $vesselJson
sudo echo "       {" >> $vesselJson
sudo echo "         \"type\": \"providers/liner\"" >> $vesselJson
sudo echo "       }," >> $vesselJson
sudo echo "       {" >> $vesselJson
sudo echo "          \"type\": \"providers/nmea0183-signalk\"," >> $vesselJson
sudo echo "          \"optionMappings\": [" >> $vesselJson
sudo echo "            {" >> $vesselJson
sudo echo "             \"fromAppProperty\": \"selfId\"," >> $vesselJson
sudo echo "             \"toOption\": \"selfId\"" >> $vesselJson
sudo echo "            }," >> $vesselJson
sudo echo "            {" >> $vesselJson
sudo echo "             \"fromAppProperty\": \"selfType\"," >> $vesselJson
sudo echo "             \"toOption\": \"selfType\"" >> $vesselJson
sudo echo "            }" >> $vesselJson
sudo echo "          ]" >> $vesselJson
sudo echo "       }" >> $vesselJson
sudo echo "    ]" >> $vesselJson
sudo echo "  }]" >> $vesselJson
sudo echo "}" >> $vesselJson


sudo touch $systemd
sudo echo "[Service]" > $systemd
sudo echo "ExecStart=$vesselBash" >>$systemd
sudo echo "Restart=always" >> $systemd
sudo echo "StandardOutput=syslog" >> $systemd
sudo echo "StandardError=syslog" >> $systemd
sudo echo "WorkingDirectory=$dir" >> $systemd
sudo echo "[Install]" >> $systemd
sudo echo "WantedBy=multi-user.target" >> $systemd

sudo chmod 777 $systemd

sudo systemctl daemon-reload
sudo systemctl enable signalk.service
sudo systemctl start signalk.service
