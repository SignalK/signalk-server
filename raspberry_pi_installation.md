# Getting Started

If you are updating the Signal K server, especially moving from a version <= 1.40.0, [please check here.](https://github.com/SignalK/signalk-server/blob/master/raspberry_pi_installation.md#update-signal-k-node-server)

Instructions to install the operating system, Raspberry Pi OS, [is found here.](https://www.raspberrypi.org/documentation/computers/getting-started.html#setting-up-your-raspberry-pi).

If you are familiar with a "headless install" using Raspberry Pi OS Lite it's also possible since the GUI for Signal K is browser based.

After everything has been configured, using the GUI install, you should be presented with the RPi Desktop up and running, just waiting for you to install Signal K.

# Installing Signal K

The RPi installation of Signal K can be broken down in to three distinct steps;

1. Install the tools and libraries required to run the Signal K server (the dependencies)
1. Install a Signal K Server to process the Signal K data; we will install the Node-Server
1. Install the Web Apps (consumers) that can read Signal K data

## Step 1 - Install the Dependencies

Raspbian, the Linux distribution for RPi, is based on Debian, which has a powerful installation tool called "apt", which we will use to install some of the dependencies and tools required. Before you use "apt" it is always recommended to update its index of repositories (websites that store Linux software). To do that use the following command in a terminal session...

    $ sudo apt update

Now, install node and npm

    $ curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    $ sudo apt-get install -y nodejs

We want to make sure that we're using the latest version of npm:

    $ sudo npm install -g npm@latest
    
Use the following command to check the install

    node -v && npm -v

which will report, something like, `v18.15.0, 9.5.0` which are the versions of "node" and "npm"

Finally we need to install a Bonjour (mDNS) service for Linux called Avahi, which allows Apps and other network devices to Discover the Signal K server. To do this we will use "apt" again ...

     $ sudo apt install libnss-mdns avahi-utils libavahi-compat-libdnssd-dev


## Step 2 - Install Signal K Server

A Signal K Server is the central hub of a Signal K system; reading and converting the boat's NMEA data (or Signal K data from a gateway), which it then stores and logs, before outputting the Signal K data to web apps (consumers) on the boat or sending it off the boat to other vessels or Cloud services.

Install the Node Server using npm

    $ sudo npm install -g signalk-server
    
### Step 2.1 OPTIONAL test the server with sample data

Now you can start the server. Type...

    $ signalk-server --sample-nmea0183-data

You should see the terminal output "signalk-server running at 0.0.0.0:3000" as shown below...

    $ signalk-server --sample-nmea0183-data
    Using sample data from /usr/lib/node_modules/signalk-server/samples/plaka.log
    signalk-server running at 0.0.0.0:3000
    
As the file name suggests, the Signal K Node Server is now reading NMEA Data from a Demo File and is ready to pass that data to any device that wants it. To get your first taste of what Signal K data looks like, open the Web browser on your RPi and type this URL in to the address bar "http://127.0.0.1:3000/signalk". This directs the browser to the Signal K server on the RPi (127.0.0.1 is your local Loopback address) and you should see the following info on the screen...

    {"endpoints":{"v1":{"version":"1.alpha1","signalk-http":"http://127.0.0.1:3000/signalk/v1/api/","signalk-ws":"ws://127.0.0.1:3000/signalk/v1/stream","signalk-tcp":"tcp://127.0.0.1:3858"}},"server":{"id":"signalk-server-node","version":"1.0.0-3"}}

So that is Signal K....looks good doesn't it ? Actually this is just some JSON data that tells an App what the URL "endpoints" are so that it knows what Version of Signal K the server supports and where it can get HTTP or Websocket data from.

If you want to see the the actual output from the NMEA data that SignalK is processing type "http://127.0.0.1:3000/signalk/v1/api/vessels/self/" in the adress bar and this info will be shown

    {"name":"Plaka","mmsi":"123456789","navigation":{"speedThroughWater":{"meta":{"units":"m/s","description":"Vessel speed through the water"},"value":3.096956340117828,"$source":"NMEA0183 Plaka.log.II","timestamp":"2018-02-06T16:04:32.100Z","sentence":"VHW"},"courseOverGroundMagnetic":{"meta":{"units":"rad","description":"Course over ground (magnetic)"},"value":3.6030577086397786,"$source":"NMEA0183 Plaka.log.II","timestamp":"2018-02-06T16:04:32.100Z","sentence":"VTG"},"courseOverGroundTrue":{"meta":{"units":"rad","description":"Course over ground (true)"},"value":3.6030577086397786,"$source":"NMEA0183 Plaka.log.II","timestamp":"2018-02-06T16:04:32.100Z","sentence":"VTG"},"speedOverGround":{"meta":{"units":"m/s","description":"Vessel speed over ground. If converting from AIS 'HIGH' value, set to 102.2 (Ais max value) and add warning in notifications"},"value":2.9323340761912995,"$source":"NMEA0183 Plaka.log.II","timestamp":"2018-02-06T16:04:32.100Z","sentence":"VTG"},"position":{"meta":{"description":"The position of the vessel in 2 or 3 dimensions (WGS84 datum)"},"value":{"longitude":23.529716666666666,"latitude":60.076566666666665},"$source":"NMEA0183 Plaka.log.GP","timestamp":"2018-02-06T10:01:47.000Z","sentence":"GLL"}},"performance":{"velocityMadeGood":{"meta":{"units":"m/s","description":"The current velocity made good derived from the speed through water and appearant wind angle. A positive value is heading to upwind, negative to downwind."},"value":2.9220451846958913,"$source":"NMEA0183 Plaka.log.II","timestamp":"2018-02-06T16:04:32.100Z","sentence":"VPW"}},"environment":{"wind":{"speedApparent":{"meta":{"units":"m/s","description":"Apparent wind speed"},"value":7.7989797535193155,"$source":"NMEA0183 Plaka.log.II","timestamp":"2018-02-06T16:04:31.701Z","sentence":"MWV"},"angleApparent":{"meta":{"units":"rad","description":"Apparent wind angle, negative to port"},"value":-0.19198621776321237,"$source":"NMEA0183 Plaka.log.II","timestamp":"2018-02-06T16:04:31.701Z","sentence":"MWV"},"speedTrue":{"meta":{"units":"m/s","description":"Wind speed over water (as calculated from speedApparent and vessel's speed through water)"},"value":4.789478991112456,"$source":"NMEA0183 Plaka.log.II","timestamp":"2018-02-06T16:04:32.199Z","sentence":"MWV"},"angleTrueWater":{"meta":{"units":"rad","description":"True wind angle based on speed through water, negative to port"},"value":-0.349065850478568,"$source":"NMEA0183 Plaka.log.II","timestamp":"2018-02-06T16:04:32.199Z","sentence":"MWV"}},"depth":{"belowTransducer":{"meta":{"units":"m","description":"Depth below Transducer"},"value":13.29,"$source":"NMEA0183 Plaka.log.II","timestamp":"2018-02-06T16:04:32.300Z","sentence":"DBT"}},"current":{"meta":{"description":"Direction and strength of current affecting the vessel"},"value":{"setTrue":0,"setMagnetic":0,"drift":0},"$source":"NMEA0183 Plaka.log.II","timestamp":"2018-02-06T16:04:32.000Z","sentence":"VDR"}}}

Some open source web apps are automatically installed. They have been developed by the Signal K team to show what can be done with Signal K data.
To use the web apps, we will need to open them in a web browser so open the browser on your Pi and type "http://127.0.0.1:3000/
This will open the Dashboard and give You some info about the SignalK server.

![SK_sample_file](https://user-images.githubusercontent.com/16189982/90823208-e00de400-e335-11ea-9a7d-2758a0847c8a.png)

Click on Webapps and you will get

![web_apps](https://user-images.githubusercontent.com/16189982/69761715-7840b900-1168-11ea-9052-eba7dfc2804c.png)

Click on "@Signalk/Freeboard-Sk" and you will get a Worldmap with your position in the south of Finland

Go back and click "@Signalk/Instrumentpanel" and you will have an instrumentpanel to play around with.

An excelent way to be familiar with the Signal K data format is to click on "Data Browser" and then select "self" in the drop down list at the upper left. Something like this will appear

![SK_data_brws](https://user-images.githubusercontent.com/16189982/90823230-e56b2e80-e335-11ea-8a0d-44044ea75ff6.png)

The differense from what you see on your monitor and what is displayed in the picture is that a filter is applied in the "Search" field. This will just show paths including the "nav" word.

Since you have managed to get to this part of the guide, you now have a good understanding of what Signal K is all about and in particular the Node Server. We have been using the server's demo NMEA file, but Node Server can also read NMEA0183 data via an [NMEA to USB adaptor cable](http://digitalyachtamerica.com/product/usb-nmea-adaptor/), a [3rd party NMEA2000 gateway](https://github.com/SignalK/signalk-server/wiki/FAQ:-Frequently-Asked-Questions#how-do-i-integrate-with-nmea2000-can-bus) or both NMEA0183 and NMEA2000 via the [iKommunicate gateway](http://ikommunicate.com).

## Step 3 - your own setup and running automatically as daemon

To generate your own vessel settings file and configure your Pi to start the server automatically , type...

    $ sudo signalk-server-setup

and follow the prompts. If you are following the defaults and are logged on as ”pi” the boat info will be stored in `/home/pi/.signalk/defaults.json` and the settings in `/home/pi/.signalk/settings.json`

You can re-run this command at any time in the future to change the settings.

These files can be edited via the admin UI or directly looking at the example settings.

**This script will also set up Node server to run automatically in the background as a daemon, [systemd](https://wiki.debian.org/systemd/), when the system boots.** You will no longer be able to launch it manually, because the automatically started instance will occupy the ports where the services are available. You should do this once you are happy with the way the server works.

Stop the daemon temporarily with;

    $ sudo systemctl stop signalk.service
    $ sudo systemctl stop signalk.socket

Start the deamon with;

    $ sudo systemctl start signalk.socket
    $ sudo systemctl start signalk.service

Disable the automatic start with;

    $ sudo systemctl disable signalk.service
    $ sudo systemctl disable signalk.socket

Check status with;

    $ sudo systemctl status signalk.service
    $ sudo systemctl status signalk.socket

**In addition the setup script will enable security by default.** At the admin UI you have to use ”Login” in the upper right corner and create a account, for example user pi and password, and then logon. Security information is stored in `/home/pi/.signalk/security.json`

![enable_security](https://user-images.githubusercontent.com/16189982/43796658-279e7c40-9a85-11e8-98d4-a90f1e9904d1.jpeg)

## Real inputs

Real inputs are configured in ”Server => Connections” where you can choose from the following

Input Type | Remark
--------- | ---------------------------------------------------------------
NMEA 2000 | Check possible hardware in the ”NMEA 2000 Source” drop down list
NMEA 0183 | Check possible sources in the ”NMEA 0183 Source” drop down list
SignalK | Check possible sources in the ”NMEA 0183 Source” drop down list
SeaTalk(GPIO) | SeaTalk 1 data via a Raspberry GPIO pin, [documentation here](https://github.com/SignalK/signalk-server-node/blob/seatalk/Seatalk(GPIO).md)
Filestream |Check possible data types in the ”Data Type” drop down list

**NMEA2000**

If you have a NMEA2000 network you can use the the Actisense interface or other CAN bus interfaces to connect to the SignalK server. To configure it you have to know the the device path. One way to check it, is using the `dmesg` command direct after you plugged in the Actisense to a RPi USB port. In a Terminal window type

    $ dmesg

or to minimize the output

    $ dmesg | grep -i 'usb'

and it will show something like

    (   2.141273) usb 1-1.3: new full-speed USB device number 4 using dwc_otg
    (   2.317223) usb 1-1.3: New USB device found, idVendor=0403, idProduct=d9aa
    (   2.319959) usb 1-1.3: New USB device strings: Mfr=1, Product=2, SerialNumber=3
    (   2.322745) usb 1-1.3: Product: NGT-1-A
    (   2.325417) usb 1-1.3: Manufacturer: Actisense
    (   2.328022) usb 1-1.3: SerialNumber: XXXX
    (   3.817103) usbcore: registered new interface driver usbserial
    (   3.817189) usbcore: registered new interface driver usbserial_generic
    (   3.820223) usbserial: USB Serial support registered for generic
    (   3.822093) usbcore: registered new interface driver brcmfmac
    (   3.832816) usbcore: registered new interface driver ftdi_sio
    (   3.832909) usbserial: USB Serial support registered for FTDI USB Serial Device
    (   3.833448) ftdi_sio 1-1.3:1.0: FTDI USB Serial Device converter detected
    (   3.833649) usb 1-1.3: Detected FT232RL
    (   3.837121) usb 1-1.3: FTDI USB Serial Device converter now attached to ttyUSB0

as seen on the last row the interface is attached to `ttyUSB0` so the device path will be `/dev/ttyUSB0`

To set it up as input for the SignalK server go to the admin UI and ”Server => Connections”.
Add a provider with settings according to the picture and click on ”Apply”

![SK_N2](https://user-images.githubusercontent.com/16189982/69761979-3d8b5080-1169-11ea-83a2-b688fd1178b3.png)

The SignalK server **must be restarted** to accept the changes so click on "Restart" in the upper right corner.

After the restart check the data with the Webapp Instrumentpanel in the admin UI.

**NMEA0183**

If you have a NMEA0183 network, plug in your NMEA0183 to USB interface and do the same procedure as for the Actisense above.
With a configuration maybe looking like this

![SK_N1](https://user-images.githubusercontent.com/16189982/69761986-44b25e80-1169-11ea-9401-2c06ace9eb3b.png)

## Sample files

If you don’t have any NMEA interface hardware you could set up a "File Stream" connection with the sample files instead.

Find the path to NMEA2000 file

    sudo find / -name "aava-n2k.data"

Or the path to NMEA0183 file 

    sudo find / -name "plaka.log"

## NMEA0183 data on the network

Many navigation or marine data applications, for example iNavX, iSailor and SeaPilot, only accepts NMEA 0183 data as input. The SignalK server's default output for NMEA0183 data is port 10110 using the TCP protocol. Any NMEA0183 input to the SignalK server is forwarded to this output. If you are using a none NMEA 0183 input, could be NMEA 2000, you have to use a plugin that converts the data to NMEA 0183.

Attach the SignalK server to a network with WiFi access, or set up the RPi as an bridged access point(link below).

If you are using a none NMEA 0183 input set up the plugin otherwise go to "Tablet application setup"
(Please note that if you have NMEA 2000 AIS data you have to use another plugin, "signalk-n2kais-to-nmea0183" to get NMEA 0183 output.)

**Plugin setup**

In the admin UI ”Appstore => Installed” you will find the plugin

![appstore_installed](https://user-images.githubusercontent.com/16189982/51399380-18d84c80-1b46-11e9-99f6-04bf86eaf769.png)

(Handling updates, indicated by the red numbers at the ”Update” rows, is discussed below.)

To activate and configure the plugin go to ”Server => Plugin Config”. Select "Convert SignalK......”. Then select "Active” and  the sentences you need for your application, click ”Submit” and restart SignalK.

**Tablet application setup**

In Your tablet application, set it up to receive the NMEA0183 data from the SignalK server with the IP adress, protocol TCP, and port 10110. The picture is from iSailor

![isailor_connection_s](https://user-images.githubusercontent.com/16189982/36220383-a327ab2e-11ba-11e8-85e9-f62b6c0e71ff.png)

## SignalK data on the network

Here you have [applications](https://signalk.org/applications_solutions.html) that will accept the json data direct from SignalK.

## Apps

As noticed, some apps are installed together with the server and others, not installed, can be downloaded in the ”Appstore => Available”. The app configuration is done in ”Server => Plugin Config”

Additional information and how to uninstall apps is found [here](https://github.com/SignalK/signalk-server-node/blob/master/SERVERPLUGINS.md)

## Additional software

[Raspberry as an bridged access point](https://www.raspberrypi.org/documentation/computers/configuration.html#setting-up-a-bridged-wireless-access-point)

[Backup to a bootable SD card](https://pysselilivet.blogspot.com/2017/11/rpi-clone-raspberry-boot-disk.html)

[Simple AIS receiver setup](https://pysselilivet.blogspot.com/2020/05/ais-reciever-for-raspberry-pi-2-channel.html)

[Temperature measure using 1-wire sensor, Node Red and plugins](https://pysselilivet.blogspot.com/2018/07/signalk-measuring-temperature.html)

## FAQ

FAQ is found [here](https://github.com/SignalK/signalk-server-node/wiki/FAQ:-Frequently-Asked-Questions)

# Updating your Raspberry Pi and Signal K Node Server

Much as we would all like to be sailing 365 days a year, the reality is that we are down on our boats as and when we can and weeks and months can go by between using your Raspberry Pi and Signal K Node Server. Of course when you get back to the boat everything will continue to operate as it did when you left it, but Signal K (and the Raspberry Pi) are constantly evolving and if you wish to update to the latest builds, then you need to follow this process.

Please bear in mind that the longer between updates the more data that will have to be downloaded and the longer the process will take. We would seriously recommend taking your Raspberry Pi home and updating it on a network with good broadband speed.

The updates that need to be done can be broken down in to four key areas...

1. The Raspberry Pi Linux Distro
1. Node and NPM
1. The Signal K Node Server
1. Any Signal K Apps

## Update Raspberry Pi Linux Distro

Open the terminal window and enter the following commands...

    $ sudo apt update
    $ sudo apt dist-upgrade

If you have not updated for a while, then the above commands may take a while to finish, just be patient and make sure everything completes correctly. After the two commands have completed Reboot your Raspberry Pi.

## Update Node and NPM

Open the terminal window and enter the following commands...

    $ sudo apt upgrade nodejs
    $ sudo npm install npm@latest -g

This will update Nodejs and NPM to the version required by the server.

## Update Signal K Node Server

As seen in the picture above there was an update available at ”Server => Update”
Click on that row and You will open next window

![server_update](https://user-images.githubusercontent.com/16189982/51401114-4c1cda80-1b4a-11e9-8f1e-d12a9db542af.png)

Click on update and the installation will start

**Please note !**

Starting with Signal K server version 2.0.0 the recommended Node.js version is 18. [18 is the active LTS](https://nodejs.org/en/about/releases/) (Long Term Support) version in 2023.
So if you are updating from a Signal K version <= V 1.40.0 [check out the Wiki](https://github.com/SignalK/signalk-server/wiki/Updating-to-Node.js-18) on how to. 

![server_during_update](https://user-images.githubusercontent.com/16189982/51401178-71a9e400-1b4a-11e9-86b9-1148442ba59c.png)

After the installation restart the server.

## Any Signal K Apps

The apps are updated via the Admin UI ”Appstore => Updates” clicking on the ”download cloud” . After installation do a server restart.


Now your Signal K Node Server is updated.
