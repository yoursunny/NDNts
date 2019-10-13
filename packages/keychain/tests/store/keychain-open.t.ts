import { dirSync as tmpDir } from "tmp";

import { KeyChain } from "../../src";
import * as TestKeyChainStore from "../../test-fixture/keychain-store";

let locator: string;
let deleteTmpDir: () => void;

beforeAll(async () => {
  ({ name: locator, removeCallback: deleteTmpDir } = tmpDir({ unsafeCleanup: true }));
});

afterAll(() => {
  deleteTmpDir();
});

test("open store", async () => {
  const keyChain = KeyChain.open(locator);
  const record = await TestKeyChainStore.execute(keyChain);
  TestKeyChainStore.check(record);
});
