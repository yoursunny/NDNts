import "./api";

import { makeObjectBody } from "@ndn/segmented-object/test-fixture/object-body";
import { delay, sha256, toHex } from "@ndn/util";
import { deleteTmpFiles, writeTmpFile } from "@ndn/util/test-fixture/tmpfile";
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

beforeEach(() => navigateToPage(import.meta.url));

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
