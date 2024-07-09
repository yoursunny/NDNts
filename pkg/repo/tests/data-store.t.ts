import "@ndn/packet/test-fixture/expect";

import { Data, Interest, Name } from "@ndn/packet";
import { testDataStoreBasic, testDataStoreSegmentedObject } from "@ndn/repo-api/test-fixture/data-store";
import { Closers, delay } from "@ndn/util";
import { makeTmpDir } from "@ndn/util/test-fixture/tmp";
import { collect, map } from "streaming-iterables";
import { afterEach, expect, test, vi } from "vitest";

import { type DataStore, makeInMemoryDataStore, makePersistentDataStore } from "..";

const closers = new Closers();
afterEach(closers.close);

type Row = [string, () => Promise<DataStore>];
const TABLE: readonly Row[] = [
  ["memory-level", makeInMemoryDataStore],
  ["classic-level", () => {
    const tmpDir = makeTmpDir();
    closers.push(tmpDir);
    return makePersistentDataStore(tmpDir.name);
  }],
];

test.each(TABLE)("basic %s", async (desc, openDataStore) => {
  void desc;
  await using store = await openDataStore();
  await testDataStoreBasic(store);
});

test.each(TABLE)("segmented object %s", async (desc, openDataStore) => {
  await using store = await openDataStore();
  await testDataStoreSegmentedObject(store);
});

test.each(TABLE)("list find expire %s", async (desc, openDataStore) => {
  await using store = await openDataStore();
  if (!desc.endsWith("-level")) {
    await (store as any).db.open(); // workaround to enable .tx()
  }

  const expireTime = Date.now() + 600;
  await Promise.all([
    store.insert(new Data("/A/1")),
    store.insert(new Data("/A/2"), new Data("/B/1")),
    store.tx().insert(new Data("/B/2")).insert(new Data("/C/1"), { expireTime }).commit(),
    store.insert({ expireTime }, new Data("/C/2"), new Data("/C/3")),
  ]);

  await expect(collect(map((data) => data.name, store.listData())))
    .resolves.toEqualNames(["/A/1", "/A/2", "/B/1", "/B/2", "/C/1", "/C/2", "/C/3"]);
  await expect(store.find(new Interest("/C", Interest.CanBePrefix))).resolves.toBeDefined();
  await delay(700);

  await expect(collect(store.listNames()))
    .resolves.toEqualNames(["/A/1", "/A/2", "/B/1", "/B/2"]);
  await expect(collect(store.listNames(new Name("/B"))))
    .resolves.toEqualNames(["/B/1", "/B/2"]);

  await expect(store.get(new Name("/C/1"))).resolves.toBeUndefined();
  await expect(store.find(new Interest("/C", Interest.CanBePrefix))).resolves.toBeUndefined();
  await expect(store.find(new Interest("/A"))).resolves.toBeUndefined();
  await expect(store.find(new Interest("/A/1"))).resolves.toHaveName("/A/1");
  const dataA = await store.find(new Interest("/A", Interest.CanBePrefix));
  expect(dataA).toBeDefined();
  expect(["/8=A/8=1", "/8=A/8=2"]).toContain(dataA!.name.toString());
  await expect(store.find(new Interest("/C", Interest.CanBePrefix))).resolves.toBeUndefined();

  await store.clearExpired();
});

test.each(TABLE)("events %s", async (desc, openDataStore) => {
  void desc;
  await using store = await openDataStore();

  const onInsert = vi.fn<(evt: DataStore.RecordEvent) => void>();
  const onDelete = vi.fn<(evt: DataStore.RecordEvent) => void>();
  store.addEventListener("insert", onInsert);
  store.addEventListener("delete", onDelete);

  await store.insert();
  expect(onInsert).not.toHaveBeenCalled();
  expect(onDelete).not.toHaveBeenCalled();

  await Promise.all([
    store.insert(new Data("/A/1")),
    store.insert(new Data("/A/2"), new Data("/A/3")),
    store.insert(new Data("/A/3")),
    store.delete(new Name("/B/1"), new Name("/B/2")),
  ]);
  expect(onInsert).toHaveBeenCalledTimes(3);
  expect(onInsert.mock.calls.map(([{ name }]) => name)).toEqualNames(["/A/1", "/A/2", "/A/3"]);
  expect(onDelete).not.toHaveBeenCalled();
  onInsert.mockClear();

  await Promise.all([
    store.delete(new Name("/A/1"), new Name("/B/2")),
    store.delete(new Name("/A/3")),
  ]);
  expect(onInsert).not.toHaveBeenCalled();
  expect(onDelete).toHaveBeenCalledTimes(2);
  expect(onDelete.mock.calls.map(([{ name }]) => name)).toEqualNames(["/A/1", "/A/3"]);
});
