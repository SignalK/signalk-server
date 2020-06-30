## Seatalk(GPIO)

### 1. Intro

The connection with ”Input type” => ”Seatalk(GPIO)” supports the function to receive, via simple DIY hardware and one of the GPIO:s on the Raspberry, Raymarine Seatalk 1(ST1) data and convert it to SignalK delta. This information can then be forwarded to a NMEA 0183 or NMEA 2000 network with appropriate hardware and plugins. A guide to SeaTalk is found [here](http://boatprojects.blogspot.com/2012/12/beginners-guide-to-raymarines-seatalk.html)

Original idea is picked from https://github.com/Thomas-GeDaD/Seatalk1-Raspi-reader

### 2. Hardware

![SeaTalk_opto](https://user-images.githubusercontent.com/16189982/86119990-cdb0c000-bad3-11ea-9e55-4937ba9d42a7.jpeg)

The circuit is referring to [this optocoupler](https://www.amazon.com/ARCELI-Optocoupler-Isolation-Converter-Photoelectric/dp/B07M78S8LB/ref=sr_1_2?dchild=1&keywords=pc817+optocoupler&qid=1593516071&sr=8-2) but a similar product can of course be used. The LED in the circuit will flicker when there is ST1 traffic. 

Choosing an optocoupler as the hardware interface is a smart way to avoid ground loops and electrical isolation from hazardous voltages.

### 3. Software

Due the DYI approach and that this function have limited users You have, before configuring the actual connection, to install some software manually in a terminal window.
Start with an update and then the software install

    $ sudo apt-get update && sudo apt-get install pigpio python-pigpio python3-pigpio

The connection relies on a [daemon](http://abyz.me.uk/rpi/pigpio/) which is enabled and started via a systemd service. Install with

    $ sudo systemctl enable pigpiod && sudo systemctl restart  pigpiod

Could be checked with 

    $ sudo systemctl status pigpiod

Now go on add a connection, in the admin GUI, with type ”Seatalk(GPIO)” according to the picture. 

![seatalk_connection](https://user-images.githubusercontent.com/16189982/86120712-1ae16180-bad5-11ea-9c55-3591791f9d3d.png)

Select which pin, one of the green ones in the picture below, You have shoosen as input and don’t use ”Invert signal” if You are using the hardware setup above. Invert is used if You have a different hardware interface which is inverting the input signal.

![RPi_GPIO](https://user-images.githubusercontent.com/16189982/86120870-5a0fb280-bad5-11ea-9b4a-e7f36307e0ce.png)

Restart the SignalK server and then use the ”Data Browser” in the admin GUI to confirm that You are receiving the SK data
 
