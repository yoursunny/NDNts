import "@ndn/packet/test-fixture/expect";

import { ValidityPeriod } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import { expect, test } from "vitest";

import { PrefixAnn, TT } from "..";

test("encode decode", async () => {
  const vp = new ValidityPeriod(Date.UTC(2018, 9, 30, 0, 0, 0), Date.UTC(2018, 10, 24, 23, 59, 59));
  const pa = await PrefixAnn.build({
    announced: "/A",
    expirationPeriod: 3600000,
    validityPeriod: vp,
    cost: 1,
  });

  expect(pa.announced).toEqualName("/A");
  expect(pa.expirationPeriod).toBe(3600000);
  expect(pa.validityPeriod).toBeDefined();
  expect(pa.cost).toBe(1);

  expect(pa.data.content).toMatchTlv(
    ({ type, nni }) => {
      expect(type).toBe(TT.ExpirationPeriod);
      expect(nni).toBe(3600000);
    },
    ({ tlv }) => {
      expect(tlv).toEqualUint8Array(Encoder.encode(vp));
    },
    ({ type, nni }) => {
      expect(type).toBe(TT.Cost);
      expect(nni).toBe(1);
    },
  );
});
