import "@ndn/name/test-fixture";

import { Forwarder } from "@ndn/fw";
import { Data, Interest } from "@ndn/l3pkt";
import { Name } from "@ndn/name";

import { Endpoint } from "..";

afterEach(() => Forwarder.deleteDefault());

test("retrieve single packet", async () => {
  const ep = new Endpoint();

  const handler = jest.fn<Promise<Data>, [Interest]>();
  handler.mockImplementationOnce(() => Promise.resolve(
    new Data("/A/1", Uint8Array.of(0xC0, 0xC1)),
  ));
  const producer = ep.produce({
    prefix: new Name("/A"),
    handler,
  });

  const data = await ep.consume(new Interest("/A", Interest.CanBePrefix));
  expect(data.name).toEqualName("/A/1");

  producer.close();
  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler.mock.calls[0][0].name).toEqualName("/A");
});

test("retrieve failure without producer", async () => {
  const ep = new Endpoint();
  await expect(ep.consume(new Interest("/A", Interest.Lifetime(20)))).rejects.toThrow(/expire/);
});
