import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Segment, SequenceNum, Version } from "@ndn/naming-convention2";
import { Component, Data, Interest, Name, type NameLike, NameMultiSet } from "@ndn/packet";
import { retrieveMetadata } from "@ndn/rdr";
import { delay } from "@ndn/util";
import { beforeEach, expect, test } from "vitest";

import { type DataStore, PrefixRegShorter, PrefixRegStatic, PrefixRegStrip, RepoProducer, respondRdr } from "..";
import { makeDataStore } from "../test-fixture/data-store";

let store: DataStore;
let announced: NameMultiSet; // could be NameSet
beforeEach(async () => {
  store = await makeDataStore();
  announced = new NameMultiSet();
  const fw = Forwarder.getDefault();
  fw.addEventListener("annadd", ({ name }) => { announced.add(name); });
  fw.addEventListener("annrm", ({ name }) => { announced.remove(name); });
  return async () => {
    await store[Symbol.asyncDispose]();
    Forwarder.deleteDefault();
  };
});

function insertData(...names: [NameLike, ...NameLike[]]) {
  return store.insert(...names.map((name) => new Data(name)));
}

function* listAnnounced(): Iterable<Name> {
  for (const [name] of announced.multiplicities()) {
    yield name;
  }
}

test("simple", async () => {
  await insertData("/A/1", "/A/2", "/A/3", "/B/4");
  const producer = RepoProducer.create(store, {
    reg: PrefixRegStatic(new Name("/A"), new Name("/B")),
  });
  await delay(50);
  expect(listAnnounced()).toEqualNames(["/A", "/B"]);

  const endpoint = new Endpoint();
  await Promise.all([
    expect(endpoint.consume(new Interest("/A/0", Interest.Lifetime(100)))).rejects.toThrow(),
    expect(endpoint.consume("/A/1")).resolves.toHaveName("/A/1"),
    expect(endpoint.consume(new Interest("/B", Interest.CanBePrefix))).resolves.toHaveName("/B/4"),
  ]);

  producer.close();
  await delay(50);
  expect(listAnnounced()).toEqualNames([]);
});

test("prefixreg shorter", async () => {
  await insertData("/A/B/1", "/A/B/2", "/C/D/3");
  const producer = RepoProducer.create(store, {
    reg: PrefixRegShorter(1),
  });
  await delay(50);
  expect(listAnnounced()).toEqualNames(["/A/B", "/C/D"]);

  await insertData("/C/D/4", "/E/F/1");
  await delay(50);
  expect(listAnnounced()).toEqualNames(["/A/B", "/C/D", "/E/F"]);

  await store.delete(new Name("/C/D/3"), new Name("/C/D/4"));
  await delay(50);
  expect(listAnnounced()).toEqualNames(["/A/B", "/E/F"]);

  producer.close();
  await delay(50);
  expect(listAnnounced()).toEqualNames([]);
});

test("prefixreg strip non-generic", async () => {
  await insertData(
    new Name("/A").append(Version, 1).append(Segment, 0),
    new Name("/B").append(Version, 1).append(Segment, 0),
    "/J/K",
  );
  const producer = RepoProducer.create(store);
  await delay(50);
  expect(listAnnounced()).toEqualNames(["/A", "/B", "/J/K"]);

  producer.close();
  await delay(50);
  expect(listAnnounced()).toEqualNames([]);
});

test("prefixreg strip custom", async () => {
  await insertData(
    new Name("/A").append(Version, 1).append(Segment, 0),
    new Name("/B").append(Version, 1).append(SequenceNum, 4),
    "/8=J/8=K/8=L",
  );
  const producer = RepoProducer.create(store, {
    reg: PrefixRegStrip(Segment, "K", Component.from("L")),
  });
  await delay(50);
  expect(listAnnounced()).toEqualNames([
    new Name("/A").append(Version, 1),
    new Name("/B").append(Version, 1).append(SequenceNum, 4),
    "/J",
  ]);

  producer.close();
  await delay(50);
  expect(listAnnounced()).toEqualNames([]);
});

test("respondRdr", async () => {
  await insertData(
    "/A/9",
    new Name("/A").append(Version, 6),
    "/A",
    new Name("/A/2").append(Version, 8),
    new Name("/A").append(Version, 4),
  );
  const producer = RepoProducer.create(store, {
    reg: PrefixRegStatic(new Name("/A")),
    fallback: respondRdr(),
  });

  const metadata = await retrieveMetadata("/A");
  expect(metadata.name).toEqualName(new Name("/A").append(Version, 6));

  producer.close();
});
