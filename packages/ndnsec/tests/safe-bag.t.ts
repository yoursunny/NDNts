import "@ndn/packet/test-fixture/expect";

import { CertNaming, KeyChain } from "@ndn/keychain";
import { SigType } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";

import { SafeBag } from "..";

const SAFEBAG_BASE64 = `
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
BMjAe5hnto0rUAqJCCxips+lqOtOTA==
`;

const PASSPHRASE = "0ERFKHiLTsgxBJPAnxJg";

test("import", async () => {
  const decoder = new Decoder(Buffer.from(SAFEBAG_BASE64, "base64"));
  const safeBag = SafeBag.decodeFrom(decoder);
  expect(safeBag.certificate.name).toEqualName("/b75ca858-4871-4473-90df-9ad3caaf4d39/KEY/%5B%FEu%FF%B7%BE%A8%ED/self/%FD%00%00%01r%873%0Cd");

  expect(() => safeBag.decryptKey("wrong-passphrase")).toThrow();

  const keyChain = KeyChain.createTemp();
  await expect(safeBag.saveKeyPair(PASSPHRASE, keyChain)).resolves.toBeUndefined();

  const pvt = await keyChain.getKey(CertNaming.toKeyName(safeBag.certificate.name), "signer");
  expect(pvt.sigType).toBe(SigType.Sha256WithRsa);
});
