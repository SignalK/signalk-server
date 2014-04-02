{
    "vessels": [
        {
            "localBoat": {//what to use for uid - mmsi, name, generated id?
                "name": "motu",
                "mmsi": "2345678", 
                "source": "self", //self|AIS|NET
                "timezone": "NZDT",
                "navigation": {
                    "state": {"value": "sailing", "source": "self", "timestamp": "2014-03-24T00:15:41Z" }, //moored|anchored|leaving|motoring|sailing|anchoring|mooring|fishing|drifting|mayday|panpan|mob...
                    
                    "headingTrue": {
                        "value": 23, 
                        "source": "self", 
                        "timestamp": "2014-03-24T00:15:41Z" 
                    },
                    
                    "headingMagnetic": {"value": 43, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    
                    "cogTrue": {
                        "value": 23, 
                        "source": "self", 
                        "timestamp": 
                        "2014-03-24T00:15:41Z" 
                    },
                    
                    "cogMagnetic": {"value": 43, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "declination": {"value": 20, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    
                    "speedOverGround": {
                        "value": 4.5, 
                        "source": "self", 
                        "timestamp": "2014-03-24T00:15:41Z" 
                    },
                    
                    "speedThroughWater": {"value": 4.4, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    
                    "location": {
                        "lat": {
                            "value": -41.6789, 
                            "source": "self", 
                            "timestamp": "2014-03-24T00:15:41Z" 
                        }
                                 
                        "lon":{
                            "value": 173.12345,
                            "source": "self", 
                            "timestamp": "2014-03-24T00:15:41Z" 
                        }
                    }, 
                    
                    "altitude": {"value": 0, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "pitch": {"value": 0.1, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "roll": {"value": 0, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "rateOfTurn": {"value": 0, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "gnss":{
                        "gnssType"       : enum,            // 129029:6
                        "method"         : enum,            // 129029:7
                        "integrity"      : enum,            // 129029:8
                        "fixMode"        : enum,            // 129540:1
                        "satelliteCount" : integer,         // 129029:10(8), 129540:3(8)
                        "satellites" : [
                            {
                                "prn"            : integer, // 129540:4..+7(8)
                                "elevation"      : degrees, // 129540:5..+7(16)
                                "azimuth"        : degrees, // 129540:6..+7(16)
                                "snr"            : dB,      // 129540:7..+7(16)
                                "rangeResiduals" : integer, // 129540:8..+7(32)
                                "status"         : enum,    // 129540:9..+7
                            }
                        ],
                        "dilutionOfPrecision" : {
                            "desiredMode" : enum,           // 129539:1
                            "actualMode"  : enum,           // 129539:2
                            "horizontal"  : float,          // 129029:11(16), 129539:4(16)
                            "vertical"    : float,          //                129539:5(16)
                            "probable"    : float,          // 129029:12(16)
                            "time"        : float,          //                129539:6(16)
                        },
                        "geoidalSeparation"     : meters,   // 129029:13(16)
                        "referenceStationCount" : integer,  // 129029:14(8)
                        "referenceStations"     : [
                            {
                                "stationType"   : enum,     // 129029:15..+3
                                "stationId"     : integer,  // 129029:16..+3
                                "correctionAge" : seconds,  // 129029:17..+3(16)
                        }
                        ]},

                    "currentRoute": {
                        "route": null,
                        "startTime": null,
                        "eta": null,
                        "lastWaypoint": null,
                        "lastWaypointTime": null,
                        "nextWaypoint": null,
                        "nextWaypointEta": null,
                        "directBearing": null,
                        "actualBearing": null,
                        "courseRequired": null,
                        "xte": null },
                    "set": null,
                    "drift": null },
                "communication": {
                    "dscCallsign": "",
                    "vhfCallsign": "ZM2038",
                    "hfCallsign": "ZL3RTH",
                    "hfEmail": "motu@xxx.co.nz",
                    "email": "robert@xxx.co.nz",
                    "cellPhone": "+64xxxxxx",
                    "satPhone": null,
                    "skipperName": "Rob" },
                "environmental": {
                    "depthBelowTransducer",
                    "depthBelowKeel",
                    "depthBelowWater",
                    "depth",
                    "waterLineToTransducer",
                    "transducerToKeel",
                    "waterTemp": {"value": 19.5, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "salinity": {"value": 10, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "highTideHeight": {"value": 4.3, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "highTideTime": {"value": "2014-03-24T12:15:41Z", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "lowTideHeight": {"value": 0.3, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "lowTideTime": {"value": "2014-03-24T00:15:41Z", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "actualTideHeight": {"value": 2.5, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "currentSpeed": {"value": 0.1, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "currentDirection": {"value": 37, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "airTemp": {"value": 28, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "airPressure": {"value": 101.325, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "airPressureChangeRateAlarm": {"value": 0.2, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "humidity": {"value": 73, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "windSpeedTrue": {"value": 12, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "windDirectionTrue": {"value": 233, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "windSpeedApparent": {"value": 15, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "windDirectionApparent": {"value": 275, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "windSpeedAlarm": {"value": 30, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "windDirectionChangeAlarm": {"value": 30, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "gpsSatelliteData": null },
                "alarms": {
                    "silentInterval": {"value": 600, "source": "self", "timestamp": "2014-03-24T00:15:41Z" }, //hit button for temporary silence
                    "windAlarmMethod": {"value": "sound", "source": "self", "timestamp": "2014-03-24T00:15:41Z" }, //message|sound|email|sms|dsc|?
                    "windAlarmState": {"value": "off", "source": "self", "timestamp": "2014-03-24T00:15:41Z" }, //on|off|silent
                    "anchorAlarmMethod": {"value": "sound", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "anchorAlarmState": {"value": "off", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "autopilotAlarmMethod": {"value": "sound", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "autopilotAlarmState": {"value": "off", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "panpanAlarmMethod": {"value": "dsc", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "panpanAlarmState": {"value": "off", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "maydayAlarmMethod": {"value": "dsc", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "maydayAlarmState": {"value": "off", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "fireAlarmMethod": {"value": "sound", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "fireAlarmState": {"value": "off", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "gpsAlarmMethod": {"value": "message", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "gpsAlarmState": {"value": "on", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "gasAlarmMethod": {"value": "sound", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "gasAlarmState": {"value": "off", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "powerAlarmMethod": {"value": "message", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "powerAlarmState": {"value": "off", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "engineAlarmMethod": {"value": "sound", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "engineAlarmState": {"value": "off", "source": "self", "timestamp": "2014-03-24T00:15:41Z" } },
                "power": {
                    "normalVoltage": {"value": 12.9, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "actualVoltage": {"value": 12.8, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "alarmUpperVoltage": {"value": 15, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "alarmLowerVoltage": {"value": 11.9, "source": "self", "timestamp": "2014-03-24T00:15:41Z" } },
                    //....lots more here...
                "propulsion": [
                    {
                        "outboard": {
                            "type": {"value": "petrol", "source": "self", "timestamp": "2014-03-24T00:15:41Z" }, //diesil|petrol|electric|?
                            "state": {"value": "started", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },//stopped|started|unusable
                            "rpm": {"value": 3000, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "rpmAlarm": {"value": 5000, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "engineTemperature": {"value": 75, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "engineTemperatureAlarm": {"value": 90, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "oilTemperature": {"value": 80, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "oilTemperatureAlarm": {"value": 90, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "oilPressure": {"value": 413, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "oilPressureAlarm": {"value": 550, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "waterTemp": {"value": 75, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "waterTempAlarm": {"value": 90, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "exhaustTemp": {"value": 0, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "exhaustTempAlarm": {"value": 0, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "fuelUsageRate": {"value": 3.1, "source": "self", "timestamp": "2014-03-24T00:15:41Z" } } }
                ],
                "tanks": [
                    {
                        "water1": {
                            "type": {"value": "water", "source": "self", "timestamp": "2014-03-24T00:15:41Z" }, //fuel|water|holding|lpg|? wine|beer|rum :-)
                            "capacity": {"value": 100, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "level": {"value": 80.6, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "alarmLevel": {"value": 10, "source": "self", "timestamp": "2014-03-24T00:15:41Z" } },
                        "water2": {
                            "type": {"value": "water", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "capacity": {"value": 150, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "level": {"value": 40.6, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "alarmLevel": {"value": 10, "source": "self", "timestamp": "2014-03-24T00:15:41Z" } },
                        "holding": {
                            "type": {"value": "holding", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "capacity": {"value": 100, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "level": {"value": 80.6, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "alarmLevel": {"value": 90, "source": "self", "timestamp": "2014-03-24T00:15:41Z" } },
                        "petrol": {
                            "type": {"value": "fuel", "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "capacity": {"value": 150, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "level": {"value": 110.6, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                            "alarmLevel": {"value": 20, "source": "self", "timestamp": "2014-03-24T00:15:41Z" } } }
                ],
                "steering": {
                    "rudderAngle": {"value": 0, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "rudderAngleTarget": {"value": 0, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                    "autopilot": {
                        "state": {"value": "on", "source": "self", "timestamp": "2014-03-24T00:15:41Z" }, //on|off|alarm
                        "mode": {"value": "powersave", "source": "self", "timestamp": "2014-03-24T00:15:41Z" }, //powersave|normal|accurate
                        "targetHeadingNorth": {"value": 23, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                        "targetHeadingMagnetic": {"value": 43, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                        "alarmHeadingXte": {"value": 250, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                        "headingSource": {"value": "compass", "source": "self", "timestamp": "2014-03-24T00:15:41Z" }, //compass|wind|gps|?
                        "deadZone": {"value": 5, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                        "backlash": {"value": 3, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                        "gain": {"value": 10, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                        "maxDriveAmps": {"value": 5, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                        "maxDriveRate": {"value": 10, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                        "portLock": {"value": 33, "source": "self", "timestamp": "2014-03-24T00:15:41Z" },
                        "starboardLock": {"value": -33, "source": "self", "timestamp": "2014-03-24T00:15:41Z" } } } } }
    ],
    "charts": [
        {
            "NZ6134": {
                "datum": null,
                "boundary": null,
                "date": null,
                "scale": null,
                "url": null } }
    ],
    "waypoints": [
        {
            "Nelson": {
                "uid": null,
                "name": null,
                "location": { lat":null,lon":null,}
                "comment": null,
                "type": "location",  //location|fish|anchor|hazard|rock|bar|?
                "source": null } 
    ],
    "regions": [
        {
            "Mussel Farm": {
                "uid": null,
                "name": null,
                "comment": null, "source": null,
                "type": "hazard", //hazard|safe|reserve|?
                "boundary": [ 
                    {"uid": null }, //waypoints
                    { "uid": null },
                    { "uid": null },
                    { "uid": null }
                ] } }
    ],
    "routes": [
        {
            "Nelson-Anchorage": { 
                "uid": null,
                "name": null,
                "comment": null, "source": null,
                "distance": 0,
                "waypoints": [
                    { "uid": null },
                    { "uid": null },
                    { "uid": null },
                    { "uid": null },
                    { "uid": null },
                    { "uid": null },
                    { "uid": null },
                    { "uid": null }
                ] } }
    ] }