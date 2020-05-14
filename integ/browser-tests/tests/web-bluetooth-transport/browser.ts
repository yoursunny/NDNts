import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { L3Face } from "@ndn/l3face";
import { Interest, Name } from "@ndn/packet";
import { WebBluetoothTransport } from "@ndn/web-bluetooth-transport";

import { addManualTest } from "../../test-fixture/manual";

async function testWebBluetooth() {
  const transport = await WebBluetoothTransport.request();
  const l3face = new L3Face(transport);
  const face = Forwarder.getDefault().addFace(l3face);
  face.addRoute(new Name("/"));

  const endpoint = new Endpoint();
  const names = [] as string[];
  const rtts = [] as number[];
  for (let i = 0; i < 50; ++i) {
    const t0 = Date.now();
    const data = await endpoint.consume(new Interest(`/example/esp8266/ble/ping/${Math.floor(Math.random() * 100000000)}`));
    const t1 = Date.now();
    rtts.push(t1 - t0);
    names.push(data.name.toString());
    await new Promise((r) => setTimeout(r, 10));
  }

  const lines = names.map((name, i) => `${rtts[i]} ${name}`);
  lines.unshift(
    `RTT min=${Math.min(...rtts)}`,
    // eslint-disable-next-line unicorn/no-reduce
    `RTT avg=${rtts.reduce((sum, rtt) => sum + rtt, 0) / rtts.length}`,
    `RTT max=${Math.max(...rtts)}`,
  );
  return lines;
}

addManualTest("test WebBluetoothTransport", testWebBluetooth);
