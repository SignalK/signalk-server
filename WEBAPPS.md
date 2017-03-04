Webapps
===========================

1. Introduction
-------------
A Signal K webapp is an HTML5 application that runs on a web browser and is typically loaded from a Signal K server, using its HTTP interface.

2. Sample webapps
--------------------------------
There are several prototype level browser based consumers available. They are installed by default in the `bower_components` directory under node server's root and you can access them through the server's home page.

3. Getting started with your own webapps
------------------
The simplest form of a Signal K client is a process or web page that receives and displays the data in some way. The server contains a very simple web page that connects to the server with a WebSocket connection and updates the display as new json messages are received from the server. If you have installed the server and started it with one of the file-based startup scripts in the bin/ directory you can access it at [http://localhost:3000/examples/consumer-example.html](http://localhost:3000/examples/consumer-example.html). The [html code of the web page](https://github.com/SignalK/signalk-server-node/blob/master/public/examples/consumer-example.html) is in the examples directory.


4. Going further
--------------------------------
Have an idea for a great way to visualise Signal K data? Something bugging you about the sample consumers? [Read the documentation](signalk.org/specification/master/), share your input, write some code, [join the mailing list](https://groups.google.com/forum/#!forum/signalk) and our [Slack chat](http://slack-invite.signalk.org/)!
