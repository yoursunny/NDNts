import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Data, Interest, Name } from "@ndn/packet";
import { BufferChunkSource, fetch, serve } from "@ndn/segmented-object";
import { makeObjectBody } from "@ndn/segmented-object/test-fixture/object-body";
import { collect, map } from "streaming-iterables";

import type { DataStore } from "..";
import { makeDataStore } from "../test-fixture/data-store";

let store: DataStore;
beforeEach(async () => store = await makeDataStore());
afterEach(() => store.close());

test("insert get delete", async () => {
  await store.insert(new Data("/A/1"), new Data("/A/2"));
  await expect(store.get(new Name("/A/0"))).resolves.toBeUndefined();
  await expect(store.get(new Name("/A/1"))).resolves.toHaveName("/A/1");
  await expect(store.get(new Name("/A/2"))).resolves.toHaveName("/A/2");

  const dataA1 = await store.get(new Name("/A/1"));
  await store.insert(dataA1!);

  await store.delete(new Name("/A/0"), new Name("/A/1"));
  await expect(store.get(new Name("/A/0"))).resolves.toBeUndefined();
  await expect(store.get(new Name("/A/1"))).resolves.toBeUndefined();
  await expect(store.get(new Name("/A/2"))).resolves.toHaveName("/A/2");
});

describe("segmented object", () => {
  afterEach(() => Endpoint.deleteDefaultForwarder());

  test("insert", async () => {
    const body = makeObjectBody(500 * 25);
    const producer = serve("/S", new BufferChunkSource(body, { chunkSize: 500 }));
    await store.insert(fetch("/S"));
    producer.close();
    await expect(collect(store.listNames())).resolves.toHaveLength(25);
  });
});

test("list find expire", async () => {
  const expireTime = Date.now() + 600;
  await Promise.all([
    store.insert(new Data("/A/1")),
    store.insert(new Data("/A/2"), new Data("/B/1")),
    store.tx().insert(new Data("/B/2")).insert(new Data("/C/1"), { expireTime }).commit(),
    store.insert({ expireTime }, new Data("/C/2"), new Data("/C/3")),
  ]);

  let names = await collect(map((data) => data.name.toString(), store.listData()));
  names.sort((a, b) => a.localeCompare(b));
  expect(names).toEqual(["/8=A/8=1", "/8=A/8=2", "/8=B/8=1", "/8=B/8=2", "/8=C/8=1", "/8=C/8=2", "/8=C/8=3"]);

  await expect(store.find(new Interest("/C", Interest.CanBePrefix))).resolves.toBeDefined();
  await new Promise((r) => setTimeout(r, 700));

  names = await collect(map((name) => name.toString(), store.listNames()));
  names.sort((a, b) => a.localeCompare(b));
  expect(names).toEqual(["/8=A/8=1", "/8=A/8=2", "/8=B/8=1", "/8=B/8=2"]);

  names = await collect(map((name) => name.toString(), store.listNames(new Name("/B"))));
  names.sort((a, b) => a.localeCompare(b));
  expect(names).toEqual(["/8=B/8=1", "/8=B/8=2"]);

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

test("events", async () => {
  const onInsert = jest.fn<void, [Name]>();
  const onDelete = jest.fn<void, [Name]>();
  store.on("insert", onInsert);
  store.on("delete", onDelete);

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
  let names = onInsert.mock.calls.map(([name]) => name.toString());
  names.sort((a, b) => a.localeCompare(b));
  expect(names).toEqual(["/8=A/8=1", "/8=A/8=2", "/8=A/8=3"]);
  expect(onDelete).not.toHaveBeenCalled();
  onInsert.mockClear();

  await Promise.all([
    store.delete(new Name("/A/1"), new Name("/B/2")),
    store.delete(new Name("/A/3")),
  ]);
  expect(onInsert).not.toHaveBeenCalled();
  expect(onDelete).toHaveBeenCalledTimes(2);
  names = onDelete.mock.calls.map(([name]) => name.toString());
  names.sort((a, b) => a.localeCompare(b));
  expect(names).toEqual(["/8=A/8=1", "/8=A/8=3"]);
});
