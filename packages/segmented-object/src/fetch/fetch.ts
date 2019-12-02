import { Data, Name } from "@ndn/packet";
import AbortController from "abort-controller";
import pushable from "it-pushable";
import assert from "minimalistic-assert";
import PCancelable from "p-cancelable";
import { map, writeToStream } from "streaming-iterables";

import { Fetcher } from "./fetcher";
import { Reorder } from "./reorder";

function fetchUnordered(name: Name, opts: fetch.Options = {}): AsyncIterable<Data> {
  const ctx = new Fetcher(name, opts);
  const it = pushable<Data>();
  ctx.on("segment", (segNum, data) => it.push(data));
  ctx.on("end", () => it.end());
  ctx.on("error", (err) => it.end(err));
  return it;
}

function fetchOrdered(name: Name, opts: fetch.Options = {}): AsyncIterable<Data> {
  const ctx = new Fetcher(name, opts);
  const reorder = new Reorder<Data>(opts.segmentRange?.[0]);
  const it = pushable<Data>();
  ctx.on("segment", (segNum, data) => {
    const ordered = reorder.push(segNum, data);
    ordered.forEach((data) => it.push(data));
  });
  ctx.on("end", () => {
    assert(reorder.empty);
    it.end();
  });
  ctx.on("error", (err) => it.end(err));
  return it;
}

function fetchChunks(name: Name, opts: fetch.Options = {}): AsyncIterable<Uint8Array> {
  return map((data) => data.content, fetchOrdered(name, opts));
}

function fetchToStream(name: Name, stream: NodeJS.WritableStream, opts: fetch.Options = {}): Promise<void> {
  return writeToStream(stream, fetchChunks(name, opts));
}

async function fetchPromise_(name: Name, opts: fetch.Options = {}): Promise<Uint8Array> {
  const chunks = [] as Uint8Array[];
  let totalLength = 0;
  for await (const chunk of fetchChunks(name, opts)) {
    chunks.push(chunk);
    totalLength += chunk.length;
  }

  const output = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  assert.equal(offset, totalLength);
  return output;
}

function fetchPromise(name: Name, opts: fetch.Options = {}): PCancelable<Uint8Array> {
  return new PCancelable<Uint8Array>((resolve, reject, onCancel) => {
    opts = { ...opts };
    opts.abort = opts.abort ?? new AbortController();
    onCancel(() => opts.abort!.abort());
    fetchPromise_(name, opts).then(resolve, reject);
  });
}

/** Fetch a segment object as AsyncIterable of payload. */
export function fetch(name: Name, opts: fetch.Options = {}) {
  return fetchChunks(name, opts);
}

export namespace fetch {
  export type Options = Fetcher.Options;

  /** Fetch a segment object as AsyncIterable of unordered Data packets. */
  export const unordered = fetchUnordered;

  /** Fetch a segment object as AsyncIterable of Data packets. */
  export const packets = fetchOrdered;

  /** Fetch a segment object into a writable stream. */
  export const toStream = fetchToStream;

  /** Fetch a segment object as Promise of payload. */
  export const promise = fetchPromise;
}
