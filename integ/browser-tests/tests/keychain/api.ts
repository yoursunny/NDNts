import type { EcCurve, RsaModulusLength } from "@ndn/keychain";
import { TestRecord as CertStoreRecord } from "@ndn/keychain/test-fixture/cert-store";
import { TestRecord as KeyStoreRecord } from "@ndn/keychain/test-fixture/key-store";
import { TestRecord as SignVerifyRecord } from "@ndn/packet/test-fixture/sign-verify";

import { SerializedInBrowser } from "../../test-fixture/serialize";

export type SignVerifyTestResult = [
  SignVerifyRecord, // Interest test record
  SignVerifyRecord, // Data test record
];

declare global {
  interface Window {
    testKeyStore: () => Promise<KeyStoreRecord>;
    testCertStore: () => Promise<CertStoreRecord>;
    testDigestSigning: () => Promise<SerializedInBrowser>;
    testECDSA: (curve: EcCurve) => Promise<SerializedInBrowser>;
    testRSA: (modulusLength: RsaModulusLength) => Promise<SerializedInBrowser>;
    testHMAC: () => Promise<SerializedInBrowser>;
  }
}
