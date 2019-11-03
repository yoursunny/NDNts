import { Name } from "@ndn/name";

import { loadPvtExport } from "../../src/key/import";

test("import invalid", async () => {
  await expect(loadPvtExport(new Name("/MY-KEY/KEY/x"), { kty: "X" })).rejects.toThrow();
});
