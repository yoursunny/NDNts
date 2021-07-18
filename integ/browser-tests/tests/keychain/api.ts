import type { EcCurve, RsaModulusLength } from "@ndn/keychain";
import { TestRecord as CertStoreRecord } from "@ndn/keychain/test-fixture/cert-store";
import { TestRecord as KeyStoreRecord } from "@ndn/keychain/test-fixture/key-store";
import { TestRecord as SignVerifyRecord } from "@ndn/packet/test-fixture/sign-verify";

import type * as Serialize from "../../test-fixture/serialize";

export type SignVerifyTestResult = [
  SignVerifyRecord, // Interest test record
  SignVerifyRecord, // Data test record
];

declare global {
  interface Window {
    testKeyStore: () => Promise<KeyStoreRecord>;
    testCertStore: () => Promise<CertStoreRecord>;
    testDigestSigning: () => Promise<Serialize.Value<SignVerifyTestResult>>;
    testECDSA: (curve: EcCurve) => Promise<Serialize.Value<SignVerifyTestResult>>;
    testRSA: (modulusLength: RsaModulusLength) => Promise<Serialize.Value<SignVerifyTestResult>>;
    testHMAC: () => Promise<Serialize.Value<SignVerifyTestResult>>;
    testSafeBag: (wire: Serialize.Value<Uint8Array>, passphrase: string) => Promise<[sigType: number, certName: string]>;
  }
}
