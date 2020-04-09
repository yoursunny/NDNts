import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Version } from "@ndn/naming-convention2";
import { Interest, Name } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";

import { Metadata, serveMetadata } from "..";

afterEach(() => Endpoint.deleteDefaultForwarder());

test("serve simple", async () => {
  const name = new Name("/D").append(Version, 2);
  const p = serveMetadata({ name });

  const endpoint = new Endpoint();
  const [data] = await Promise.all([
    endpoint.consume(new Interest("/D/32=metadata", Interest.CanBePrefix, Interest.MustBeFresh)),
    expect(endpoint.consume(new Interest("/D/32=metadata", Interest.CanBePrefix,
      Interest.Lifetime(100)))).rejects.toThrow(),
    expect(endpoint.consume(new Interest("/D/32=metadata", Interest.MustBeFresh,
      Interest.Lifetime(100)))).rejects.toThrow(),
    expect(endpoint.consume(new Interest(new Name("/D/32=metadata").append(Version, 4),
      Interest.CanBePrefix, Interest.MustBeFresh,
      Interest.Lifetime(100)))).rejects.toThrow(),
  ]);

  expect(data.name).toHaveLength(4);
  expect(data.freshnessPeriod).toBe(1);
  const name2 = new Decoder(data.content).decode(Name);
  expect(name2).toEqualName(name);

  p.close();
});

test("serve with prefix", async () => {
  const name = new Name("/D").append(Version, 2);
  const makeMetadata = jest.fn<Metadata, []>().mockReturnValue({ name });
  const p = serveMetadata(makeMetadata, { prefix: "/R", freshnessPeriod: 100 });

  const data = await new Endpoint().consume(new Interest("/R/32=metadata", Interest.CanBePrefix, Interest.MustBeFresh));
  expect(data.name).toHaveLength(4);
  expect(data.freshnessPeriod).toBe(100);
  const name2 = new Decoder(data.content).decode(Name);
  expect(name2).toEqualName(name);

  expect(makeMetadata).toHaveBeenCalled();
  p.close();
});
