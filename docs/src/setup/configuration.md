## Configuring Signal K Server

Signal K server provides an Admin UI to allow you to easily configure your installation. 

Open the Admin UI by opening a web browser on the device where Signal K server is installed and (if the defaults have not been changed) navigate to `http://localhost:3000`.

### Create an Admin account

If you ran the `signalk-server-setup` script you will be presented with a login screen.

- Click `Login` for the first time will prompt you to create a user and password.

Otherwise from the menu select `Security -> Users`:

From the **Users** screen:
1. Click **Add**
1. Enter a **UserID**
1. Enter a **password** and confirm it
1. In **Permissions** select **Admin**
1. Click **Apply**.

_Besides being good practise from a security standpoint, when logged in with Admin account the `Restart` button is available making it easy to restart the server._

After creating the account, the server needs to be restarted.

How you restart the server will depend on the installation type (i.e. installed from NPM, embedded on a commercial device, etc). Power cycling the device that Signal K Server is always an option.

### Set up data connections

To get data into Signal K server you will need to configure one or more data connections via the `Server -> Data Connections` menu option.

From this screen you can add connections for various data types including:
- NMEA2000
- NMEA0183
- Signal K
- SeaTalk
- File Stream

The options presented will vary based on the data type chosen.

**_NMEA2000_**: The processing of NMEA2000 PGNs is done by [n2k-signalk](https://github.com/SignalK/n2k-signalk) via [canboatjs](https://github.com/canboat/canboatjs).

Please refer to the [Canboat PGN database](https://canboat.github.io/canboat/canboat.html) to see what PGNs are supported.


**_NMEA0183_**: The processing of NMEA0183 sentences is done by [nmea0183-signalk](https://github.com/SignalK/signalk-parser-nmea0183)


### Install Plugins and Webapps

Signal K server functionality can be extended through the use of plugins and webapps.

Plugins typically extend data acquisition, data processing or enable operations (i.e. protocol conversion, etc).

Webapps provide a user interface to view / interact with data or perform operations enabling full featured solutions such as a Chartplotter.

_Pictured below: Freeboard-SK webapp:_
![image](https://user-images.githubusercontent.com/5200296/226479871-6f3769af-4fa4-43d6-871f-4a54bec372fa.png)

To install, update or remove plugins and webapps select `Appstore` from the menu.

Select:

- `Installed` to view a list of plugins and webapps currently installed.

- `Updates` to view a list of plugins and webapps that have updates available.

- `Available` to view a list of available plugins and webapps that can be filtered by categry.

The entries displayed with a blue icon are webapps, those with a green icon are plugins and those with both blue and green icons are plugins with a webapp providing a user interface.

_Note: An internet connection is required for Signal K Server to list, install and update AppStore listings._

To install, click the `download` icon on the right hand side of the entry.

To view a list of Plugins and Webapps directly from the NPM registry select the links below.

  * [Plugins](https://www.npmjs.com/search?q=keywords%3Asignalk-node-server-plugin)
  * [Webapps](https://www.npmjs.com/search?q=keywords:signalk-webapp)

**_Note: A restart of the Signal K server is required after plugin(s) or / webapp(s) have been installed.or updated._**

Click the `Restart` button at the top right of the screen to restart the server.

After the server has restarted, the installed plugin(s) can be configued by selecting `Server -> Plugin Config` menu entry.


### Trouble shooting and the Server Log

If things are not working as expected after installing a plugin or webapp, select `Server -> Server Log` to view the server's log. If the errors logged there are not providing the information required, you can enable  debugging for individual components and plugins by toggling the switch to activate them.

Enabling the `Remember debug setting` ensure your selections are remebered after a server restart.

