import { Name } from "@ndn/name";

import { loadFromStored } from "../../src/key/load";

test("load invalid", async () => {
  await expect(loadFromStored(new Name("/MY-KEY/KEY/x"), {
    type: "X",
    isJwk: true,
    pvt: { kty: "X", d: "" },
    pub: { kty: "X" },
  })).rejects.toThrow();
});
