Security
========

The server provides a simple mechanism to allow security to be implemented using a separate module.
It is the responsibility of the specific security module to enforce its security policy.

For an example implementation see https://github.com/SignalK/sk-simple-token-security

To enable security, add a `security` section to your settings .json file and add any configuration that the specific security implementation requires.

```
"security": {
    "strategy": "sk-simple-token-security",
    "jwtSecretKey": "tyPaYnCtpZLZjNXyLRKnspZHQyLGZUgkYvtwE7quwZDaZmAnqpKntRqDjTciVazV",
  }
```

Implementing a security strategy
================================

The stragegy module should export one function which takes the Express application as an argument.

This function should setup security with Express to handle all HTTP and REST security.

A very simple pseudo exmaple (see sk-simple-token-security for a real world example):

```
module.exports = function(app) {
    app.use('/', function(req, res, next) {
      if ( user_is_authenticated(req) ) {
        next()
      } else {
        res.status(401).send("user is not authenticated");
      }
    })
}
```

To handle WebSocket security, the exported function should return an object with three methods: `shouldAllowWrite`, `verifyWS` and `authorizeWS`.

* `shouldAllowWrite` is called if an attempt is made to post a delta message via the WebSocket.
* `authorizeWS` is called when the WebSocket connection is first established. It should throw an exception if authentication fails
* `verifyWS` is called every time a delta is sent out over the websocket. It should periodically check that the authentication is still valid and throw an execption if it is not.

A very simple pseudo exmaple (see sk-simple-token-security for a real world example):

```
module.exports = function (app) {
  var strategy = {}

  app.use('/', function (req, res, next) {
    if (user_is_authenticated(req)) {
      next()
    } else {
      res.status(401).send('user is not authenticated')
    }
  })

  strategy.shouldAllowWrite = function (req) {
    if (!user_can_write(req)) {
      throw new Error('User does not have write permissions')
    }
  }

  strategy.authorizeWS = function (req) {
    if (!user_is_authenticated(req)) {
      throw new Error('User is not authenticated')
    }
  }

  strategy.verifyWS = function (req) {
    if (!req.lastVerify) {
      req.lastTokenVerify = new Date()
      return
    }
    // check once every minute
    var now = new Date()
    if (now - req.lastTokenVerify > 60 * 1000) {
      req.lastVerify = now
      strategy.authorizeWS(req)
    }
  }

  return strategy
}
```
