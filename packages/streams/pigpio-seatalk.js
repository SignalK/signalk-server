/*
 *
 * prototype-server: An implementation of a Signal K server for boats.
 * Copyright (C) 2020 Teppo Kurki <teppo.kurki@iki.fi> *et al*.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * 2020-06-24 Original Python code from @Thomas-GeDaD https://github.com/Thomas-GeDaD/Seatalk1-Raspi-reader
 * and finetuned by @MatsA
 *
 */

import { Execute } from './execute'
import createDebug from 'debug'
import { inherits } from 'util'

const cmd = `
import pigpio, time, signal, sys

if  sys.argv[1] == "undefined":
        gpio = 4					                            #Default GPIO4 if not set
else:
        #Ggpio, info as "GPIOnn", from GUI setup. Sensing the seatalk1 (yellow wire)
        try:
                gpio = int(filter(str.isdigit, sys.argv[1])) #python2
        except:
                gpio = int("".join(filter(str.isdigit, sys.argv[1]))) #python3

if __name__ == "__main__":
        st1read =pigpio.pi()

        try:
                st1read.bb_serial_read_close(gpio) #close if already run
        except:
                pass

        st1read.bb_serial_read_open(gpio, 4800,9)

        if  sys.argv[2] == "true":			        # Invert, inverted input from ST1, selected in the GUI
                st1read.bb_serial_invert(gpio, 1)

        data=""

        try:
                while True:
                        out=(st1read.bb_serial_read(gpio))
                        out0=out[0]
                        if out0>0:
                                out_data=out[1]
                                x=0
                                while x < out0:
                                        if out_data[x+1] ==0:
                                                if out_data[x] > 15:
                                                  string1=str(hex(out_data[x]))
                                                elif out_data[x] ==0:
                                                  string1="0x00"
                                                else:
                                                  string1="0x0"+str(hex(out_data[x]).lstrip("0x"))
                                                data= data+string1[2:]+ ","
                                        else:
                                                data=data[0:-1]
                                                data="$STALK,"+data
                                                print (data)
                                                string2=str(hex(out_data[x]))
                                                string2_new=string2[2:]
                                                if len(string2_new)==1:
                                                        string2_new="0"+string2_new
                                                data=string2_new + ","
                                        x+=2
                        time.sleep(0.01)
        except:
                st1read.bb_serial_read_close(gpio)
                print ("exit")
`

export default function PigpioSeatalk(options) {
  const debug = (options.createDebug || createDebug)(
    'signalk:streams:pigpio-seatalk'
  )
  Execute.call(this, { debug })
  this.options = options
  this.options.command = `python -u -c '${cmd}' ${options.gpio} ${options.gpioInvert} `
}

inherits(PigpioSeatalk, Execute)
