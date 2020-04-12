Security
========

To enable security, add a `security` section to your settings .json file and add any configuration that the specific security implementation requires. This can be done automatically under Security in the admin ui.

```
"security": {
    "strategy": "./tokensecurity",
  }
```

Security configuration is stored in file called `security.json` which will be located in the configuration directory.

**In case you accidentally lose your admin credentials you can remove `security.json` and restart.**

ACLs
====

Access control lists allow fine grained control of access to specific data in SignalK. The acls are a list which allow specifiying controls for specifc contexts and it goes in the security.json file mentioned above.

The following example defines acls for the self context. It allows anyone to read the paths `"steering.*"`, `"navigation.*"`, `"name"`, `"design.aisShipType"` and allows the admin user permission to write (update) those paths. 

The second entry allows the user _john_ to read any data coming from the `actisense.35` $source.

The last entry covers all other paths, allowing only the admin user to read and no one can write.

If there is no match is found for a specific path in the acl list, then permission will be denied to that path.

```
  "acls": [
    {
      "context": "vessels.self",
      "resources": [
        {
          "paths": ["steering.*", "navigation.*", "name", "design.aisShipType"],
          "permissions": [
            {
              "subject": "any",
              "permission": "read"
            },
            {
              "subject": "admin",
              "permission": "write"
            }
          ]
        },
        {
          "sources": [ "actisense.35" ],
          "permissions": [
            {
              "subject": "john",
              "permission": "read"
            }
          ]
        },
        {
          "paths": ["*"],
          "permissions": [
            {
              "subject": "admin",
              "permission": "read"
            }
          ]
        }
      ]
    }
  ]
  ```
