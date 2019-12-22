# PLUGIN Example (Typescript)

To create your Plugin you can modify the files in this folder or copy the contents to another  folder in the same location.

Once you are ready to start, open a terminal window and change to the folder where your plugin package resides.

1) Install the plugin package dependencies using `npm i `

1) Modify the `name` attribute in the `package.json` file to contain the name of your plugin.

Your plugin package is now ready for you to start developing. To be able to run your plugin during development you will need to `link` it to the server. To do this:

1) From within your plugin folder `npm link`
1) Change to the servers `./signalk` folder and issue the command `npm link your-plugin-name` where `your-plugin-name` is the name you entered into your plugin's `package.json` file.

You can now start the Signal K server and your plugin should appear in the `Plugin Config` screen.

To assist with debugging during the development of your plugin start the server using the `DEBUG` environment variable.

```
env DEBUG="your-plugin-name" bin/signalk-server
```

---
### Start Developing:

Open another terminal window and change to the folder where your plugin resides and type: 
```
npm start
```

This will start the Typescript compiler, watch for file changes and place the resultant javascript files in the `plugin` folder.

As you make changes to files they will be automatically compiled to the `plugin` folder.

_Note: The Sugnal K server needs to be restarted to load your updated plugin files._ 

---
### Packaging and Publishing:

Once your plugin is complete, tested and ready to go you can package it and publish it to the **NPM** repository using the following commands:

To package your plugin into a file where you can inspect it prior to publishing use: 
```
npm pack
```
The resultant `.tgz` package file contains your plugin ready to publish.

If all is OK then you can then publish this package using:
```
npm publish your-package-file-name
```

To package and publish your plugin all in one step use: 
```
npm publish
```



