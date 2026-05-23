import { BlobChunkSource, fetch, serve, type Server } from "@ndn/segmented-object";
import { asBufferSource, Closers, toHex } from "@ndn/util";

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
  const digest = await crypto.subtle.digest("SHA-256", asBufferSource(fetched));
  return {
    size: fetched.byteLength,
    digest: toHex(new Uint8Array(digest)),
  };
}

globalThis.testBlobChunkSource = (): Promise<FetchedInfo> => {
  const file = upload.files![0]!;
  const server = serve("/R", new BlobChunkSource(file));
  return fetchAndReport(server);
};
