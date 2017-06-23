Security
========

To enabled security on node server, add an `authentication` section to your settings .json file.

Here is an example:

```json
  "authentication": {
    "http": true,
    "rest": true,
    "ws": true,
    "jwtSecretKey": "tyPaYnCtpZLZjNXyLRKnspZHQyLGZUgkYvtwE7quwZDaZmAnqpKntRqDjTciVazV",
    "users": [
      {
        "username": "admin",
        "password": "password",
        "type": "admin"
      },
      {
        "username": "readwrite",
        "password": "password",
        "type": "readwrite"
      },      
      {
        "username": "readonly",
        "password": "password",
        "type": "readonly"
      }
    ]
  }
```

For a full example settings file see `settings/authentication-settings.json`

Enabling
--------
- `"http": true` turns on authentication for the http interface (webapps, plugin configuration, app store, etc). This uses a browser based login form.
- `"rest": true` turns on authentication for the rest interface at `/signalk/v1/api` and the plugins interface at `/plugins`. This uses JWT.
- `"ws": true` turns on authentication for the ws streaming interface at `/signalk/v1/stream`. This also uses JWT

User Types
----------
- `admin` - an admin can do anything incuding installing plugins, configuring plugins, restarting the server, etc. Including anything that the readonly and readwrite users can do.
- `readwrite` - a readwrite user can use web apps, read from the rest and ws api's, and post to the rest api.
- `readonly` - a readlony user can read from the rest, ws and /plugin apis


JWT Usage
=========

When JWT is turned on, all requests require a valid token to be present. 

JWT requires a secret key, which is the `jwtSecretKey` in the example above. This can be any string, but it's recommended to use a good password generator that can generate a long string.

Getting a token
---------------

To get a token (which will expire), send a PUT request to `/signalk/v1/login`. This should contain a json object with `username` and `password`.

Example using curl:
```
curl -v -H 'Content-Type: application/json' -X PUT -d '{ "username": "admin", "password": "password"}' http://localhost:3000/signalk/v1/login
```

This returns a json object which includes the token:
```json
{"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFkbWluIiwiaWF0IjoxNDk4MTg1MjAwfQ.c5hR66gm_GdE1c8eukUCxNhv-SEApCpMo3JCdUqEDEk"}
```

Using the JWT token for REST requests
---------------------------------
All REST requests should then include the standard `Authorization` HTTP header with all requests. The value of the header should be `JWT` a space and then the token.

Example using curl:
```
curl -v -H 'Authorization: JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFkbWluIiwiaWF0IjoxNDk4MTYwMzEwfQ.7xvxLUechuztChRvGaYq_bpjYvu4NMpZe-uZqeAQV5c' http://localhost:3000/signalk/v1/api/vessels/self
```

Using the JWT token for streaming requests
------------------------------------------
These requests can use the same method as REST requests above or include the token as a query parameter.

Example using wscat:
```
wscat -c "ws://localhost:3000/signalk/v1/stream?subscribe=all&token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFkbWluIiwiaWF0IjoxNDk4MTYwMzEwfQ.7xvxLUechuztChRvGaYq_bpjYvu4NMpZe-uZqeAQV5c"
```
