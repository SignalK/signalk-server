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

Then we use curl followed by "apt-get" again to add Nodesource repository and install Node.js, which is the runtime environment for Signal K Node server.

    $ curl -sL https://deb.nodesource.com/setup_0.12 | sudo -E bash -
    $ sudo apt-get install -y nodejs

Once this has completed you can check that Node.js is installed OK, by typing...

    $ node -v

and you should see "v0.12.11" appear or whatever the latest version is.

Finally we need to install a Bonjour (mDNS) service for LINUX called Avahi, which allows Apps and other network devices to Discover the Signal K server. To do this we will use "apt-get" again ...

    $ sudo apt-get install libnss-mdns avahi-utils libavahi-compat-libdnssd-dev

To check if Avahi is installed and working correctly enter the following command...

    $ avahi-browse -a

This will search for and list all of the discoverable devices/services on your network. Use ctrl+c to stop the search.

![Avahi-Browse](https://github.com/digitalyacht/ikommunicate/blob/master/RPi_How_To_Images/Avahi-Browse.png)

## Step 2 - Install Signal K Node Server

In this "How To" guide we are going to use the Signal K Node Server, but we also have a [guide for the Java Server](https://github.com/SignalK/specification/wiki/Raspberry-Pi-Installation-(Java-Server)) which is the other popular Signal K server.

A Signal K Server is the central hub of a Signal K system; reading and converting the boat's NMEA data (or Signal K data from a gateway), which it then stores and logs, before outputting the Signal K data to web apps (consumers) on the boat or sending it off the boat to other vessels or Cloud services.

To install the Node Server, we will first create a clone of all the Node Server source files that are on the GitHub repository by using the "git clone" command...

    $ git clone https://github.com/SignalK/signalk-server-node.git

This will create a folder called "signalk-server-node" in the Home directory of your RPi. We need to switch in to this folder with the "cd" command, and then install the Node Server's dependencies using npm which must be done in the cloned folder that contains the node server source files... 

    $ cd signalk-server-node
    $ npm install

Bonjour/mDNS discover support is not included in the Node server by default, so we need to install it manually...

    $ npm install mdns

Now all you need to do to start the Node Server running is to type...

    $ bin/nmea-from-file

Which tells the RPi to find the executable file "nmea-from-file" in the "bin" folder and run it. You should see the terminal output "signalk-server running at 0.0.0.0:3000" as shown below...

![Node Server Running](https://github.com/digitalyacht/ikommunicate/blob/master/RPi_How_To_Images/node_server_running.png)

As the file name suggests, the Signal K Node Server is now reading NMEA Data from a Demo File and is ready to pass that data to any device that wants it. To get your first taste of what Signal K data looks like, open the Epiphany Web browser on your RPi and type this URL in to the address bar "http://127.0.0.1:3000/signalk". This directs the browser to the Signal K server on the RPi (127.0.0.1 is your local Loopback address) and you should see the following screen...

![Your first view of Signal K data](https://github.com/digitalyacht/ikommunicate/blob/master/RPi_How_To_Images/SignalK_LocalAddr.png)

So that is Signal K....looks good doesn't it ? Actually this is just some JSON data that tells an App what the URL "endpoints" are so that it knows what Version of Signal K the server supports and where it can get HTTP or Websocket data from. You will not see any of the interesting stuff until you have a consumer or two installed, so lets move swiftly to step 3.

## Step 3 - Install Signal K Consumers

A "Consumer" of Signal K data is any web app, mobile device app or software program that can read and use Signal K data. It is hoped that the number of consumers will grow rapidly as more developers discover this open format and dream up new applications to make boating easier, more efficient or just more fun.

For the purposes of this "How to" we will install some open source web apps that have been developed by the Signal K team to show what can be done with Signal K data. To install them, we must first install Bower, which is an installer (Package Manager)  for Web Apps. Similar to NPM it is optimised for "front end" web apps, while NPM is optimised for server type tools and applications. To install Bower , type in the following commands...

    $ sudo npm install -g bower

Once Bower has installed, we can install the web apps in the server folder...

    $ cd signalk-server-node
    $ bower install https://github.com/SignalK/instrumentpanel.git
    $ bower install https://github.com/SignalK/sailgauge.git
    $ bower install https://github.com/SignalK/maptracker.git
    $ bower install https://github.com/SignalK/simplegauges.git

To use the web apps, we will need to open them in a web browser, but before we do that we must start the Signal K server again as we mentioned above.
 
    $ cd ~/signalk-server-node
    $ bin/nmea-from-file

Now open the Epiphany browser on your Pi and type in one of the following URLs depending upon which app you want to run...

    http://127.0.0.1:3000/instrumentpanel   
    http://127.0.0.1:3000/sailgauge   
    http://127.0.0.1:3000/maptracker   
    http://127.0.0.1:3000/simplegauges

If you have managed to get to the end of this guide, you will now have a good understanding of what Signal K is all about and in particular the Node Server. We have been using the server's demo NMEA file, but Node Server can also read NMEA0183 data via an [NMEA to USB adaptor cable](http://www.digitalyachtamerica.com/index.php/en/products/interfacing/nmeausb/product/67-usb-to-nmea-adaptor), a [3rd party NMEA2000 gateway](http://www.actisense.com/products/nmea-2000/ngt-1/ngt-1.html) or both NMEA0183 and NMEA2000 via the new [iKommunicate gateway](http://ikommunicate.com). 

In the "/bin" folder of the Node Server are a series of scripts for different configurations "nmea-from-serial", "n2k-from-actisense", etc. and you just run the one that matches your installation.   
