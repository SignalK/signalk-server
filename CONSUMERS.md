Creating Signal K Consumers
===========================

1. Definition
-------------
A Consumer is any program, web application, website or device that Consumes a Signal K server's WebSocket stream, and does something with it without affecting the server or the stream*

*(* There are some use cases where a Consumer should be able to change the stream. Currently, in such a case I recommend building a Provider, which doubles as a Consumer.)*


2. Getting started
------------------
The simplest form of a consumer is a process or web page that receives and displays the data in some way. Below you can find an example of a very simple SOG display in the browser. 

**Browser**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  
  <title>Signal K consumer</title>

  <style>
    h1, h2 {
      font-family: sans-serif;
      font-size: 2em;
      padding: 0;
      margin: 0;
      line-height: 1.5;
    }

    h2 {
      font-size: 1.1em;
      color: #999;
    }
  </style>
</head>
<body>
  <h2>Speed over Ground</h2>
  <h1 id="speedOverGround">0.00</h1>

  <!-- ASSUMING YOUR SERVER IS RUNNING AT https://localhost:3000 -->
  <script src="https://localhost:3000/socket.io/socket.io.js"></script>
  <script>
    var socket = io.connect('wss://localhost:3000/signalk/stream');
    var gauge = document.getElementById('speedOverGround');

    socket.on('signalk', function(signalk) {
      var self = signalk.self;
      var data = signalk.vessels[self];
      var sog = data.navigation.speedOverGround || 0.00;

      if(!isNaN(parseFloat(sog))) {
        gauge.innerHTML = parseFloat(sog).toFixed(2);
      } else {
        gauge.innerHTML = 0.0;
      }
    });
  </script>
</body>
</html>
```

3. Examples of working Consumers
--------------------------------
1. Navgauge (`almost, @todo`)
2. [Polymeters](https://github.com/fabdrol/consumer-polymeters)

