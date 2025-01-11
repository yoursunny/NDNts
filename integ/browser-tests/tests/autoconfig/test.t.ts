import "./api";

import { beforeEach, expect, test } from "vitest";

import { navigateToPage, pageInvoke } from "../../test-fixture/pptr";

beforeEach(() => navigateToPage(import.meta));

test("connectToNetwork", async () => {
  const record = await pageInvoke<typeof globalThis.testConnectToNetwork>("testConnectToNetwork");
  expect(record.faces.length).toBeGreaterThan(0);
});
