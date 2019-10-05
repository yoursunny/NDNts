import { dir as tmpDir } from "tmp-promise";

import { KeyChain } from "../../src";
import * as TestKeyChainStore from "../../test-fixture/keychain-store";

let locator: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ path: locator, cleanup } = await tmpDir({ unsafeCleanup: true }));
});

afterAll(async () => {
  await cleanup();
});

test("open store", async () => {
  const keyChain = KeyChain.open(locator);
  const record = await TestKeyChainStore.execute(keyChain);
  TestKeyChainStore.check(record);
});
