/*
 * Copyright 2024 Adrian Studer
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * This stream receives Seatalk1 data over GPIO on a Raspberry Pi
 * Supports Python libraries gpiod 1.x and 2.x
 * Supports Raspberry Pi OS Bookworm and Bullseye on Raspberry Pi 3, 4 and 5
*/

const Execute = require('./execute')

const cmd = `
import gpiod, sys, datetime

ST_PIN = 20

ST_INVERT = 0   # 0=idle high, 1=idle low
ST_BITS = 9
ST_STOP = 1
ST_BAUD = 4800

# detect version of gpiod,
gpiod_v = int(gpiod.__version__.split(".")[0])
if gpiod_v != 1 and gpiod_v !=2:
    print("Error: gpiod version {} is not supported".format(gpiod.__version__))
    sys.exit()

# detect model of Raspberry Pi, tested with Pi 4 and Pi 5 running Bookworm
with open("/proc/device-tree/model") as f:
    model = f.read()
if "Pi 4" in model or "Pi 3" in model:
    gpio_chip = "gpiochip0"
elif "Pi 5" in model:
    gpio_chip = "gpiochip4"
else:
    print("Warning: Use of {} is untested".format(model))
    gpio_chip = "gpiochip0"

class st1rx:
    line = None
    pending_e = None

    def open(self, pin, baud=ST_BAUD, bits=ST_BITS, stop=ST_STOP, invert=ST_INVERT):
        self.baud = baud
        self.bits = bits
        self.stop = stop
        self.invert = invert

        if gpiod_v == 1:
            # get pin with gpiod v1.x.x
            if self.invert == 0:
                pull = gpiod.LINE_REQ_FLAG_BIAS_PULL_UP
            else:
                pull = gpiod.LINE_REQ_FLAG_BIAS_PULL_DOWN
            chip = gpiod.Chip(gpio_chip)
            self.line = chip.get_line(pin)
            if self.line is None:
                print("Error connecting to pin ", pin)
                return False
            self.line.request(
                consumer="ST1RX",
                type=gpiod.LINE_REQ_EV_BOTH_EDGES,
                flags=pull)
        else:
            # get pin with gpiod v2.x.x
            if self.invert == 0:
                pull = gpiod.line.Bias.PULL_UP
            else:
                pull = gpiod.line.Bias.PULL_DOWN
            self.line = gpiod.request_lines(
                "/dev/" + gpio_chip,
                consumer="ST1RX",
                config={pin: gpiod.LineSettings(edge_detection=gpiod.line.Edge.BOTH, bias=pull)}
                )

        self.pending_e = None
        return True

    def close(self):
        if self.line is not None:
            self.line.release()
        self.line = None

    def read_gpiod1(self):
        l = self.line
        level = 0
        data = 0
        bits = self.bits
        stop = self.stop
        pol = self.invert
        fullbit_ns = int(1000000000 / self.baud)
        halfbit_ns = int(fullbit_ns / 2)
        frame_ns = int((1 + self.bits + self.stop) * fullbit_ns)

        if self.pending_e is None:
            # wait for new gpio events, timeout after 0.5 seconds
            if l.event_wait(nsec=500000000) == False:
                # no activity, return None
                return
            e = l.event_read()
        else:
            # we got a pending event
            e = self.pending_e
            self.pending_e = None

        if e.type == e.FALLING_EDGE:
            level = 0^pol
        else:
            level = 1^pol
        e_ns = e.nsec

        sample_ns = e_ns + halfbit_ns
        remaining_ns = frame_ns + halfbit_ns
        b = 0
        sb = False

        while True:
            # wait for next event
            if l.event_wait(nsec=remaining_ns):
                e = l.event_read()
                e_ns = e.nsec
                if e_ns < sample_ns:
                    e_ns += 1000000000

                # process bits since previous event
                while sample_ns < e_ns:
                    if sb == False:
                        if level == 0:
                            sb = True
                        else:
                            # not a start bit, return None
                            print("not a start bit")
                            return
                    elif b < bits:
                        # store data bits
                        data |= level << b
                        b += 1
                    elif stop > 0:
                        # check stop bits
                        if level == 1:
                            stop -= 1
                        else:
                            # invalid stop bit
                            print("invalid stop bits")
                            return
                    sample_ns += fullbit_ns
                    remaining_ns -= fullbit_ns

                # new level going forward
                if e.type == e.FALLING_EDGE:
                    level = 0^pol
                else:
                    level = 1^pol

                # check if we are done processing this event
                if remaining_ns < fullbit_ns:
                    # if so, this event is already start of next frame
                    self.pending_e = e
                    break
            else:
                # timeout is end of frame
                if level == 0:
                    # invalid idle state at end of frame
                    print("invalid idle state")
                    return
                # add remaining bits to byte
                while b < bits:
                    data |= level << b
                    b += 1
                stop = 0
                break

        if stop == 0 and b == bits:
            return data
        else:
            # missing stop or data bits
            print("missing stop or data bits")
            return

    def read_gpiod2(self):
        l = self.line
        level = 0
        data = 0
        bits = self.bits
        stop = self.stop
        pol = self.invert
        fullbit_ns = int(1000000000 / self.baud)
        halfbit_ns = int(fullbit_ns / 2)
        frame_ns = int((1 + self.bits + self.stop) * fullbit_ns)

        if self.pending_e is None:
            # wait for new gpio events, timeout after 0.5 seconds
            if l.wait_edge_events(datetime.timedelta(microseconds=500000)) == False:
                # no activity, return None
                return
            e = l.read_edge_events(1)[0]
        else:
            # we got a pending event
            e = self.pending_e
            self.pending_e = None

        if e.event_type == e.Type.FALLING_EDGE:
            level = 0^pol
        else:
            level = 1^pol
        e_ns = e.timestamp_ns

        sample_ns = e_ns + halfbit_ns
        remaining_ns = frame_ns + halfbit_ns
        b = 0
        sb = False

        while True:
            # wait for next event
            if l.wait_edge_events(datetime.timedelta(microseconds=remaining_ns/1000)):
                e = l.read_edge_events(1)[0]
                e_ns = e.timestamp_ns
                if e_ns < sample_ns:
                    e_ns += 1000000000

                # process bits since previous event
                while sample_ns < e_ns:
                    if sb == False:
                        if level == 0:
                            sb = True
                        else:
                            # not a start bit, return None
                            print("not a start bit")
                            return
                    elif b < bits:
                        # store data bits
                        data |= level << b
                        b += 1
                    elif stop > 0:
                        # check stop bits
                        if level == 1:
                            stop -= 1
                        else:
                            # invalid stop bit
                            print("invalid stop bits")
                            return
                    sample_ns += fullbit_ns
                    remaining_ns -= fullbit_ns

                # new level going forward
                if e.event_type == e.Type.FALLING_EDGE:
                    level = 0^pol
                else:
                    level = 1^pol

                # check if we are done processing this event
                if remaining_ns < fullbit_ns:
                    # if so, this event is already start of next frame
                    self.pending_e = e
                    break
            else:
                # timeout is end of frame
                if level == 0:
                    # invalid idle state at end of frame
                    print("invalid idle state")
                    return
                # add remaining bits to byte
                while b < bits:
                    data |= level << b
                    b += 1
                stop = 0
                break

        if stop == 0 and b == bits:
            return data
        else:
            # missing stop or data bits
            print("missing stop or data bits")
            return

    def read(self):
        if self.line is None:
            print("Error: no pin connected")
            return
        if gpiod_v == 1:
            return self.read_gpiod1()
        else:
            return self.read_gpiod2()

if __name__ == "__main__":
    gpio = ST_PIN
    if len(sys.argv) > 1:
        # Gpio, info as "GPIOnn", from GUI setup. Sensing the seatalk1 (yellow wire)
        gpio = int("".join(filter(str.isdigit, sys.argv[1])))
    pol = ST_INVERT
    if len(sys.argv) > 2:
        # Invert, inverted input from ST1, selected in the GUI
        if sys.argv[2] == "true":
            pol = 1

    st = st1rx()
    if st.open(pin=gpio, invert=pol) == False:
        print("Error: Failed to open Seatalk1 pin")
        sys.exit()

    try:
        st_msg = ""
        st_start = False
        while True:
            # read a byte from Seatalk pin
            d = st.read()
            # if error, timeout, or start flag is set
            if d is None or d > 255:
                # output pending seatalk data
                if st_start == True:
                    print("$STALK" + st_msg)
                    st_start = False
                    st_msg = ""
            # if new data
            if d is not None:
                # if start flag is set, start a new msg
                if d > 255:
                    st_start = True
                    st_msg = ""
                # if a msg is in progress, append byte
                if st_start == True:
                    st_msg += ",{:02X}".format(d & 0xff)
    except Exception as e:
        print(e)
    except KeyboardInterrupt:
        pass
    st.close()
    print("exit")
`

function GpiodSeatalk(options) {
  const createDebug = options.createDebug || require('debug')
  Execute.call(this, { debug: createDebug('signalk:streams:gpiod-seatalk') })
  this.options = options
  this.options.command = `python -u -c '${cmd}' ${options.gpio} ${options.gpioInvert} `
}

require('util').inherits(GpiodSeatalk, Execute)

module.exports = GpiodSeatalk
