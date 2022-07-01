// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- `import "web-bluetooth"` would show up in JavaScript output
/// <reference types="web-bluetooth"/>

import { L3Face, rxFromPacketIterable, Transport } from "@ndn/l3face";
import { asUint8Array } from "@ndn/util";
import EventIterator from "event-iterator";

const UUID_SVC = "099577e3-0788-412a-8824-395084d97391";
const UUID_CS = "cc5abb89-a541-46d8-a351-2f95a6a81f49";
const UUID_SC = "972f9527-0d83-4261-b95d-b1b2fc73bde4";

/** Web Bluetooth transport. */
export class WebBluetoothTransport extends Transport {
  public override readonly rx: Transport.Rx;

  private constructor(
      private readonly server: BluetoothRemoteGATTServer,
      private readonly cs: BluetoothRemoteGATTCharacteristic,
      sc: BluetoothRemoteGATTCharacteristic,
  ) {
    super({
      describe: `WebBluetoothTransport(${server.device.id})`,
    });

    this.rx = rxFromPacketIterable(new EventIterator<Uint8Array>(
      ({ push, stop }) => {
        const handleCharacteristicChanged = (evt: Event) => {
          const value = (evt.target as BluetoothRemoteGATTCharacteristic).value;
          if (!value) {
            return;
          }
          push(asUint8Array(value));
        };

        sc.addEventListener("characteristicvaluechanged", handleCharacteristicChanged);
        server.device.addEventListener("gattserverdisconnected", stop);

        return () => {
          sc.removeEventListener("characteristicvaluechanged", handleCharacteristicChanged);
          server.device.removeEventListener("gattserverdisconnected", stop);
        };
      },
    ));
  }

  public close() {
    this.server.device.gatt!.disconnect();
  }

  public override readonly tx = async (iterable: AsyncIterable<Uint8Array>): Promise<void> => {
    try {
      for await (const pkt of iterable) {
        await this.cs.writeValue(pkt);
      }
    } finally {
      this.close();
    }
  };

  /** Request for a connection. */
  public static async request() {
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [UUID_SVC] },
      ],
    });
    if (!device.gatt) {
      throw new Error("GATT is unavailable");
    }
    const server = await device.gatt.connect();
    const svc = await server.getPrimaryService(UUID_SVC);
    const cs = await svc.getCharacteristic(UUID_CS);
    const sc = await svc.getCharacteristic(UUID_SC);
    await sc.startNotifications();
    return new WebBluetoothTransport(server, cs, sc);
  }
}

export namespace WebBluetoothTransport {
  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(WebBluetoothTransport.request);
}
