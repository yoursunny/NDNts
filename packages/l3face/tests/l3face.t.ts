import { Forwarder } from "@ndn/fw";
import { Interest } from "@ndn/packet";

import { L3Face } from "..";
import { MockTransport } from "../test-fixture/mock-transport";

test("l3face", async () => {
  const fw = Forwarder.create();

  const transport = new MockTransport({ local: true });
  const face = fw.addFace(new L3Face(transport));
  expect(face.attributes.advertiseFrom).toBeFalsy();
  expect(face.attributes.local).toBeTruthy();

  const close = jest.fn<void, []>();
  face.on("close", close);

  transport.recv(new Interest("/A", Interest.Lifetime(20)));
  await new Promise((r) => setTimeout(r, 50));
  expect(transport.sent).toHaveLength(0);

  transport.close();
  await new Promise((r) => setTimeout(r, 50));
  expect(close).toHaveBeenCalledTimes(1);

  // other tests in node-transport/tests/l3face.t.ts
});
