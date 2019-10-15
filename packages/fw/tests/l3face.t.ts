import { L3Face } from "@ndn/l3face";
import { makeTransportPair } from "@ndn/l3face/test-fixture/pair";
import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import { Name } from "@ndn/name";

import { Forwarder } from "../src";

test("l3face", async () => {
  const [transportA0, transportA1] = makeTransportPair();
  const [transportB0, transportB1] = makeTransportPair();

  const fw = Forwarder.create();
  const faceA = fw.addFace(new L3Face(transportA0));
  const faceB = fw.addFace(new L3Face(transportB0));
  faceB.addRoute(new Name("/"));
  faceA.on("close", () => faceB.close());

  TestTransport.check(await TestTransport.execute(transportA1, transportB1));
});
