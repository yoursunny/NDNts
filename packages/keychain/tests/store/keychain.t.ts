import { KeyChain } from "../../src";
import * as TestKeyChainStore from "../../test-fixture/keychain-store";

test("temp store", async () => {
  const keyChain = KeyChain.createTemp();
  const record = await TestKeyChainStore.execute(keyChain);
  TestKeyChainStore.check(record);
});
