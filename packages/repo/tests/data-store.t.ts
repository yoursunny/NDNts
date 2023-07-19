import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Data, Interest, Name } from "@ndn/packet";
import { BufferChunkSource, fetch, serve } from "@ndn/segmented-object";
import { makeObjectBody } from "@ndn/segmented-object/test-fixture/object-body";
import { delay } from "@ndn/util";
import { collect, map } from "streaming-iterables";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { DataStore } from "..";
import { makeDataStore } from "../test-fixture/data-store";

let store: DataStore;
beforeEach(async () => {
  store = await makeDataStore();
  return async () => { await store.close(); };
});

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
  afterEach(Endpoint.deleteDefaultForwarder);

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

test("events", async () => {
  const onInsert = vi.fn<[DataStore.RecordEvent], void>();
  const onDelete = vi.fn<[DataStore.RecordEvent], void>();
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
