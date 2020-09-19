import { Name } from "@ndn/packet";
import { BlobChunkSource, fetch, serve } from "@ndn/segmented-object";
import { toHex } from "@ndn/tlv";

import type { FetchedInfo } from "./api";

let upload: HTMLInputElement;

window.addEventListener("load", () => {
  upload = document.createElement("input");
  upload.id = "upload-input";
  upload.type = "file";
  document.body.append(upload);
  document.append();
});

window.testBlobChunkSource = async (): Promise<FetchedInfo> => {
  const file = upload.files![0];
  const server = serve("/R", new BlobChunkSource(file));
  const fetched = await fetch(new Name("/R"));
  server.close();

  const digest = await crypto.subtle.digest("SHA-256", fetched);
  return {
    size: fetched.byteLength,
    digest: toHex(new Uint8Array(digest)),
  };
};
