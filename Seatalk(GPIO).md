## Seatalk(GPIO)

### 1. Intro

The connection with ”Input type” => ”Seatalk(GPIO)” supports the function to receive, via simple DIY hardware and one of the GPIO:s on the Raspberry, Raymarine Seatalk 1(ST1) data and convert it to SignalK delta. This information can then be forwarded to a NMEA 0183 or NMEA 2000 network with appropriate hardware and plugins. A guide to SeaTalk is found [here](http://boatprojects.blogspot.com/2012/12/beginners-guide-to-raymarines-seatalk.html).

Original idea is picked [from Thomas](https://github.com/Thomas-GeDaD/Seatalk1-Raspi-reader) and a circuit update with ideas [from Marco](https://github.com/marcobergman/seatalk_convert).

### 2. Hardware

![‎ST1_opto](https://github.com/SignalK/signalk-server/assets/16189982/da0ff2fa-7798-40d7-b61f-67634c202ee5)

The circuit is referring to [this optocoupler board](https://www.amazon.com/ARCELI-Optocoupler-Isolation-Converter-Photoelectric/dp/B07M78S8LB/ref=sr_1_2?dchild=1&keywords=pc817+optocoupler&qid=1593516071&sr=8-2) but a similar product can of course be used. The LED in the circuit will flicker when there is ST1 traffic. 

Choosing an optocoupler as the hardware interface is a smart way to avoid ground loops and creats electrical isolation from hazardous voltages. The setup above will not invert the signal.

Do You want it simple ?  The simplest possible interface solution is according to the picture below. You use a small signal NPN transistor which shifts the DC level, from 12 V DC to 3,3 V DC, and inverts the signal.

![ST1_Tr](https://user-images.githubusercontent.com/16189982/88704045-d6fe6e00-d10d-11ea-8f83-cb765e4c65f3.jpeg)

### 3. Software

Due the DYI approach and that this function have limited users You have, before configuring the actual connection, to install some software manually in a terminal window.
Start with an update and then the software install

    sudo apt-get update && sudo apt-get install pigpio python-pigpio python3-pigpio

The connection relies on a [daemon](http://abyz.me.uk/rpi/pigpio/) which is enabled and started via a systemd service. Install with

    sudo systemctl enable pigpiod && sudo systemctl restart  pigpiod

Could be checked with 

    sudo systemctl status pigpiod

Please note that pigpio deamon provides, by default, a socket interface on port 8888, which could conflict with other software You have installed. If You want to move the socket interface to another port You have to change the [pigpiod.service file](http://abyz.me.uk/rpi/pigpio/pigpiod.html) with the -p option, and the [Python program](http://abyz.me.uk/rpi/pigpio/python.html#pigpio.pi). So maybe it's easier to move the conflicting program ?

Now go on add a connection for the optocoupler setup, in the admin GUI, with type ”Seatalk(GPIO)” according to the picture.

<img src=https://github.com/SignalK/signalk-server/assets/16189982/51426017-99b5-46b4-8e93-62515a964635 width="35%" height="35%" />

Select which pin, one of the green ones in the picture below. Invert "YES" is used if You have a different hardware interface which is inverting the input signal.

![GPIO](https://user-images.githubusercontent.com/16189982/86477812-8469a600-bd49-11ea-8e55-4ee4400a2c17.png)

Restart the SignalK server and then use the ”Data Browser” in the admin GUI to confirm that You are receiving the SK data
 
If You are in doubt, if there is data available at the selected GPIO, You can download a program

    wget https://raw.githubusercontent.com/MatsA/seatalk1-to-NMEA0183/master/STALK_read.py
    
change the setup in the beginning of program and execute it with 

    sudo python STALK_read.py
    
If You succed You will se the ST1 sentences roll in.
