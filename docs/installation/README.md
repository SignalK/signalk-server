---
title: Installation
children:
  - raspberry_pi_installation.md
  - npm.md
  - docker.md
  - source.md
  - updating.md
  - command_line.md
---

# Installation

Signal K Server is a [NodeJS](https://nodejs.org/en) application which can run on nearly any computer and operating system, including Window, Linux, and macOS.

Currently the most cost effective, powerful and best supported hardware platform for a Signal K server is the [Raspberry
Pi](https://www.raspberrypi.com). Any Raspberry Pi (even the very first model) can be used but for best performance we recommend Raspberry Pi 4 model B or 5. If you don't have a Raspberry Pi, any old laptop or computer you have sitting around would make a good initial test platform, although for permanent use on a yacht, more power efficient hardware like a Raspberry Pi is strongly recommended.

## Ready-made options

You do not have to install Signal K Server yourself. Several commercially available devices ship with it inside, and several prebuilt Raspberry Pi images install it for you. Both are listed under [How to get Signal K Server?](https://github.com/SignalK/signalk-server#how-to-get-signal-k-server) in the project README. If one of them suits your boat, you do not need the instructions below.

## Prerequisites

> [!NOTE]
> Signal K server requires [NodeJS](https://nodejs.org) `>=22.13 <23` or `>=23.4` (version 24 recommended) be installed on the target system. The alerts subsystem uses the built-in `node:sqlite` module, which needs a flag on 23.0 to 23.3, so those releases are not supported.

## Getting Started

- [Installing on Raspberry Pi](raspberry_pi_installation.md)
- [Installing on Windows](https://github.com/SignalK/signalk-server-windows)
- [Installing from NPM](npm.md)
- [Installing from Docker](docker.md)
- [Installing from Source](source.md)
