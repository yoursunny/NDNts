import "@ndn/packet/test-fixture/expect";

import { Data, Interest, Name, NameLike } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import memdown from "memdown";
import { collect, map } from "streaming-iterables";

import { DataStore } from "..";

let store: DataStore;

beforeEach(() => {
  store = new DataStore(memdown());
});

afterEach(() => store.close());

function makeData(name: NameLike, content: Uint8Array = new Uint8Array()): Data {
  const data = new Data(name, content);
  Encoder.encode(data);
  return data;
}

test("insert get delete", async () => {
  await store.insert(makeData("/A/1"), makeData("/A/2"));
  await expect(store.get(new Name("/A/0"))).resolves.toBeUndefined();
  await expect(store.get(new Name("/A/1"))).resolves.toHaveName("/A/1");
  await expect(store.get(new Name("/A/2"))).resolves.toHaveName("/A/2");
  await store.delete(new Name("/A/0"), new Name("/A/1"));
  await expect(store.get(new Name("/A/0"))).resolves.toBeUndefined();
  await expect(store.get(new Name("/A/1"))).resolves.toBeUndefined();
  await expect(store.get(new Name("/A/2"))).resolves.toHaveName("/A/2");
});

test("list find expire", async () => {
  const expireTime = Date.now() + 600;
  await Promise.all([
    store.insert(makeData("/A/1")),
    store.insert(makeData("/A/2"), makeData("/B/1")),
    store.tx().insert(makeData("/B/2")).insert(makeData("/C/1"), { expireTime }).commit(),
    store.insert({ expireTime }, makeData("/C/2")),
    store.insert(makeData("/C/3"), { expireTime }),
  ]);

  let names = await collect(map((data) => data.name.toString(), store.list()));
  names.sort();
  expect(names).toEqual(["/A/1", "/A/2", "/B/1", "/B/2", "/C/1", "/C/2", "/C/3"]);

  await expect(store.find(new Interest("/C", Interest.CanBePrefix))).resolves.not.toBeUndefined();
  await new Promise((r) => setTimeout(r, 700));

  names = await collect(map((name) => name.toString(), store.listNames()));
  names.sort();
  expect(names).toEqual(["/A/1", "/A/2", "/B/1", "/B/2"]);

  names = await collect(map((name) => name.toString(), store.listNames(new Name("/B"))));
  names.sort();
  expect(names).toEqual(["/B/1", "/B/2"]);

  await expect(store.get(new Name("/C/1"))).resolves.toBeUndefined();
  await expect(store.find(new Interest("/C", Interest.CanBePrefix))).resolves.toBeUndefined();
  await expect(store.find(new Interest("/A"))).resolves.toBeUndefined();
  await expect(store.find(new Interest("/A/1"))).resolves.toHaveName("/A/1");
  const dataA = await store.find(new Interest("/A", Interest.CanBePrefix));
  expect(["/A/1", "/A/2"]).toContain(dataA?.name.toString());
  await expect(store.find(new Interest("/C", Interest.CanBePrefix))).resolves.toBeUndefined();

  await store.clearExpired();
});
