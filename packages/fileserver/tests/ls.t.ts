import "@ndn/tlv/test-fixture/expect";
import "@ndn/packet/test-fixture/expect";

import { toUtf8 } from "@ndn/util";
import { expect, test } from "vitest";

import { ModeDir, ModeFile, parseDirectoryListing } from "..";

test("parse success", () => {
  const input = toUtf8([
    "fileA\0",
    "dirD/\0",
    "fileB\0",
  ].join(""));
  const ls = Array.from(parseDirectoryListing(input));
  expect(ls).toHaveLength(3);
  expect(ls[0]).toEqual(["fileA", ModeFile]);
  expect(ls[1]).toEqual(["dirD", ModeDir]);
  expect(ls[2]).toEqual(["fileB", ModeFile]);
});

test("parse empty", () => {
  const ls = Array.from(parseDirectoryListing(new Uint8Array()));
  expect(ls).toHaveLength(0);
});

test("parse truncated", () => {
  const input = toUtf8([
    "fileA\0",
    "dirD/\0",
    "not-trailing-zero",
  ].join(""));
  expect(() => Array.from(parseDirectoryListing(input))).toThrow();
});
