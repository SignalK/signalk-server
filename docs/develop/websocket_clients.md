---
title: WebSocket Clients
---

# WebSocket Clients

Notes for anyone writing a client for the server's WebSocket stream
(`/signalk/v1/stream`).

## When the server stops

When Signal K Server stops or restarts, it ends every WebSocket connection
with a close frame, as [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455#section-7)
describes. A client should handle that like any other lost connection: wait,
then reconnect, backing off if the server is not back yet.

### Exception: ESP-IDF's default User-Agent

For a client whose User-Agent is `ESP32 Websocket Client`, the server does
**not** follow RFC 6455 here: it drops the connection without a close frame.

That User-Agent is the one ESP-IDF's WebSocket client sends when the
application sets none, and SensESP 3 connects with it. Up to 3.6.0, SensESP
devices reconnect after a dropped connection but not after a close frame from
the server: all of them on 3.5.0 and 3.6.0, and listen-only devices on 3.0.0 to
3.4.0. Every server restart would leave them offline until they were rebooted.
SensESP fixes this after 3.6.0
([SignalK/SensESP#1096](https://github.com/SignalK/SensESP/pull/1096)).

If your firmware uses ESP-IDF's WebSocket client, set your own User-Agent, and
your client gets the close frame like any other. The exception is there for
those SensESP devices; do not build on it.

Only stopping the server is affected. Connections the server ends while it is
running, for example after a heartbeat timeout or for a client that cannot keep
up, are handled the same way for every client.
