import type { Component } from "@ndn/packet";
import { discoverVersion, fetch } from "@ndn/segmented-object";
import { type Decodable, Decoder } from "@ndn/tlv";

import { CommonOptions, makeName } from "./common";

export interface StatusDatasetOptions extends CommonOptions {
}

export interface StatusDataset<R> extends Decodable<R> {
  readonly datasetName: string;
  readonly datasetParams?: readonly Component[];
}

/**
 * Retrieve a StatusDataset.
 * @template R item type.
 * @param dataset dataset name, parameters, and item type.
 * @param opts other options. Set .opts.prefix to target non-NFD producer.
 * @returns dataset items.
 */
export async function list<R>(dataset: StatusDataset<R>, opts?: StatusDatasetOptions): Promise<R[]>;

/**
 * Retrieve a StatusDataset.
 * @template R item type.
 * @param dataset dataset name.
 * @param params dataset parameters.
 * @param d item type.
 * @param opts other options. Set .opts.prefix to target non-NFD producer.
 * @returns dataset items.
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

  const { endpoint, prefix, verifier } = CommonOptions.applyDefaults(opts);
  const name = makeName(prefix, datasetName, params);
  const versioned = await discoverVersion(name, { endpoint, verifier });
  const payload = await fetch(versioned, { endpoint, verifier });

  const decoder = new Decoder(payload);
  const results: R[] = [];
  while (!decoder.eof) {
    results.push(decoder.decode(d));
  }
  return results;
}
