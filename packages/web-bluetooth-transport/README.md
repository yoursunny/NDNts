# @ndn/web-bluetooth-transport

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements a Bluetooth Low Energy (BLE) client transport using [Web Bluetooth API](https://developers.google.com/web/updates/2015/07/interact-with-ble-devices-on-the-web).
The protocol is compatible with [esp8266ndn](https://github.com/yoursunny/esp8266ndn) `BleServerTransport` class, summarized in the next section.

This package supports Chrome browser only.
Tested combinations:

* Chrome on Windows 10 as client, nRF52832 as server: works.
* Chrome on Windows 10 as client, ESP32 as server: does not work, exception in `Characteristic.startNotifications()`.
* Chrome on Android as client, nRF52832 as server: does not work, [insufficient MTU](https://github.com/WebBluetoothCG/web-bluetooth/issues/284#issuecomment-244738626).

## NDN-BLE protocol

This protocol defines how to exchange NDN packets over Bluetooth Low Energy (BLE), between a BLE server (aka peripheral) and a BLE client (aka central).

The server and client should negotiate the maximum possible MTU.
This protocol does not define a fragmentation scheme.

The server must provide a primary service, **NDN-BLE service**.
Its UUID is 099577e3-0788-412a-8824-395084d97391.
This service shall contain two characteristics: CS and SC.

**CS characteristic** enables client-to-server transmission.
Its UUID is cc5abb89-a541-46d8-a351-2f95a6a81f49.
To transmit a packet from client to server, the client shall write a value to this characteristic.

**SC characteristic** enables server-to-client transmission.
Its UUID is 972f9527-0d83-4261-b95d-b1b2fc73bde4.
The client should enable notifications on this characteristic.
To transmit a packet from server to client, the server shall write a value to this characteristic, then initiate a notification.
