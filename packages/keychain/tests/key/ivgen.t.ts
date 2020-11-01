import "@ndn/packet/test-fixture/expect";

import { CounterIvChecker, CounterIvGen, CounterIvOptions } from "../..";

test.each([
  { fixedType: "uint8array", lenC: 8, lenD: 1 },
  { fixedType: "bigint", lenC: 4, lenD: 5 },
])("CounterIvGen %#", async ({ fixedType, lenC, lenD }) => {
  const ivOpts: CounterIvOptions = {
    ivLength: 4,
    fixedBits: 12,
    fixed: fixedType === "bigint" ? BigInt(0x0597) : Uint8Array.of(0x05, 0x97),
    counterBits: 5,
    blockSize: 4,
  };
  const ivGen = new CounterIvGen(ivOpts);
  const ivChk = new CounterIvChecker(ivOpts);
  const encrypt = ivGen.wrap(({ plaintext, iv }) => Promise.resolve({ ciphertext: plaintext, iv }));

  const { iv: iv00 } = await encrypt({ plaintext: new Uint8Array(4 * 0x18) });
  const extract0 = ivChk.extract(iv00!);
  expect(extract0).toMatchObject({
    fixed: BigInt(0x59700000),
    counter: BigInt(0x00000000),
  });

  const { iv: iv18 } = await encrypt({ plaintext: new Uint8Array(4 * 0x06 - 1) });
  expect(ivChk.extract(iv18!)).toMatchObject({
    fixed: BigInt(0x59700000),
    random: extract0.random,
    counter: BigInt(0x00000018),
  });

  const { iv: iv1E } = await encrypt({ plaintext: new Uint8Array(lenC) });
  expect(ivChk.extract(iv1E!)).toMatchObject({
    fixed: BigInt(0x59700000),
    random: extract0.random,
    counter: BigInt(0x0000001E),
  });

  await expect(encrypt({ plaintext: new Uint8Array(lenD) })).rejects.toThrow();
});
