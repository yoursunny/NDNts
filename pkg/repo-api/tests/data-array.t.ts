import "@ndn/packet/test-fixture/expect";

import { test } from "vitest";

import { DataArray } from "..";
import { testDataStoreBasic, testDataStoreSegmentedObject } from "../test-fixture/data-store";

test("basic", async () => {
  const store = new DataArray();
  await testDataStoreBasic(store);
});

test("segmented object", async () => {
  const store = new DataArray();
  await testDataStoreSegmentedObject(store);
});
