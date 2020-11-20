import "../test-fixture/expect";

import { Encoder } from "@ndn/tlv";

import { FwHint } from "..";

test("empty", () => {
  let fh = new FwHint();
  expect(fh.delegations).toHaveLength(0);
  expect(Encoder.encode(fh)).toEncodeAs([]);

  fh = FwHint.decodeValue(new Uint8Array());
  expect(fh.delegations).toHaveLength(0);
});

test("deduplicate reorder", () => {
  const fh = new FwHint([
    new FwHint.Delegation("/A", 20),
    new FwHint.Delegation("/B", 30),
    new FwHint.Delegation("/C", 10),
    new FwHint.Delegation("/A", 21),
  ]);
  const dels = fh.delegations;
  expect(dels).toHaveLength(3);
  expect(dels[0]).toHaveName("/C");
  expect(dels[0]!.preference).toBe(10);
  expect(dels[1]).toHaveName("/A");
  expect(dels[1]!.preference.toString()).toMatch(/^2[01]$/);
  expect(dels[2]).toHaveName("/B");
  expect(dels[2]!.preference).toBe(30);
});
