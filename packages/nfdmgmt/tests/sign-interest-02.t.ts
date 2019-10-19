import { theDigestKey } from "@ndn/keychain";
import { Interest, TT } from "@ndn/l3pkt";
import { Decoder } from "@ndn/tlv";

import { signInterest02 } from "../src";

test("simple", async () => {
  const interest = new Interest("/A");
  await expect(signInterest02(interest, { signer: theDigestKey })).resolves.toBe(interest);
  expect(interest.name).toHaveLength(5);
  expect(new Decoder(interest.name.at(-2).value).read().type).toBe(TT.DSigInfo);
  expect(new Decoder(interest.name.at(-1).value).read().type).toBe(TT.DSigValue);
});
