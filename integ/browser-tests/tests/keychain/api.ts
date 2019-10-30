import { TestRecord } from "@ndn/keychain/test-fixture/sign-verify";

import { SerializedInBrowser } from "../../test-fixture/serialize";

export type TestResult = [
  TestRecord, // Interest test record
  TestRecord, // Data test record
];

declare global {
  interface Window {
    testDigestKey: () => Promise<SerializedInBrowser>;
    testEcKey: () => Promise<SerializedInBrowser>;
  }
}
