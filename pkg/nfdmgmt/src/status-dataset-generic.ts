import type { ConsumerOptions } from "@ndn/endpoint";
import type { Component } from "@ndn/packet";
import { discoverVersion, fetch } from "@ndn/segmented-object";
import { type Decodable, Decoder } from "@ndn/tlv";

import { type CommonOptions, concatName, localhostPrefix } from "./common";

export interface StatusDatasetOptions extends CommonOptions {
}

/** Dataset name, parameters, and item type. */
export interface StatusDataset<R> extends Decodable<R> {
  /** Dataset name, written in name URI format. */
  readonly datasetName: string;

  /** Dataset parameters components. */
  readonly datasetParams?: readonly Component[];
}

/**
 * Retrieve a StatusDataset.
 * @typeParam R - Item type.
 * @param dataset - Dataset name, parameters, and item type.
 * @param opts - Other options.
 * To interact with non-NFD producer, `.opts.prefix` must be set.
 * @returns Dataset items.
 */
export async function list<R>(dataset: StatusDataset<R>, opts?: StatusDatasetOptions): Promise<R[]>;

/**
 * Retrieve a StatusDataset.
 * @typeParam R - Item type.
 * @param dataset - Dataset name, written in name URI format.
 * @param params - Dataset parameters components.
 * @param d - Item type.
 * @param opts - Other options.
 * To interact with non-NFD producer, `.opts.prefix` must be set.
 * @returns Dataset items.
 */
export async function list<R>(dataset: string, params: readonly Component[], d: Decodable<R>, opts?: StatusDatasetOptions): Promise<R[]>;

export async function list<R>(arg1: string | StatusDataset<R>, arg2: any = {}, arg3?: any, opts: StatusDatasetOptions = {}): Promise<R[]> {
  let datasetName: string;
  let params: readonly Component[];
  let d: Decodable<R>;
  if (typeof arg1 === "string") {
    [datasetName, params, d] = [arg1, arg2, arg3];
  } else {
    [datasetName, params = [], d, opts] = [arg1.datasetName, arg1.datasetParams, arg1, arg2];
  }

  const {
    cOpts: cOptsInput,
    prefix = localhostPrefix,
  } = opts;
  const cOpts: ConsumerOptions = {
    describe: "nfdmgmt",
    ...cOptsInput,
  };

  const name = concatName(prefix, datasetName, params);
  const versioned = await discoverVersion(name, { cOpts });
  const payload = await fetch(versioned, { cOpts });

  const decoder = new Decoder(payload);
  const results: R[] = [];
  while (!decoder.eof) {
    results.push(decoder.decode(d));
  }
  return results;
}
