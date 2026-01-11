---
title: Help & Support
---

# Help & Support

Signal K has an friendly and helpful community where you can find support and assistance whether you are trouble shooting issues or just have a question.

**Join the discussion:**

- [**Discord**](https://discord.com/channels/1170433917761892493/1170433918592368684) _(New to Signal K Discord? [Click here](https://discord.gg/uuZrwz4dCS) for an invite.)_

- [**GitHub Discussions**](https://github.com/SignalK/signalk/discussions/)

## Frequently Asked Questions

Answers to common issues and queries can be found on the [Frequently Asked Questions](https://github.com/SignalK/signalk-server/wiki/FAQ:-Frequently-Asked-Questions) space on GitHub.

Here are some common queries:

- [How do I integrate with NMEA2000 (CAN bus)](https://github.com/SignalK/signalk-server/wiki/FAQ:-Frequently-Asked-Questions#how-do-i-integrate-with-nmea2000-can-bus).

- [Installing & Updating NodeJS](https://github.com/SignalK/signalk-server/wiki/Installing-and-Updating-Node.js)

## Troubleshooting

### "Network congestion detected" - What does this mean?

Your device's connection to the Signal K server is slower than the data being sent. This can happen when:

- **WiFi signal is weak** - try moving closer to your access point
- **Network is busy** - other devices streaming video, large downloads, etc.
- **Slow mobile connection** - cellular data may not keep up with high-frequency updates
- **Many sensors active** - the server is sending a lot of data

**What happens?**

When your connection can't keep up:

1. The server keeps only the **most recent value** for each data point
2. You still see **current, accurate values** - they're just not every single update
3. The system **recovers automatically** when your connection improves

This is normal and safe. Your navigation data remains accurate - you just might miss seeing some intermediate values (like every single GPS position update during a slow period).

**What can I do?**

- Move closer to your WiFi access point
- Check if other devices are using a lot of bandwidth
- If on a boat, verify the network connection to your navigation computer
- Consider using a wired Ethernet connection for critical displays
- For remote access (4G, VPN, public internet): enable WebSocket compression in Admin UI → Server → Settings to reduce bandwidth usage
