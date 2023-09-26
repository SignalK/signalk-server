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
