import { TestRecord as StoreTestRecord } from "@ndn/keychain/test-fixture/keychain-store";
import { TestRecord as SignVerifyRecord } from "@ndn/keychain/test-fixture/sign-verify";

import { SerializedInBrowser } from "../../test-fixture/serialize";

export type SignVerifyTestResult = [
  SignVerifyRecord, // Interest test record
  SignVerifyRecord, // Data test record
];

declare global {
  interface Window {
    testStore: () => Promise<StoreTestRecord>;
    testDigestKey: () => Promise<SerializedInBrowser>;
    testEcKey: () => Promise<SerializedInBrowser>;
  }
}
