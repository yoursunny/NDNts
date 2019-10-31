import "@ndn/tlv/test-fixture";

import { Interest, TT } from "@ndn/l3pkt";

import { signInterest02 } from "../src";

test("simple", async () => {
  const interest = new Interest("/A");
  await expect(signInterest02(interest)).resolves.toBe(interest);
  expect(interest.name).toHaveLength(5);
  expect(interest.name.at(-2).value).toMatchTlv(
    ({ type }) => expect(type).toBe(TT.DSigInfo),
  );
  expect(interest.name.at(-1).value).toMatchTlv(
    ({ type }) => expect(type).toBe(TT.DSigValue),
  );
});
