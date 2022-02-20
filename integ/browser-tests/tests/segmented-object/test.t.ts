import "./api";

import { makeObjectBody } from "@ndn/segmented-object/test-fixture/object-body";
import { toHex } from "@ndn/util";
import { deleteTmpFiles, writeTmpFile } from "@ndn/util/test-fixture/tmpfile";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { navigateToPage, pageInvoke } from "../../test-fixture/pptr";

let objectBody: Buffer;
let objectBodyDigest: string;
let filename: string;
beforeAll(() => {
  objectBody = makeObjectBody(128 * 1024);
  objectBodyDigest = toHex(createHash("sha256").update(objectBody).digest());
  filename = writeTmpFile(objectBody);
});
afterAll(deleteTmpFiles);

beforeEach(() => navigateToPage(__dirname));

test("blob to buffer", async () => {
  const [fileChooser] = await Promise.all([
    page.waitForFileChooser(),
    page.click("#upload-input"),
  ]);
  await fileChooser.accept([filename]);
  await delay(500);

  const { size, digest } = await pageInvoke<typeof window.testBlobChunkSource>(page, "testBlobChunkSource");
  expect(size).toBe(objectBody.byteLength);
  expect(digest).toBe(objectBodyDigest);
});
