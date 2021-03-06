import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Segment, SequenceNum, Version } from "@ndn/naming-convention2";
import { Component, Data, Interest, Name, NameLike } from "@ndn/packet";
import { retrieveMetadata } from "@ndn/rdr";

import { DataStore, PrefixRegShorter, PrefixRegStatic, PrefixRegStrip, RepoProducer, respondRdr } from "..";
import { makeDataStore } from "../test-fixture/data-store";

let store: DataStore;
const announced = new Set<string>();
beforeEach(async () => {
  store = await makeDataStore();
  const fw = Forwarder.getDefault();
  fw.on("annadd", (name) => announced.add(name.toString()));
  fw.on("annrm", (name) => announced.delete(name.toString()));
});
afterEach(async () => {
  await store.close();
  Forwarder.deleteDefault();
  announced.clear();
});

function insertData(...names: [NameLike, ...NameLike[]]) {
  return store.insert(...names.map((name) => new Data(name)));
}

function listAnnounced(): string[] {
  const names = Array.from(announced);
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

test("simple", async () => {
  await insertData("/A/1", "/A/2", "/A/3", "/B/4");
  const producer = RepoProducer.create(store, {
    reg: PrefixRegStatic(new Name("/A"), new Name("/B")),
  });
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toEqual(["/8=A", "/8=B"]);

  const endpoint = new Endpoint();
  await Promise.all([
    expect(endpoint.consume(new Interest("/A/0", Interest.Lifetime(100)))).rejects.toThrow(),
    expect(endpoint.consume("/A/1")).resolves.toHaveName("/A/1"),
    expect(endpoint.consume(new Interest("/B", Interest.CanBePrefix))).resolves.toHaveName("/B/4"),
  ]);

  producer.close();
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toHaveLength(0);
});

test("prefixreg shorter", async () => {
  await insertData("/A/B/1", "/A/B/2", "/C/D/3");
  const producer = RepoProducer.create(store, {
    reg: PrefixRegShorter(1),
  });
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toEqual(["/8=A/8=B", "/8=C/8=D"]);

  await insertData("/C/D/4", "/E/F/1");
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toEqual(["/8=A/8=B", "/8=C/8=D", "/8=E/8=F"]);

  await store.delete(new Name("/C/D/3"), new Name("/C/D/4"));
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toEqual(["/8=A/8=B", "/8=E/8=F"]);

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
  const producer = RepoProducer.create(store);
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toEqual(["/8=A", "/8=B", "/8=J/8=K"]);

  producer.close();
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toHaveLength(0);
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
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toEqual([
    `${new Name("/A").append(Version, 1)}`,
    `${new Name("/B").append(Version, 1).append(SequenceNum, 4)}`,
    "/8=J",
  ]);

  producer.close();
  await new Promise((r) => setTimeout(r, 50));
  expect(listAnnounced()).toHaveLength(0);
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
