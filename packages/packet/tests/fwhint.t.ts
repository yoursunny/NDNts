import "../test-fixture/expect";

import { Decoder } from "@ndn/tlv";

import { FwHint } from "..";

test("empty", () => {
  let fh = new FwHint();
  expect(fh.delegations).toHaveLength(0);
  expect(fh).toEncodeAs([]);

  fh = FwHint.decodeValue(new Decoder(new Uint8Array()));
  expect(fh.delegations).toHaveLength(0);
});
