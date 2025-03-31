---
title: Generating Tokens
---

# Generating Tokens

For a device to be able to interact with a Signal K server with security enabled, it is require to pass an access token with each request.

_Examples include display / gauge, temperature sensor or client with no user interface._

To get an access token the following methods can be used:
1. The device can submit an [Access Request](https://signalk.org/specification/1.5.0/doc/access_requests.html) which needs to be actioned via the Signal K Server UI.
2. Generate a token against a user account that has been configured on the Signal K Server.


### Generate Token

To generate a token against a user account that has been configured on the Signal K Server use the `signalk-generate-token` utility.

The `signalk-generate-token` utility is run from a terminal session on the Signal K Server and accepts the following parameters:
- `-u <username>`: The user account against which the token is created.
- `-e <time to live>`: The duration of time for which the token is valid.
    - 1y = 1 year
    - 2h = 2 hours
    - 10m = 10 minutes
    - 5s = 5 seconds
- `-s <path to security.json>`: The path to the Siganl K Server's security.json file _(e.g. ~/.signalk/security.json)_

_Example: Generate a token against the user "TempSensorDevice" that is valid for 1 year._
```sh
signalk-generate-token -u TempSensorDevice -e 1y -s ~/.signalk/security.json

```

_Note: The device using the token will have the same permissions as the user account the token was generated against. It is recommended that you create a specific user with the appropriate permissions for use with the device._

### Access Requests

For information regarding Access Requests, [ see the Signal K specification](https://signalk.org/specification/1.5.0/doc/access_requests.html).
