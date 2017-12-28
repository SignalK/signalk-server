# Getting Started

To coincide With the release of the Raspberry Pi 3, we thought it would be good to create a "How to" Guide for installing Signal K on a Raspberry Pi (RPi). This is being written whilst installing on a new RPi 3, but it should be applicable for earlier models.

So you have your RPi and are "chomping at the bit" to start using it. Well before we start make sure you have the following items...

1. A network to connect the RPi to (via Wi-Fi or wire)
1. An HDMI monitor or TV
1. A USB mouse
1. A USB keyboard
1. An 8GB or larger micro SD Card
1. A Windows PC or Mac that can read micro SD Cards via a card reader or SD slot+adaptor

First you need to install a LINUX operating system on to the micro SD Card but before you do that format the card using the SD Card foundations Formatting tool, which you can download from here...

https://www.sdcard.org/downloads/formatter_4/

There is a version for Windows or Mac OSX and after downloading the tool of choice, extract and run the Setup program. Once installed, run the program with the micro SD plugged in to a card reader or SD card slot on the computer. It is good practice to give the card a volume name such as "Signal_K" which will remind you what is on the card at a later date as one LINUX distribution card looks much the same as another.

If you intend to use the Raspberry Pi for other things, not just Signal K, I would strongly recommend preparing one SD Card for the Signal K installation and have another SD Card with a normal Raspberry Pi installation and then you can keep things separate and clean.

![SD Card Formatter](https://github.com/digitalyacht/ikommunicate/blob/master/RPi_How_To_Images/SD.Formatter.png)

Once your SD Card is properly formatted, we need to copy a LINUX Operating System on to it. To make things easy the nice people at RaspberryPi.org have created a "NOOBs" distribution which can be downloaded from here....

[https://www.raspberrypi.org/downloads/noobs/](https://www.raspberrypi.org/downloads/noobs/)

Select the NOOBs option on the left hand side (not the NOOBs Lite) and click on the "Download Zip" button. It is quite a large file approximately 1GB, so make sure you have a fast internet connection i.e. don't leave it till you get down on the boat !

Once downloaded open the ZIP file and extract all files/folders to your blank and freshly formatted micro SD Card. Once the copy operation is complete, insert the micro SD Card in to the RPi with the unit powered down. With all of the cables and peripherals plugged in, power up your Raspberry Pi and follow the instructions that appear on the screen. With the latest "Jessie" release the amount of options you need to select are significantly reduced and the whole operation should only take 10-15mins.

After everything has been configured you should be presented with the RPi Desktop and your LINUX operating system is installed and running, just waiting for you to install Signal K.

![Raspberry Pi Desktop](https://github.com/digitalyacht/ikommunicate/blob/master/RPi_How_To_Images/RPi_Desktop.png)

# Installing Signal K

The RPi installation of Signal K can be broken down in to three distinct steps;

1. Install the tools and libraries required to run the Signal K server (the dependencies)
1. Install a Signal K Server to process the Signal K data; we will install the Node-Server
1. Install the Web Apps (consumers) that can read Signal K data

## Step 1 - Install the Dependencies

Raspbian the LINUX distribution for RPi is based on Debian which has a powerful installation tool called "apt-get", which we will use to install some of the dependencies and tools required. Before you use "apt-get" it is always recommended to update its index of repositories (websites that store LINUX software) and to do that use the following command...

    $ sudo apt-get update

Now we will download three tools; curl, git and build-essential. These tools will allow us to download more software, clone the Signal K server and allow it to run, Install the three tools using the following command...

    $ sudo apt-get install -y curl git build-essential

Node server requires Node version 6 or newer. For Raspberry Pi 2 and 3 follow the instructions below. If in doubt, test with

    $ uname -m

If the result returned starts with “armv6”, you are running a Raspberry Pi based on the older ARMv6 chipset and these instructions will not work.

Add NodeSource repository to the system so that we can install Node with `apt-get`:

    $ curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
    $ sudo apt install nodejs


Finally we need to install a Bonjour (mDNS) service for LINUX called Avahi, which allows Apps and other network devices to Discover the Signal K server. To do this we will use "apt-get" again ...

    $ sudo apt-get install libnss-mdns avahi-utils libavahi-compat-libdnssd-dev

To check if Avahi is installed and working correctly enter the following command...

    $ avahi-browse -a

This will search for and list all of the discoverable devices/services on your network. Use ctrl+c to stop the search.

![Avahi-Browse](https://github.com/digitalyacht/ikommunicate/blob/master/RPi_How_To_Images/Avahi-Browse.png)

Another software that really makes Your handling with the RPI easier is Samba. This software makes Your RPI appear, in MS Explorer or Mac Finder, as a Windows fileserver so You can direct edit and move files from/to the RPI

    $ sudo apt-get install samba samba-common-bin

Edit the Samba configuration file so that You have more than "Read Only" rights.

    $ sudo nano /etc/samba/smb.conf

And then find the following part 

    #======================= Share Definitions =======================   
                                                                     
    [homes]                                                              
      comment = Home Directories                                        
      browseable = no                                                   
                                                                     
    # By default, the home directories are exported read-only. Change the
    # next parameter to 'no' if you want to be able to write to them.    
      read only = yes                                                   

so shange to 

    read only = no

and then save the file
Create a Samba user, maybe pi ? and a password

    $ sudo smbpasswd -a pi
    New SMB password:
    Retype new SMB password:
    Added user pi.

Restart the Samba service

    $ sudo /etc/init.d/samba restart 
    [ ok ] Restarting nmbd (via systemctl): nmbd.service.
    [ ok ] Restarting smbd (via systemctl): smbd.service.
    [ ok ] Restarting samba-ad-dc (via systemctl): samba-ad-dc.service.

and now You should be up and running and the Pi folder should be shared if You logon with user Pi.

## Step 2 - Install Signal K Node Server and Consumers

In this "How To" guide we are going to use the Signal K Node Server, but we also have a [guide for the Java Server](https://github.com/SignalK/specification/wiki/Raspberry-Pi-Installation-(Java-Server)) which is the other popular Signal K server.

A Signal K Server is the central hub of a Signal K system; reading and converting the boat's NMEA data (or Signal K data from a gateway), which it then stores and logs, before outputting the Signal K data to web apps (consumers) on the boat or sending it off the boat to other vessels or Cloud services.

To install the Node Server, we will first create a clone of all the Node Server source files that are on the GitHub repository by using the "git clone" command...

    $ git clone https://github.com/SignalK/signalk-server-node.git

This will create a folder called "signalk-server-node" in the Home directory of your RPi. We need to switch in to this folder with the "cd" command, and then install the Node Server's dependencies using npm which must be done in the cloned folder that contains the node server source files...

    $ cd signalk-server-node
    $ npm install

A "Consumer" of Signal K data is any web app, mobile device app or software program that can read and use Signal K data. It is hoped that the number of consumers will grow rapidly as more developers discover this open format and dream up new applications to make boating easier, more efficient or just more fun.

For the purposes of this "How to" 4 open source web apps are automatically installed. They have been developed by the Signal K team to show what can be done with Signal K data. 

Bonjour/mDNS discover support is not included in the Node server by default, so we need to install it manually...

    $ npm install mdns

Now all you need to do to start the Node Server running is to type...

    $ bin/nmea-from-file

Which tells the RPi to find the executable file "nmea-from-file" in the "bin" folder and run it. You should see the terminal output "signalk-server running at 0.0.0.0:3000" as shown below...

![Node Server Running](https://github.com/digitalyacht/ikommunicate/blob/master/RPi_How_To_Images/node_server_running.png)

As the file name suggests, the Signal K Node Server is now reading NMEA Data from a Demo File and is ready to pass that data to any device that wants it. To get your first taste of what Signal K data looks like, open the Epiphany Web browser on your RPi and type this URL in to the address bar "http://127.0.0.1:3000/signalk". This directs the browser to the Signal K server on the RPi (127.0.0.1 is your local Loopback address) and you should see the following screen...

![Your first view of Signal K data](https://github.com/digitalyacht/ikommunicate/blob/master/RPi_How_To_Images/SignalK_LocalAddr.png)

So that is Signal K....looks good doesn't it ? Actually this is just some JSON data that tells an App what the URL "endpoints" are so that it knows what Version of Signal K the server supports and where it can get HTTP or Websocket data from.

To use the web apps, we will need to open them in a web browser so open the Epiphany browser on your Pi and type in one of the following URLs depending upon which app you want to run...

    http://127.0.0.1:3000/instrumentpanel   
    http://127.0.0.1:3000/sailgauge   
    http://127.0.0.1:3000/maptracker   
    http://127.0.0.1:3000/simplegauges

If you have managed to get to the end of this guide, you will now have a good understanding of what Signal K is all about and in particular the Node Server. We have been using the server's demo NMEA file, but Node Server can also read NMEA0183 data via an [NMEA to USB adaptor cable](http://www.digitalyachtamerica.com/index.php/en/products/interfacing/nmeausb/product/67-usb-to-nmea-adaptor), a [3rd party NMEA2000 gateway](http://www.actisense.com/products/nmea-2000/ngt-1/ngt-1.html) or both NMEA0183 and NMEA2000 via the new [iKommunicate gateway](http://ikommunicate.com).

In the "/bin" folder of the Node Server are a series of scripts for different configurations "nmea-from-serial", "n2k-from-actisense", etc. and you just run the one that matches your installation.   


## Optional Step 3 - your own setup and running automatically as daemon

To generate your own vessel settings file, starting with the same NMEA data from the demo file, type...

    $ sudo bash rpi-setup.sh

and type your vessel name. This generates a UUID and a settings file in json format in settings/<yourVessel>.json. This can be edited directly by looking at the example settings.

**This script will also set up Node server to run automatically in the background as a daemon when the system boots.** You will no longer be able to launch it manually, because the automatically started instance will occupy the ports where the services are available. You should do this once you are happy with the way the server works.

Stop the daemon temporarily with
```
sudo systemctl stop signalk.service
sudo systemctl stop signalk.socket
```
and disable the automatic start with
```
sudo systemctl disable signalk.service
sudo systemctl disable signalk.socket
```

# Updating Your Raspberry Pi and Signal K Node Server

Much as we would all like to be sailing 365 days a year, the reality is that we are down on our boats as and when we can and weeks and months can go by between using your Raspberry Pi and Signal K Node Server. Of course when you get back to the boat everything will continue to operate as it did when you left it, but Signal K (and the Raspberry Pi) are constantly evolving and if you wish to update to the latest builds, then you need to follow this process.

Please bear in mind that the longer between updates the more data that will have to be downloaded and the longer the process will take. We would seriously recommend taking your Raspberry Pi home and updating it on a network with good broadband speed.

The updates that need to be done can be broken down in to four key areas...

1. The Raspberry Pi LINUX Distro
1. Node and NPM
1. The Signal K Node Server
1. Any Signal K Apps

## Update Raspberry Pi LINUX Distro

Open the terminal window and enter the following commands...

    $ sudo apt-get update
    $ sudo apt-get dist-upgrade

If you have not updated for a while, then the above commands may take a while to finish, just be patient and make sure everything completes correctly. After the two commands have completed Reboot your Raspberry Pi.

## Update Node and NPM

Open the terminal window and enter the following commands...

    $ curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
    $ sudo apt install nodejs

This will update Nodejs and NPM to the latest version (V6.9.2 at time of writing), currently Nodejs V7.x has not been fully tested so best to stick with the stable V6.x build for now.

## Update Signal K Node Server

Open the terminal window and enter the following commands...

    $ cd signalk-server-node
    $ git pull
    $ npm update

Now your Signal K Node Server is updated.

## Update Web Apps

Open the terminal window and enter the following commands...

    $ cd signalk-server-node
    $ npm install

Now all of your Signal K web apps included with the Node Server are updated.
