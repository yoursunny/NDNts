import { Endpoint } from "@ndn/endpoint";
import type { FwFace } from "@ndn/fw";
import { Name } from "@ndn/packet";
import { QuicTransport } from "@ndn/quic-transport";
import { WebBluetoothTransport } from "@ndn/web-bluetooth-transport";

import { addManualTest } from "../../test-fixture/manual";

async function facePing(facePromise: Promise<FwFace>, pingPrefix: string) {
  const face = await facePromise;
  face.addRoute(new Name("/"));

  const endpoint = new Endpoint();
  const names = [] as string[];
  const rtts = [] as number[];
  for (let i = 0; i < 50; ++i) {
    const t0 = Date.now();
    const data = await endpoint.consume(`${pingPrefix}/${Math.floor(Math.random() * 1e9)}`);
    const t1 = Date.now();
    rtts.push(t1 - t0);
    names.push(data.name.toString());
    await new Promise((r) => setTimeout(r, 10));
  }

  const lines = names.map((name, i) => `${rtts[i]} ${name}`);
  lines.unshift(
    `RTT min=${Math.min(...rtts)}`,
    `RTT avg=${rtts.reduce((sum, rtt) => sum + rtt, 0) / rtts.length}`,
    `RTT max=${Math.max(...rtts)}`,
  );
  return lines;
}

function testWebBluetooth() {
  return facePing(WebBluetoothTransport.createFace({}), "/example/esp8266/ble/ping");
}

async function testQuic() {
  document.body.innerHTML = `
    <form>
    QUIC gateway:
    <code>quic-transport://</code><input type="text" placeholder="localhost"><code>:6367/ndn</code>
    <button>OK</button>
    </form>
  `;
  const $form = document.querySelector("form");
  const gateway = await new Promise((resolve) => {
    $form!.addEventListener("submit", (evt) => {
      evt.preventDefault();
      resolve(document.querySelector("input")!.value);
      document.body.innerHTML = "";
    });
  });
  return facePing(QuicTransport.createFace({}, `quic-transport://${gateway}:6367/ndn`), "/example/quic/ping");
}

addManualTest("test WebBluetoothTransport", testWebBluetooth);
addManualTest("test QuicTransport", testQuic);
