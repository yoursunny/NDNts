import { Name } from "@ndn/name";

import { importPrivateKey } from "../../src/key/import";

test("import invalid", async () => {
  await expect(importPrivateKey(new Name("/MY-KEY/KEY/x"), true, {})).rejects.toThrow();
});
