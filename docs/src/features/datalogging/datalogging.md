# Data Logging

Signal K server can log all input data from the configure input connections to a hourly data log files.

You can activate data logging for each connection by switching on Data Logging under Server / Data Connections, saving the connection settings. The setting takes effect after restarting the server.

The log files are downloadable in the Admin UI under Server / Server Logs.

The logs contain the data that the server has processed in the raw, original format (prior to conversion to Signal K) and each message is timestamped.

Log files can be used for archiving, to later play back the data or for debugging purposes. The server can play them back by creating a Data Connection with Data Type `File Stream` and secondary Data Type as `Multiplexed Log`.


