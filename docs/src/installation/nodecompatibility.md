# Node compatability

Signal K server currently supports Node version 18 or greater.


# Node library incompatablities

When you install Signal K server, you may notice these messages being shown as part of the install.  These are known issues.
```
npm WARN deprecated rimraf@2.7.1: Rimraf versions prior to v4 are no longer supported
npm WARN deprecated fstream@1.0.12: This package is no longer supported.
npm WARN deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
npm WARN deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
```


# Compatability messages displayed

When running 'signalk-server --sample-nmea0183-data' or in journalctl or system messages, you may see a message similar to the following. You can ignore this message if your version of Node is greater than or equal 18.  Signal K server does support Node greater than version 20

```
The installed version of node (v23.5.0) is different than the recommended version (18 - 20). See https://github.com/SignalK/signalk-server/wiki/Installing-and-Updating-Node.js for more information how to upgrade
```



You may also get this message which is a known issue
```
(node:3545) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
```
