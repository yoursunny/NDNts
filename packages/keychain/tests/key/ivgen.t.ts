import "@ndn/packet/test-fixture/expect";

import { toHex } from "@ndn/tlv";

import { CounterIvGen } from "../..";

test.each([32, 31])("CounterIvGen %#", async (cnt4) => {
  const ivGen = new CounterIvGen({
    ivLength: 4,
    fixedBits: 12,
    fixed: Uint8Array.of(0x05, 0x97),
    counterBits: 5,
    blockSize: 4,
  });
  const encrypt = ivGen.wrap(({ plaintext, iv }) => Promise.resolve({ ciphertext: plaintext, iv }));

  const { iv: iv0 } = await encrypt({ plaintext: new Uint8Array(12) });
  const { iv: iv3 } = await encrypt({ plaintext: new Uint8Array(7) });
  const { iv: iv5 } = await encrypt({ plaintext: new Uint8Array((cnt4 - 5) * 4) });
  await expect(encrypt({ plaintext: new Uint8Array((32 - cnt4) * 4 + 1) }))
    .rejects.toThrow(/counter overflow/);

  const ivToNumber = (iv?: Uint8Array): number => {
    expect(iv).toBeDefined();
    expect(iv).toHaveLength(4);
    return Number.parseInt(toHex(iv!), 16);
  };

  const n0 = ivToNumber(iv0);
  const n3 = ivToNumber(iv3);
  const n5 = ivToNumber(iv5);
  expect(n0 >> 20).toBe(0x597);
  expect(n3 >> 20).toBe(0x597);
  expect(n5 >> 20).toBe(0x597);
  expect((n3 >> 5) & 0x7FFF).toBe((n0 >> 5) & 0x7FFF);
  expect((n5 >> 5) & 0x7FFF).toBe((n0 >> 5) & 0x7FFF);
  expect(n3 & 0x1F).toBe((n0 & 0x1F) + 3);
  expect(n5 & 0x1F).toBe((n0 & 0x1F) + 5);
});
