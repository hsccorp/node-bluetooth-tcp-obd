/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * (C) Copyright 2013, TNO
 * Author: Eric Smekens
 * 
 */

 // modified on Aug 28, 2017 to support TCP 

'use strict';

//Used for event emitting.
var EventEmitter = require('events').EventEmitter;
var util = require('util');

/**
 * obdInfo.js for all PIDS.
 * @type {*}
 */
var PIDS = require('../lib/obdInfo.js');

/**
 * Constant for defining delay between writes.
 * @type {number}
 */
var writeDelay = 50;

/**
 * Queue for writing
 * @type {Array}
 */
var queue = [];

// Class OBDReader
var OBDReader;

/**
 * Creates an instance of OBDReader.
 * @constructor
 * @param {string} address MAC-address of device that will be connected to.
 * @param {number} channel Channel that the serial port service runs on.
 * @this {OBDReader}
 */
OBDReader = function () {
    EventEmitter.call(this);
    this.connected = false;
    this.receivedData = "";
    this.protocol = '0';
    this.connType = '';
    return this;
};
util.inherits(OBDReader, EventEmitter);
/**
 * Find a PID-value by name.
 * @param name Name of the PID you want the hexadecimal (in ASCII text) value of.
 * @return {string} PID in hexadecimal ASCII
 */
function getPIDByName(name) {
    var i;
    for (i = 0; i < PIDS.length; i++) {
        if (PIDS[i].name === name) {
            if (PIDS[i].pid !== undefined) {
                return (PIDS[i].mode + PIDS[i].pid);
            }
            //There are modes which don't require a extra parameter ID.
            return (PIDS[i].mode);
        }
    }
}

/**
 * Parses a hexadecimal string to a reply object. Uses PIDS. (obdInfo.js)
 * @param {string} hexString Hexadecimal value in string that is received over the serialport.
 * @return {Object} reply - The reply.
 * @return {string} reply.value - The value that is already converted. This can be a PID converted answer or "OK" or "NO DATA".
 * @return {string} reply.name - The name. --! Only if the reply is a PID.
 * @return {string} reply.mode - The mode of the PID. --! Only if the reply is a PID.
 * @return {string} reply.pid - The PID. --! Only if the reply is a PID.
 */
function parseOBDCommand(hexString) {
    var reply,
        byteNumber,
        valueArray; //New object

    reply = {};
    if (hexString === "NO DATA" || hexString === "OK" || hexString === "?" || hexString === "UNABLE TO CONNECT" || hexString === "SEARCHING...") {
        //No data or OK is the response, return directly.
        reply.value = hexString;
        return reply;
    }

    hexString = hexString.replace(/ /g, ''); //Whitespace trimming //Probably not needed anymore?
    valueArray = [];

    for (byteNumber = 0; byteNumber < hexString.length; byteNumber += 2) {
        valueArray.push(hexString.substr(byteNumber, 2));
    }

    if (valueArray[0] === "41") {
        reply.mode = valueArray[0];
        reply.pid = valueArray[1];
        for (var i = 0; i < PIDS.length; i++) {
            if (PIDS[i].pid == reply.pid) {
                var numberOfBytes = PIDS[i].bytes;
                reply.name = PIDS[i].name;
                switch (numberOfBytes) {
                    case 1:
                        reply.value = PIDS[i].convertToUseful(valueArray[2]);
                        break;
                    case 2:
                        reply.value = PIDS[i].convertToUseful(valueArray[2], valueArray[3]);
                        break;
                    case 4:
                        reply.value = PIDS[i].convertToUseful(valueArray[2], valueArray[3], valueArray[4], valueArray[5]);
                        break;
                    case 8:
                        reply.value = PIDS[i].convertToUseful(valueArray[2], valueArray[3], valueArray[4], valueArray[5], valueArray[6], valueArray[7], valueArray[8], valueArray[9]);
                        break;
                }
                break; //Value is converted, break out the for loop.
            }
        }
    } else if (valueArray[0] === "43") {
        reply.mode = valueArray[0];
        for (var i = 0; i < PIDS.length; i++) {
            if (PIDS[i].mode == "03") {
                reply.name = PIDS[i].name;
                reply.value = PIDS[i].convertToUseful(valueArray[1], valueArray[2], valueArray[3], valueArray[4], valueArray[5], valueArray[6]);
            }
        }
    }
    return reply;
}
/**
 *  Converts a UTF8 Array to a string. cordova sockets returns a UTF8 array 
 * @param {*} array 
 */

 // http://www.onicos.com/staff/iz/amuse/javascript/expert/utf.txt

/* utf.js - UTF-8 <=> UTF-16 convertion
 *
 * Copyright (C) 1999 Masanao Izumo <iz@onicos.co.jp>
 * Version: 1.0
 * LastModified: Dec 25 1999
 * This library is free.  You can redistribute it and/or modify it.
 */

function Utf8ArrayToStr(array) {
    var out, i, len, c;
    var char2, char3;

    out = "";
    len = array.length;
    i = 0;
    while(i < len) {
    c = array[i++];
    switch(c >> 4)
    { 
      case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
        // 0xxxxxxx
        out += String.fromCharCode(c);
        break;
      case 12: case 13:
        // 110x xxxx   10xx xxxx
        char2 = array[i++];
        out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
        break;
      case 14:
        // 1110 xxxx  10xx xxxx  10xx xxxx
        char2 = array[i++];
        char3 = array[i++];
        out += String.fromCharCode(((c & 0x0F) << 12) |
                       ((char2 & 0x3F) << 6) |
                       ((char3 & 0x3F) << 0));
        break;
    }
    }

    return out;
}

/**
 * converts from string to Utf8 Array - used by TCP sockets
 * @param {*} dataString 
 */

function strToUtf8Array(dataString) {
    var data = new Uint8Array(dataString.length);
    for (var i = 0; i < data.length; i++) {
        data[i] = dataString.charCodeAt(i);
    }
    return data;
}

/**
 * Initializes the ODB channel with the right AT commands
 * @param {*} instance 
 */
function initComms (instance) {
    var self = instance;
    self.write('ATZ');
    //Turns off extra line feed and carriage return
    self.write('ATL0');
    //This disables spaces in in output, which is faster!
    self.write('ATS0');
    //Turns off headers and checksum to be sent.
    self.write('ATH0');
    //Turns off echo.
    self.write('ATE0');
    //Turn adaptive timing to 2. This is an aggressive learn curve for adjusting the timeout. Will make huge difference on slow systems.
    self.write('ATAT2');
    //Set timeout to 10 * 4 = 40msec, allows +20 queries per second. This is the maximum wait-time. ATAT will decide if it should wait shorter or not.
    //self.write('ATST0A');
    //http://www.obdtester.com/elm-usb-commands
    self.write('ATSP' + self.protocol);
}

/**
 * Set the protocol version number to use with your car.  Defaults to 0
 * which is to autoselect.
 *
 * Uses the ATSP command - see http://www.obdtester.com/elm-usb-commands
 *
 * @default 0
 * 
 */
OBDReader.prototype.setProtocol = function (protocol) {
    if (protocol.toString().search(/^[0-9]$/) === -1) {
        throw "setProtocol: Must provide a number between 0 and 9 - refer to ATSP section of http://www.obdtester.com/elm-usb-commands";
    }
    this.protocol = protocol;
}

/**
 * Get the protocol version number set for this object.  Defaults to 0
 * which is to autoselect.
 *
 * Uses the ATSP command - see http://www.obdtester.com/elm-usb-commands
 *
 */
OBDReader.prototype.getProtocol = function () {
    return this.protocol;
}


/**
 * returns full PID object for name. Useful to get details like min/max/description for display/processing purposes
 */
OBDReader.prototype.getPIDObjectByName = function (name) {
    
    var i;
    for (i = 0; i < PIDS.length; i++) {
        if (PIDS[i].name == name) {
            break;
        }
    }
    return (i < PIDS.length ? PIDS[i]:undefined);
    
    }


/**
 * called by autoconnect if you wanted TCP
 * Don't know why I need to pass a this instance from one prototype to the other
 * but if I don't, the this instance is wrong. Let's chalk this up to my inxperience
 * 
 * url is of the format "host:port" (note this is TCP, so no url scheme)
 */ 
OBDReader.prototype.autoconnectTCP = function (url, instance) {
    var self = instance;
    self.emit('debug', 'TCP autoconnect called');
    var hp = url.split(':');
    var OBDSocket = new Socket();
    self.emit("Opening socket for:" + hp[0] + ":" + hp[1]);
    OBDSocket.open(hp[0], parseInt(hp[1]),
        function (succ) {
            self.connected = true;
            self.onTCPConnect();
            initComms(self);
            self.emit('connected');
        },
        function (err) {
            self.emit ("debug","OBDSocket open error. setting connection false");
            self.connected = false;
            self.onTCPError(err)
        });
    OBDSocket.onData = function (data) {
        self.onTCPEvent(data, self)
    };
    OBDSocket.onClose = function (data) {
        self.emit ("debug","OBDSocket onClose called. setting connection false");
        self.connected = false;
        self.onTCPDisconnect(data)
    };
    OBDSocket.onError = function (data) {
        self.emit ("debug","OBDSocket onError called. setting connection false");
        
        self.connected = false;
        self.onTCPError(data);
    };

    
    this.OBDSocket = OBDSocket; // save connection
    self.emit('debug', 'queue writer interval started');
    this.intervalWriter = setInterval(function () {
        if (queue.length > 0 && self.connected) {
            try {

                var data = queue.shift();
                self.OBDSocket.write(strToUtf8Array(data));

            } catch (err) {
                self.emit('error', 'Error while writing: ' + err);
                self.emit('error', 'OBD-II Listeners deactivated, connection is probably lost.');
                
               
            }
        }

    }, writeDelay); //Updated with Adaptive Timing on ELM327. 20 queries a second seems good enough.


}


// private
OBDReader.prototype.onTCPConnect = function () {
    this.emit("debug", "Connected to TCP dongle");

}

// private
OBDReader.prototype.onTCPError = function (data) {
   
    this.emit('error', "TCP Error: " + JSON.stringify(data));

}

// private
// receives UTF8 data from the OBD TCP socket and parses it
OBDReader.prototype.onTCPEvent = function (u8data, instance) {
    var data = Utf8ArrayToStr(u8data);
    var self = this;
    var currentString, arrayOfCommands;
    currentString = self.receivedData + data.toString('utf8'); // making sure it's a utf8 string

    arrayOfCommands = currentString.split('>');

    var forString;
    if (arrayOfCommands.length < 2) {
        self.receivedData = arrayOfCommands[0];
    } else {
        for (var commandNumber = 0; commandNumber < arrayOfCommands.length; commandNumber++) {
            forString = arrayOfCommands[commandNumber];
            if (forString === '') {
                continue;
            }

            var multipleMessages = forString.split('\r');
            for (var messageNumber = 0; messageNumber < multipleMessages.length; messageNumber++) {
                var messageString = multipleMessages[messageNumber];
                if (messageString === '') {
                    continue;
                }
                var reply;
                reply = parseOBDCommand(messageString);
                //Event dataReceived.
                self.emit('dataReceived', reply);
                self.receivedData = '';
            }
        }
    }


}

// private
OBDReader.prototype.onTCPDisconnect = function () {
    this.emit ('debug', 'TCP disconnected');

}

/**
 * wrapper function that either connects via bluetooth (default) or TCP
 * depending on the 'type' that is passed
 */
OBDReader.prototype.autoconnect = function (type='bluetooth', parameter) {
    this.connType = type;
    if (type == "TCP")
        OBDReader.prototype.autoconnectTCP(parameter, this);
    else
         OBDReader.prototype.autoconnectBluetooth(parameter, this)
     
}

/**
 * Attempts discovery of and subsequent connection to Bluetooth device and channel
 * @param {string} query Query string to be fuzzy-ish matched against device name/address
 */
OBDReader.prototype.autoconnectBluetooth = function (query, instance) {
    console.log("Autoconnect bluetooth called");
    var self = instance; //Enclosure
    var btSerial = new(require('bluetooth-serial-port')).BluetoothSerialPort();
    var search = new RegExp(query.replace(/\W/g, ''), 'gi');

    btSerial.on('found', function (address, name) {
        var addrMatch = !query || address.replace(/\W/g, '').search(search) != -1;
        var nameMatch = !query || name.replace(/\W/g, '').search(search) != -1;

        if (addrMatch || nameMatch) {
            btSerial.removeAllListeners('finished');
            btSerial.removeAllListeners('found');
            self.emit('debug', 'Found device: ' + name + ' (' + address + ')');

            btSerial.findSerialPortChannel(address, function (channel) {
                self.emit('debug', 'Found device channel: ' + channel);
                self.connect(address, channel);
            }, function (err) {
                console.log("Error finding serialport: " + err);
            });
        } else {
            self.emit('debug', 'Ignoring device: ' + name + ' (' + address + ')');
        }
    });

    btSerial.on('finished', function () {
        self.emit('error', 'No suitable devices found');
    });

    btSerial.inquire();
}

/**
 * Connect/Open the bluetooth serial port and add events to bluetooth-serial-port.
 * Also starts the intervalWriter that is used to write the queue.
 * @this {OBDReader}
 */
OBDReader.prototype.connect = function (address, channel) {
    var self = this; //Enclosure
    var btSerial = new(require('bluetooth-serial-port')).BluetoothSerialPort();

    btSerial.connect(address, channel, function () {
        self.connected = true;

        initComms(self);

        //Event connected
        self.emit('connected');

        btSerial.on('data', function (data) {
            var currentString, arrayOfCommands;
            currentString = self.receivedData + data.toString('utf8'); // making sure it's a utf8 string

            arrayOfCommands = currentString.split('>');

            var forString;
            if (arrayOfCommands.length < 2) {
                self.receivedData = arrayOfCommands[0];
            } else {
                for (var commandNumber = 0; commandNumber < arrayOfCommands.length; commandNumber++) {
                    forString = arrayOfCommands[commandNumber];
                    if (forString === '') {
                        continue;
                    }

                    var multipleMessages = forString.split('\r');
                    for (var messageNumber = 0; messageNumber < multipleMessages.length; messageNumber++) {
                        var messageString = multipleMessages[messageNumber];
                        if (messageString === '') {
                            continue;
                        }
                        var reply;
                        reply = parseOBDCommand(messageString);
                        //Event dataReceived.
                        self.emit('dataReceived', reply);
                        self.receivedData = '';
                    }
                }
            }
        });

        btSerial.on('failure', function (error) {
            self.emit('error', 'Error with OBD-II device: ' + error);
        });

    }, function (err) { //Error callback!
        self.emit('error', 'Error with OBD-II device: ' + err);
    });

    this.btSerial = btSerial; //Save the connection in OBDReader object.

    this.intervalWriter = setInterval(function () {

        if (queue.length > 0 && self.connected)
            try {


                self.btSerial.write(new Buffer(queue.shift(), "utf-8"), function (err, count) {
                    if (err)
                        self.emit('error', err);
                });


            } catch (err) {
                self.emit('error', 'Error while writing: ' + err);
                self.emit('error', 'OBD-II Listeners deactivated, connection is probably lost.');
                clearInterval(self.intervalWriter);
                self.removeAllPollers();
            }
    }, writeDelay); //Updated with Adaptive Timing on ELM327. 20 queries a second seems good enough.

    return this;
};

/**
 * Disconnects/closes the port.
 *
 * @param {Function} cb Callback function when the serial connection is closed
 * @this {OBDReader}
 */
OBDReader.prototype.disconnect = function (cb) {
    clearInterval(this.intervalWriter);
    queue.length = 0; //Clears queue
    if (typeof cb === 'function') {
        this.btSerial.on('closed', cb);
    }
    if (this.connType == 'bluetooth') this.btSerial.close()
    else {
        this.OBDSocket.close();
        
        this.emit ("debug","OBDSocket disconnect called. setting connection false");
        console.log ("OBDSocket disconnect called. setting connection false");
    }
    this.connected = false;
};



/**
 * Writes a message to the port. (Queued!) All write functions call this function.
 * @this {OBDReader}
 * @param {string} message The PID or AT Command you want to send. Without \r or \n!
 * @param {number} replies The number of replies that are expected. Default = 0. 0 --> infinite
 * AT Messages --> Zero replies!!
 */
OBDReader.prototype.write = function (message, replies) {
    
    if (replies === undefined) {
        replies = 0;
    }
    //console.log("Queue write called with " + message);
    //console.log ("Inside write, with qlen="+queue.length+ " connected="+this.connected)
    if (this.connected) {
        if (queue.length < 256) {
            if (replies !== 0) {
                queue.push(message + replies + '\r');
            } else {
                queue.push(message + '\r');
            }
        } else {
            this.emit('error', 'Queue-overflow!');
        }
    } else {
        this.emit('error', ' device is not connected.');
        clearInterval(self.intervalWriter);
        self.removeAllPollers();
    }
};
/**
 * Writes a PID value by entering a pid supported name.
 * @this {OBDReader}
 * @param {string} name Look into obdInfo.js for all PIDS.
 */
OBDReader.prototype.requestValueByName = function (name) {
    this.write(getPIDByName(name));
};



var activePollers = [];
/**
 * Adds a poller to the poller-array.
 * @this {OBDReader}
 * @param {string} name Name of the poller you want to add.
 */
OBDReader.prototype.addPoller = function (name) {
    var stringToSend = getPIDByName(name);
    activePollers.push(stringToSend);
};
/**
 * Removes an poller.
 * @this {OBDReader}
 * @param {string} name Name of the poller you want to remove.
 */
OBDReader.prototype.removePoller = function (name) {
    var stringToDelete = getPIDByName(name);
    var index = activePollers.indexOf(stringToDelete);
    activePollers.splice(index, 1);
};
/**
 * Removes all pollers.
 * @this {OBDReader}
 */
OBDReader.prototype.removeAllPollers = function () {
      activePollers.length = 0; //This does not delete the array, it just clears every element.
};


OBDReader.prototype.getNumPollers = function () {
    return activePollers.length;
};


/**
 * Writes all active pollers.
 * @this {OBDReader}
 */
OBDReader.prototype.writePollers = function () {
    var i;
    for (i = 0; i < activePollers.length; i++) {
        this.write(activePollers[i], 1);
    }
};

var pollerInterval;
/**
 * Starts polling. Lower interval than activePollers * 50 will probably give buffer overflows. See writeDelay.
 * @this {OBDReader}
 * @param {number} interval Frequency how often all variables should be polled. (in ms). If no value is given, then for each activePoller 75ms will be added.
 */
OBDReader.prototype.startPolling = function (interval) {
    if (interval === undefined) {
        interval = activePollers.length * (writeDelay * 2); //Double the delay, so there's room for manual requests.
    }

    var self = this;
    pollerInterval = setInterval(function () {
        self.writePollers();
    }, interval);
};
/**
 * Stops polling.
 * @this {OBDReader}
 */
OBDReader.prototype.stopPolling = function () {
    clearInterval(pollerInterval);
};

var exports = module.exports = OBDReader;