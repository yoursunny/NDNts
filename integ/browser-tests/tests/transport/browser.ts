import { Endpoint } from "@ndn/endpoint";
import { FwFace, FwTracer } from "@ndn/fw";
import { Name } from "@ndn/packet";
import { H3Transport } from "@ndn/quic-transport";
import { WebBluetoothTransport } from "@ndn/web-bluetooth-transport";

import { addManualTest } from "../../test-fixture/manual";

FwTracer.enable();

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

async function testH3() {
  document.body.innerHTML = `
    <form>
    HTTP3 router:
    <input type="text" name="router" value="https://localhost:6367/ndn">
    <br>
    ping:
    <input type="text" name="prefix" value="/example/quic/ping">
    <br>
    <button>OK</button>
    </form>
  `;
  const $form = document.querySelector("form")!;
  const [router, prefix] = await new Promise((resolve) => {
    $form.addEventListener("submit", (evt) => {
      evt.preventDefault();
      resolve([
        document.querySelector<HTMLInputElement>("input[name=router]")!.value,
        document.querySelector<HTMLInputElement>("input[name=prefix]")!.value,
      ]);
      document.body.innerHTML = "";
    });
  });
  return facePing(H3Transport.createFace({}, router), prefix);
}

addManualTest("test WebBluetoothTransport", testWebBluetooth);
addManualTest("test H3Transport", testH3);
