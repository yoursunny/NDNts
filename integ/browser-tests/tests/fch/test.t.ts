import { getPageUri, pageInvoke } from "../../test-fixture";

import "./api";

test("connectToTestbed", async () => {
  await page.goto(getPageUri(__dirname));
  const record = await pageInvoke<typeof window.testFch>(page, "testFch");
  expect(record.faces.length).toBeGreaterThan(0);
});
