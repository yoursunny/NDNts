import { Forwarder } from "@ndn/fw";
import { Interest } from "@ndn/packet";
import { delay } from "@ndn/util";
import { expect, test, vi } from "vitest";

import { L3Face } from "..";
import { MockTransport } from "../test-fixture/mock-transport";

test("l3face", async () => {
  const fw = Forwarder.create();

  const transport = new MockTransport({ local: true });
  const face = fw.addFace(new L3Face(transport));
  expect(face.attributes.advertiseFrom).toBeFalsy();
  expect(face.attributes.local).toBeTruthy();

  const close = vi.fn<() => void>();
  face.addEventListener("close", close);

  transport.recv(new Interest("/A", Interest.Lifetime(20)));
  await delay(50);
  expect(transport.sent).toHaveLength(0);

  transport.close();
  await delay(50);
  expect(close).toHaveBeenCalledOnce();

  // other tests in node-transport/tests/l3face.t.ts
});
