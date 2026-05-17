---
title: NMEA Connections
---

# NMEA Connections

Most equipment on boats use NMEA 0183, NMEA 2000, or other proprietary interfaces to communicate with each other. A lot of work has been done within the Signal K community to convert these different data formats in to Signal K.

## NMEA 0183

There are a number of NMEA to USB adaptors around, like
[Actisense](http://www.actisense.com/product/usg-2/) and
[Digital Yacht](http://digitalyacht.co.uk/product/usb-nmea-adaptor/), which allow
bi-directional transfer of the NMEA 0183 Serial data (electrically similar to RS-422) and convert it in to a USB
virtual COM Port when plugged in to the Signal K server.

In Linux the virtual COM Port will be seen as a device called `/dev/ttyUSB0` (the number could be different if there
are multiple USB-to-serial adapters connected). Linux assigns these device names automatically when the device is
connected, so it could change. If you want to ensure that the device always has the same name, you will need to write a
UDEV rule to specify an alias. See [creating UDEV rules](../guides/udev.md) for details.

To verify that you have a working connection, you can use picocom or another terminal emulator to see if you are
receiving data. The default baud rate for standard NMEA 0183 is 4800, whilst AIS and multiplexers use NMEA 0183(HS) at the "High Speed" 38400 baud rate.

```
$ picocom -b 4800 /dev/ttyUSB0
```

You should see NMEA 0183 sentences scrolling off the screen. To exit picocom press `Ctrl-a` followed by `Ctrl-x`.

Once your NMEA 0183 connection is working, you can [set up data connections the Signal K server](./configuration.md#set-up-data-connections) to read the data.

## NMEA 2000

NMEA 2000 support in Signal K is provided by [canboatjs](https://github.com/canboat/canboatjs), which is a library that can read and write NMEA 2000 data. See the [list of supported devices from canboatjs](https://github.com/canboat/canboatjs#supported-devices) for details of hardware that can be used to connect to NMEA 2000 networks.

Directions for configuring your hardware will vary by device, so consult the documentation for your hardware for details. Once you have your hardware connected and configured, you can use the `candump` utility from the `can-utils` package to verify that you are receiving NMEA 2000 data.

```sh
candump can0
```

You should see NMEA 2000 data scrolling off the screen. Press `Ctrl-c` to exit candump.

After confirming you have NMEA data, you can [set up data connections the Signal K server](./configuration.md#set-up-data-connections) to read the data.

Once your data connection is configured, see [NMEA 2000 Device Management](./n2k-device-management.md) for discovering devices, managing instance numbers, and resolving instance conflicts.
