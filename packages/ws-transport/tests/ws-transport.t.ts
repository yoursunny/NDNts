import { Interest } from "@ndn/l3pkt";
import { LLFace } from "@ndn/llface";
import { testTransport } from "@ndn/llface/test-fixture";
import * as http from "http";
import * as net from "net";
import * as rPromise from "remote-controlled-promise";
import WebSocketStream from "websocket-stream";
import * as echoServer from "websocket-stream/echo-server";

import { WsTransport } from "../src";

const ECHO_SERVER = echoServer.url;

test("echo", async () => {
  echoServer.start({});

  const done = rPromise.create();
  const transport = await WsTransport.connect(ECHO_SERVER);
  const face = new LLFace(transport);

  process.nextTick(() => {
    face.sendInterest(new Interest("/A"));
  });

  face.recvInterest.add((interest) => {
    expect(interest.name.toString()).toBe("/A");
    face.close();
    done.resolve(undefined);
  });

  await done.promise;
  echoServer.stop();
});

test("pair", async () => {
  const transportsP = rPromise.create<[WsTransport, WsTransport]>();

  let firstServerStream: WebSocketStream.WebSocketDuplex|undefined;
  const server = http.createServer();
  const wss = WebSocketStream.createServer(
    { server, perMessageDeflate: false },
    ((stream: WebSocketStream.WebSocketDuplex) => {
      if (!firstServerStream) {
        firstServerStream = stream;
        return;
      }
      firstServerStream.pipe(stream);
      stream.pipe(firstServerStream);
    }) as any);
  server.listen(0, "127.0.0.1", async () => {
    const { port } = server.address() as net.AddressInfo;
    const uri = `ws://127.0.0.1:${port}`;
    transportsP.resolve(await Promise.all([
      WsTransport.connect(uri),
      WsTransport.connect(uri),
    ]));
  });

  const [transportA, transportB] = await transportsP.promise;
  expect(transportA).toBeInstanceOf(WsTransport);
  expect(transportB).toBeInstanceOf(WsTransport);
  await testTransport(transportA, transportB);

  wss.close();
  server.close();
});
