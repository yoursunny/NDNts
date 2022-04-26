import "./api";

import { makeObjectBody } from "@ndn/segmented-object/test-fixture/object-body";
import { sha256, toHex } from "@ndn/util";
import { deleteTmpFiles, writeTmpFile } from "@ndn/util/test-fixture/tmpfile";
import { setTimeout as delay } from "node:timers/promises";
import { beforeAll, beforeEach, expect, test } from "vitest";

import { navigateToPage, page, pageInvoke } from "../../test-fixture/pptr";

let objectBody: Buffer;
let objectBodyDigest: string;
let filename: string;
beforeAll(async () => {
  objectBody = makeObjectBody(128 * 1024);
  objectBodyDigest = toHex(await sha256(objectBody));
  filename = writeTmpFile(objectBody);
  return deleteTmpFiles;
});

beforeEach(() => navigateToPage(__dirname));

test("blob to buffer", async () => {
  const [fileChooser] = await Promise.all([
    page.waitForFileChooser(),
    page.click("#upload-input"),
  ]);
  await fileChooser.accept([filename]);
  await delay(500);

  const { size, digest } = await pageInvoke<typeof window.testBlobChunkSource>("testBlobChunkSource");
  expect(size).toBe(objectBody.byteLength);
  expect(digest).toBe(objectBodyDigest);
});
