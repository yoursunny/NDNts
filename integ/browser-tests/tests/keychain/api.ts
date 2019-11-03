import { TestRecord as CertStoreRecord } from "@ndn/keychain/test-fixture/cert-store";
import { TestRecord as KeyStoreRecord } from "@ndn/keychain/test-fixture/key-store";
import { TestRecord as SignVerifyRecord } from "@ndn/keychain/test-fixture/sign-verify";

import { SerializedInBrowser } from "../../test-fixture/serialize";

export type SignVerifyTestResult = [
  SignVerifyRecord, // Interest test record
  SignVerifyRecord, // Data test record
];

declare global {
  interface Window {
    testKeyStore: () => Promise<KeyStoreRecord>;
    testCertStore: () => Promise<CertStoreRecord>;
    testDigestKey: () => Promise<SerializedInBrowser>;
    testEcKey: () => Promise<SerializedInBrowser>;
  }
}
