import "web-bluetooth";

import { L3Face, rxFromPacketIterable, Transport } from "@ndn/l3face";
import EventIterator from "event-iterator";
import throat from "throat";

const UUID_SVC = "099577e3-0788-412a-8824-395084d97391";
const UUID_CS = "cc5abb89-a541-46d8-a351-2f95a6a81f49";
const UUID_SC = "972f9527-0d83-4261-b95d-b1b2fc73bde4";

function equalDataView(a: DataView, b: DataView): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  const lastWord = a.byteLength - a.byteLength % 8;
  for (let i = 0; i < lastWord; i += 8) {
    if (a.getBigUint64(i) !== b.getBigUint64(i)) {
      return false;
    }
  }
  for (let i = lastWord; i < a.byteLength; ++i) {
    if (a.getUint8(i) !== b.getUint8(i)) {
      return false;
    }
  }
  return true;
}

/** Web Bluetooth transport. */
export class WebBluetoothTransport extends Transport {
  public override readonly rx: Transport.Rx;
  private mutex: (f: () => Promise<void>) => Promise<void>;

  private constructor(
      private readonly server: BluetoothRemoteGATTServer,
      private readonly cs: BluetoothRemoteGATTCharacteristic,
      sc: BluetoothRemoteGATTCharacteristic,
      rxPolling: boolean,
  ) {
    super({
      describe: `WebBluetoothTransport(${server.device.id})`,
    });

    let rxLast = new DataView(new ArrayBuffer(0));
    if (rxPolling) {
      this.mutex = throat(1);
      void (async () => {
        while (rxPolling) { // eslint-disable-line no-unmodified-loop-condition
          await new Promise((r) => setTimeout(r, 50));
          try {
            await sc.readValue();
          } catch {}
        }
      })();
    } else {
      this.mutex = (f) => f();
    }

    this.rx = rxFromPacketIterable(new EventIterator<Uint8Array>(
      ({ push, stop }) => {
        const pushHandler = (evt: Event) => {
          const value = (evt.target as BluetoothRemoteGATTCharacteristic).value;
          if (!value || (rxPolling && equalDataView(rxLast, value))) {
            return;
          }
          rxLast = value;
          push(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        };

        const stopHandler = () => {
          rxPolling = false;
          stop();
        };

        sc.addEventListener("characteristicvaluechanged", pushHandler);
        server.device.addEventListener("gattserverdisconnected", stopHandler);

        return () => {
          sc.removeEventListener("characteristicvaluechanged", pushHandler);
          server.device.removeEventListener("gattserverdisconnected", stopHandler);
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
        await this.mutex(() => this.cs.writeValue(pkt));
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

    let rxPolling = false;
    try {
      await sc.startNotifications();
    } catch {
      rxPolling = true;
    }
    return new WebBluetoothTransport(server, cs, sc, rxPolling);
  }
}

export namespace WebBluetoothTransport {
  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(WebBluetoothTransport.request);
}
