import "@ndn/tlv/test-fixture/expect";
import "@ndn/packet/test-fixture/expect";

import { toUtf8 } from "@ndn/util";
import { describe, expect, test } from "vitest";

import { buildDirectoryListing, type DirEntry, parseDirectoryListing } from "..";

describe("full", () => {
  const wire = toUtf8([
    "fileA\0",
    "dirD/\0",
    "fileB\0",
  ].join(""));
  const entries: DirEntry[] = [
    { name: "fileA", isDir: false },
    { name: "dirD", isDir: true },
    { name: "fileB", isDir: false },
  ];
  test("parse", () => {
    const ls = Array.from(parseDirectoryListing(wire));
    expect(ls).toEqual(entries);
  });
  test("build", () => {
    const encoded = buildDirectoryListing(entries);
    expect(encoded).toEqualUint8Array(wire);
  });
});

describe("empty", () => {
  const wire = new Uint8Array();
  const entries: DirEntry[] = [];
  test("parse", () => {
    const ls = Array.from(parseDirectoryListing(wire));
    expect(ls).toEqual(entries);
  });
  test("build", () => {
    const encoded = buildDirectoryListing(entries);
    expect(encoded).toEqualUint8Array(wire);
  });
});

test("parse truncated", () => {
  const input = toUtf8([
    "fileA\0",
    "dirD/\0",
    "not-trailing-zero",
  ].join(""));
  expect(() => Array.from(parseDirectoryListing(input))).toThrow();
});
