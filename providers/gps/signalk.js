var nmea = require('nmea');
var _ = require('lodash');

module.exports = self = {

	K: {
		vessels: [
			{
				localBoat: {}
			}
		]
	},

	merges: 0,

	mergeIntoLocalBoat: function(path, mergedata) {
		var localBoat = self.K.vessels[0].localBoat;

		if(typeof localBoat[path] === 'undefined') {
			var obj = localBoat[path] = {};
		} else {
			var obj = localBoat[path];
		}

		_.merge(obj, mergedata);
		self.merges++;
	},

	getK: function() {
		return _.clone(self.K, true);
	},

	timestampToUTCDate: function(timestamp, date) {
		/* 
			- timestamp is in the format HHMMSS, and is an UTC time
			- date is in the format DDMMYY, and is an UTC date
		*/

		var timearr = timestamp.split('.');
		timestamp = timearr[0];

		var hours, minutes, seconds, day, month, year;
		// Time
		hours 	= timestamp.slice(0, -4);
		minutes = timestamp.slice(2, -2);
		seconds = parseFloat(timestamp.slice(-2) + '.' + timearr[1]);
		// Date
		day 	= date.slice(0, -4);
		month 	= date.slice(2, -2);
		year 	= date.slice(-2);
		curYear = ("" + new Date().getFullYear());

		return (curYear.slice(0, curYear.length - 2) + year) + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds;
	},

	coordsToDec: function(value, pole) {
		// N 5222.3277 should be read as 52°22.3277'
		// E 454.5824 should be read as 4°54.5824'
		//
		// 1. split at .
		// 2. last two characters of split[0] (.slice(-2)) + everything after . (split[1]) are the minutes
		// 3. degrees: split[0][a]
		// 4. minutes: split[0][b] + '.' + split[1]
		//
		// 52°22'19.662'' N -> 52.372128333
		// 4°54'34.944'' E -> 4.909706667
		// S & W should be negative. 

		pole = pole.toUpperCase();

		var split 	= value.split('.');
		var degrees = parseFloat(split[0].slice(0, -2));
		var minsec 	= parseFloat(split[0].slice(-2) + '.' + split[1]);
		var decimal = parseFloat(degrees + (minsec / 60));

		if (pole == "S" || pole == "W") {
			decimal *= -1;
		}
		
		return decimal;
	},

	parse: function(sentence) {
		var src 	= nmea.parse(sentence);
		var data 	= {};
		var report 	= false;

		if(src.type == 'nav-info') {
			report = true;

			data.location = {
				lat: {
					value: self.coordsToDec(src.lat, src.latPole),
					source: {
						timestamp: self.timestampToUTCDate(src.timestamp, src.date),
						type: 'nmea',
						id: 'self'
					}
				},

				lon: {
					value: self.coordsToDec(src.lon, src.lonPole),
					source: {
						timestamp: self.timestampToUTCDate(src.timestamp, src.date),
						type: 'nmea',
						id: 'self'
					}
				}
			};

			data.speedOverGround = {
				value: parseFloat(src.speedKnots),
				source: {
					timestamp: self.timestampToUTCDate(src.timestamp, src.date),
					type: 'nmea',
					id: 'self'
				}
			};

			data.cogTrue = {
				value: parseFloat(src.trackTrue),
				source: {
					timestamp: self.timestampToUTCDate(src.timestamp, src.date),
					type: 'nmea',
					id: 'self'
				}
			};
		}

		if(src.type == 'track-info') {
			report = true;

			// track-info doesn't have src.timestamp or src.date.

			data.speedOverGround = {
				value: parseFloat(src.speedKnots),
				source: {
					timestamp: null,
					type: 'nmea',
					id: 'self'
				}
			};

			data.cogTrue = {
				value: parseFloat(src.trackTrue),
				source: {
					timestamp: null,
					type: 'nmea',
					id: 'self'
				}
			};

			data.cogMagnetic = {
				value: parseFloat(src.trackMagnetic),
				source: {
					timestamp: null,
					type: 'nmea',
					id: 'self'
				}
			};
		}
		//*/
		
		if(report === true) {
			self.mergeIntoLocalBoat('navigation', data);
		}

		if(self.merges > 0) {
			return self.getK();
		} else {
			return null;
		}

	}
};