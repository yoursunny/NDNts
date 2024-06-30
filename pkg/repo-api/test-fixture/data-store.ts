import "@ndn/packet/test-fixture/expect";

import { Forwarder } from "@ndn/fw";
import { Data, Interest, Name, type NameLike } from "@ndn/packet";
import { BufferChunkSource, fetch, serve } from "@ndn/segmented-object";
import { makeObjectBody } from "@ndn/segmented-object/test-fixture/object-body";
import { collect, map } from "streaming-iterables";
import { expect } from "vitest";

import type { DataStore as S } from "..";

export async function testDataStoreBasic(store: S.Insert & Partial<S.ListNames & S.ListData & S.Get & S.Find & S.Delete>): Promise<void> {
  const checkNames = async (prefix: NameLike | undefined, positive: Iterable<NameLike>, negative: Iterable<NameLike> = []) => {
    prefix = prefix ? Name.from(prefix) : undefined;
    if (store.listNames) {
      await expect(collect(store.listNames(prefix))).resolves.toEqualNames(positive);
    }
    if (store.listData) {
      await expect(collect(map((data) => data.name, store.listData(prefix))))
        .resolves.toEqualNames(positive);
    }
    if (store.get) {
      for (const name of positive) {
        await expect(store.get(Name.from(name))).resolves.toHaveName(name);
      }
      for (const name of negative) {
        await expect(store.get(Name.from(name))).resolves.toBeUndefined();
      }
    }
    if (store.find) {
      for (const name of positive) {
        await expect(store.find(new Interest(name))).resolves.toHaveName(name);
      }
      for (const name of negative) {
        await expect(store.find(new Interest(name))).resolves.toBeUndefined();
      }
    }
  };

  await store.insert(new Data("/A/1"), new Data("/A/2"));
  await checkNames(undefined, ["/A/1", "/A/2"], ["/B/1", "/B/2"]);

  await store.insert(new Data("/B/3"), (async function*() {
    yield new Data("/B/2");
    yield new Data("/B/1");
  })());
  await checkNames(undefined, ["/A/1", "/A/2", "/B/1", "/B/2", "/B/3"]);
  await checkNames("/A", ["/A/1", "/A/2"]);
  await checkNames("/B", ["/B/1", "/B/2", "/B/3"]);

  if (!store.delete) {
    return;
  }
  await store.delete(new Name("/A/0"), new Name("/A/1"), new Name("/B/3"));
  await checkNames(undefined, ["/A/2", "/B/1", "/B/2"], ["/A/0", "/B/3"]);
}

export async function testDataStoreSegmentedObject(store: S.ListNames & S.Insert): Promise<void> {
  const fw = Forwarder.create();
  const body = makeObjectBody(500 * 25);
  const producer = serve("/S", new BufferChunkSource(body, { chunkSize: 500 }), { pOpts: { fw } });
  await store.insert(fetch("/S", { fw }));
  producer.close();
  await expect(collect(store.listNames())).resolves.toHaveLength(25);
}
