

What
===============
A TCP/IP Channel fork Eric Smekens' [node-bluetooth-obd](https://github.com/EricSmekens/node-bluetooth-obd) library. I've not tested whether my mods
have adversely affected BT. It might have, but in general, I've tried to re-use Eric's approach, including
using his queue to moderate rate. There is redundant code at the moment that needs cleanup.

Testing
==========
So far, I've only tested this with the [TCP server fork of OBDSim](https://github.com/oesmith/obdgpslogger)  and it seems to work well.

I run `obdsim` as follows:
```
obdsim -T 5000 -g Cycle
```
This runs `obdsim` on port 5000 on my mac and I can then connect to it using this library.

**NOTE that this only works on a real device as it needs a cordova plugin for a TCP socket**

See [HERE](https://github.com/hsccorp/obd-tcp-test) for a working ionic app that uses this library

Installation
=============
```
npm install https://github.com/hsccorp/node-bluetooth-tcp-obd --save
```

You will also need to install this cordova plugin in your app to initiate a TCP connection
```
cordova plugin add cz.blocshop.socketsforcordova
```


Example Code
-------------

See [HERE](https://github.com/hsccorp/obd-tcp-test) for an example ionic2 app

```typescript
export class MyComponent {
  constructor(public navCtrl: NavController, public plt: Platform) {
           plt.ready().then(() => {
          console.log ("Platform ready, instantiating OBD");
        
            var OBDReader = require ('obd-bluetooth-tcp');
            wifiOBDReader = new OBDReader();

            wifiOBDReader.on ('debug' , function (data) {console.log ("=>APP DEBUG:"+ data)});
            wifiOBDReader.on ('error' , function (data) {console.log ("=>APP ERROR:"+ data)});
            wifiOBDReader.setProtocol(0);

            wifiOBDReader.autoconnect("TCP","192.168.1.103:5000");

            wifiOBDReader.on ('connected', function () {
            console.log ("=>APP: Connected");
            this.addPoller("temp");
            this.addPoller("vss");
            this.startPolling(2000); //Request  values every 2 second.

            wifiOBDReader.on ('dataReceived', function (data) {
              console.log ("=>APP: Received Data="+JSON.stringify(data));
            })


          }); // conneceted

        }); // ready
       } // constructor

  } // class
```


## API

### OBDReader

#### Event: ('dataReceived', data)

Emitted when data is read from the OBD-II connector.

* data - the data that was read and parsed to a reply object

#### Event: ('connected')

Emitted when the connection is set up (port is open).

#### Event: ('error', message)

Emitted when an error is encountered.

#### Event: ('debug', message)

Emitted with debugging information.

#### OBDReader()

Creates an instance of OBDReader.

#### getPIDObjectByName (Name)

Returns all the details of a PID for a given name - this does not write to the ODB dongle - it only returns preconfigured values in the library array representing the PID objects

#### getPIDByName(Name)

Find a PID-value by name.

##### Params: 

* **name** *Name* of the PID you want the hexadecimal (in ASCII text) value of.

##### Return:

* **string** PID in hexadecimal ASCII

#### parseOBDCommand(hexString)

Parses a hexadecimal string to a reply object. Uses PIDS. (obdInfo.js)

##### Params: 

* **string** *hexString* Hexadecimal value in string that is received over the serialport.

##### Return:

* **Object** reply - The reply.
* **string** reply.value - The value that is already converted. This can be a PID converted answer or &quot;OK&quot; or &quot;NO DATA&quot;.
* **string** reply.name - The name. --! Only if the reply is a PID.
* **string** reply.mode - The mode of the PID. --! Only if the reply is a PID.
* **string** reply.pid - The PID. --! Only if the reply is a PID.

#### autoconnect(type?, query)

if type == 'TCP' then it connects using TCP and query needs to be "host:port". If you omit type, or use any other value,then it falls back to BT.
If BT:
Attempt discovery of the device based on a query string, and call connect() on the first match.

##### Params:

 * **string** *query* (Optional) string to be matched against address/channel (fuzzy-ish)

#### connect(address, channel) [do not use for TCP]

Connect/Open the serial port and add events to serialport. Also starts the intervalWriter that is used to write the queue.

##### Params:

 * **string** *address* MAC-address of device that will be connected to.
 * **number** *channel* Channel that the serial port service runs on.

#### disconnect()

Disconnects/closes the port.

#### write(message, replies)

Writes a message to the port. (Queued!) All write functions call this function.

##### Params: 

* **string** *message* The PID or AT Command you want to send. Without \r or \n!
* **number** *replies* The number of replies that are expected. Default = 0. 0 --> infinite

#### requestValueByName(name)

Writes a PID value by entering a pid supported name.

##### Params: 

* **string** *name* Look into obdInfo.js for all PIDS.

#### addPoller(name)

Adds a poller to the poller-array.

##### Params: 

* **string** *name* Name of the poller you want to add.

#### removePoller(name)

Removes an poller.

##### Params: 

* **string** *name* Name of the poller you want to remove.

#### removeAllPollers()

Removes all pollers.

#### writePollers()

Writes all active pollers.

#### startPolling()

Starts polling. Lower interval than activePollers * 50 will probably give buffer overflows.

##### Params:

* **number** *interval* Frequency how often all variables should be polled. (in ms) If no value is given, then for each activePoller 75ms will be added.

#### stopPolling()

Stops polling.

# LICENSE

This module is available under a [Apache 2.0 license](http://www.apache.org/licenses/LICENSE-2.0.html), see also the [LICENSE file](https://raw.github.com/EricSmekens/node-bluetooth-obd/master/LICENSE) for details.
