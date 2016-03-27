Creating Signal K Consumers
===========================

1. Introduction
-------------
A Consumer is any program, web application, website or device that Consumes a Signal K server's WebSocket stream, and does something with it without affecting the server or the stream*

*(* There are some use cases where a Consumer should be able to change the stream. Currently, in such a case I recommend building a Provider, which doubles as a Consumer.)*

2. Sample consumers
--------------------------------
There are several prototype level browser based consumers available. They are installed by default in the `bower_components` directory under node server's root and you can access them through the server's home page.

3. Getting started with your own consumers
------------------
The simplest form of a consumer is a process or web page that receives and displays the data in some way. The server contains a very simple web page that connects to the server with a WebSocket connection and updates the display as new json messages are received from the server. If you have installed the server and started it with one of the file-based startup scripts in the bin/ directory you can access it at [http://localhost:3000/examples/consumer-example.html](http://localhost:3000/examples/consumer-example.html). The [html code of the web page](https://github.com/SignalK/signalk-server-node/blob/master/public/examples/consumer-example.html) is in the examples directory.


4. Going further
--------------------------------
Have an idea for a great way to visualise Signal K data? Something bugging you about the sample consumers? [Learn about the message formats](http://signalk.org/dev/messageFormat.html), share your input, write some code, [join the mailing list](https://groups.google.com/forum/#!forum/signalk)!
