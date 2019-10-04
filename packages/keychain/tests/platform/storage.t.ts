import { dir as tmpDir } from "tmp-promise";

import { openStorage } from "../../src/platform";
import * as TestStorage from "../../test-fixture/storage";

let locator: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ path: locator, cleanup } = await tmpDir({ unsafeCleanup: true }));
});

afterAll(async () => {
  await cleanup();
});

test("CertStore", async () => {
  const [, certStore] = openStorage(locator);
  const record = await TestStorage.execute(certStore);
  TestStorage.check(record);
});
