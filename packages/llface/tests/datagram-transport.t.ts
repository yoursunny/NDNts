import { ObjectReadableMock } from "stream-mock";
import { collect } from "streaming-iterables";

import { DatagramTransport } from "../src";
import { makeDuplex, makeTransportPair } from "../test-fixture/pair";
import * as TestTransport from "../test-fixture/transport";

test("simple", async () => {
  const [tA, tB] = makeTransportPair(DatagramTransport);
  TestTransport.check(await TestTransport.execute(tA, tB));
});

test("drop RX incomplete TLV", async () => {
  const rxRemote = new ObjectReadableMock([
    Buffer.from([0xF0, 0x01]),
  ]);
  const transport = new DatagramTransport(makeDuplex(rxRemote, undefined));
  await expect(collect(transport.rx)).resolves.toHaveLength(0);
});
