import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Segment, SequenceNum, Version } from "@ndn/naming-convention2";
import { Component, Data, Interest, Name, NameLike } from "@ndn/packet";
import memdown from "memdown";

import { DataStore, RepoProducer } from "..";

let store: DataStore;
const announced = new Set<string>();
beforeEach(() => {
  store = new DataStore(memdown());
  const fw = Forwarder.getDefault();
  fw.on("annadd", (name) => announced.add(name.toString()));
  fw.on("annrm", (name) => announced.delete(name.toString()));
});
afterEach(() => {
  store.close();
  Forwarder.deleteDefault();
  announced.clear();
});

function insertData(...names: [NameLike, ...NameLike[]]) {
  return store.insert(...names.map((name) => new Data(name)));
}

function listAnnounced(): string[] {
  const names = Array.from(announced);
  names.sort();
  return names;
}

test("simple", async () => {
  await insertData("/A/1", "/A/2", "/A/3", "/B/4");
  const producer = new RepoProducer(store, {
    reg: RepoProducer.PrefixRegStatic(new Name("/A"), new Name("/B")),
  });
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toEqual(["/A", "/B"]);

  const endpoint = new Endpoint();
  await Promise.all([
    expect(endpoint.consume(new Interest("/A/0", Interest.Lifetime(100)))).rejects.toThrow(),
    expect(endpoint.consume(new Interest("/A/1"))).resolves.toHaveName("/A/1"),
    expect(endpoint.consume(new Interest("/B", Interest.CanBePrefix))).resolves.toHaveName("/B/4"),
  ]);

  producer.close();
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toHaveLength(0);
});

test("prefixreg shorter", async () => {
  await insertData("/A/B/1", "/A/B/2", "/C/D/3");
  const producer = new RepoProducer(store, {
    reg: RepoProducer.PrefixRegShorter(1),
  });
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toEqual(["/A/B", "/C/D"]);

  await insertData("/C/D/4", "/E/F/1");
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toEqual(["/A/B", "/C/D", "/E/F"]);

  await store.delete(new Name("/C/D/3"), new Name("/C/D/4"));
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toEqual(["/A/B", "/E/F"]);

  producer.close();
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toHaveLength(0);
});

test("prefixreg strip non-generic", async () => {
  await insertData(
    new Name("/A").append(Version, 1).append(Segment, 0),
    new Name("/B").append(Version, 1).append(Segment, 0),
    "/J/K",
  );
  const producer = new RepoProducer(store);
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toEqual(["/A", "/B", "/J/K"]);

  producer.close();
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toHaveLength(0);
});

test("prefixreg strip custom", async () => {
  await insertData(
    new Name("/A").append(Version, 1).append(Segment, 0),
    new Name("/B").append(Version, 1).append(SequenceNum, 4),
    "/J/K/L",
  );
  const producer = new RepoProducer(store, {
    reg: RepoProducer.PrefixRegStrip(Segment, "K", Component.from("L")),
  });
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toEqual([
    `${new Name("/A").append(Version, 1)}`,
    `${new Name("/B").append(Version, 1).append(SequenceNum, 4)}`,
    "/J",
  ]);

  producer.close();
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toHaveLength(0);
});
