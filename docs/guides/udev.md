---
title: Linux udev Rules
---

# Linux udev Rules

When you connect a USB device to a Linux computer, the kernel will automatically detect it and create a device file in

Linux assigns device names sequentially to hotplug hardware. Usually, your device will get the same name each time you
connect it or boot your computer, but sometimes the name may change. For this reason, disks and partitions are
typically referenced by UUID and not by device path any more. For our purposes dealing with USB serial adapters, the
assigned device name is typically `/dev/ttyUSB0`. However, if you have more than adapter the device names may not
always be consistent. Therefore, it is a good idea to create a udev rule to provide an alias for your device.

The example below assumes Debian or Ubuntu as the distribution, but it should be similar for others.

First, we need to collect some identifiers for the device we want to alias. In a shell, run the `usb-devices` command.

```sh
$ usb-devices
```

This will enumerate all of the USB devices connected to your computer (including internal USB hubs). In our example,
we're looking for Actisense devices. Write down the `Vendor`, `ProdId` and `SerialNumber` values for each of your
devices.

Then, in your favorite text editor, create a file in `/etc/udev/rules.d/` called `90-actisense.rules`. The 90 ensures
that it processed after other udev rules.

The contents of the file should be:

```
SUBSYSTEMS=="usb", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="d9aa", ATTRS{serial}=="1B091", SYMLINK+="actisense"
```

Replace `0403` with the value you wrote down for `Vendor` (if you are working with and Actisense device, it will likely
be the same). Replace `d9aa` with the value you wrote down for `ProdId` and replace `1B091` with the value you wrote
down for `SerialNumber`. The last change is to give your symlink a name. In the example above it is `actisense`, but
you can call it whatever you want (without spaces or filesystems-reserved characters like `/`). Let's say you have two
USG-1 devices, one for the autopilot and one for your VHF radio. You might want to name these devices `autopilot` and
`vhf`. Then they would be available at `/dev/autopilot` and `/dev/vhf` respectively.

You can specify multiple rules in one file, one rule per line:

```
SUBSYSTEMS=="usb", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="d9aa", ATTRS{serial}=="1B091", SYMLINK+="autopilot"
SUBSYSTEMS=="usb", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="d9aa", ATTRS{serial}=="1B094", SYMLINK+="vhf"
```

After creating this file, disconnect your devices and plug them back in. You should see the new entries under `/dev`.
If not, reboot.
