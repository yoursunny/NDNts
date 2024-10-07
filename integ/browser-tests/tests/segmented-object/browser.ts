import { BlobChunkSource, fetch, FileChunkSource, serve, type Server } from "@ndn/segmented-object";
import { Closers, fromHex, toHex } from "@ndn/util";
import { configure as zenfsConfigure } from "@zenfs/core";
import { WebAccess } from "@zenfs/dom";

import type { FetchedInfo } from "./api";

let upload: HTMLInputElement;

window.addEventListener("load", () => {
  upload = document.createElement("input");
  upload.id = "upload-input";
  upload.type = "file";
  document.body.append(upload);
});

async function fetchAndReport(server: Server): Promise<FetchedInfo> {
  using closers = new Closers();
  closers.push(server);

  const fetched = await fetch(server.prefix);
  const digest = await crypto.subtle.digest("SHA-256", fetched);
  return {
    size: fetched.byteLength,
    digest: toHex(new Uint8Array(digest)),
  };
}

window.testBlobChunkSource = (): Promise<FetchedInfo> => {
  const file = upload.files![0]!;
  const server = serve("/R", new BlobChunkSource(file));
  return fetchAndReport(server);
};

window.testZenFS = async (payloadHex): Promise<FetchedInfo> => {
  const root = await navigator.storage.getDirectory();
  const file = await root.getFileHandle("R.bin", { create: true });
  const writable = await file.createWritable();
  await writable.write(fromHex(payloadHex));
  await writable.close();

  await zenfsConfigure({
    mounts: {
      "/W": {
        backend: WebAccess as any, // https://github.com/zen-fs/dom/issues/18
        handle: root,
      },
    },
  });
  const server = serve("/R", new FileChunkSource("/W/R.bin"));
  return fetchAndReport(server);
};
