import "./api";

import { navigateToPage, pageInvoke } from "../../test-fixture/pptr";

beforeEach(() => navigateToPage(__dirname));

test("connectToNetwork", async () => {
  const record = await pageInvoke<typeof window.testConnectToNetwork>(page, "testConnectToNetwork");
  expect(record.faces.length).toBeGreaterThan(0);
});
