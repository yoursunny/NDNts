import { Endpoint } from "@ndn/endpoint";
import { Data, Name } from "@ndn/packet";
import type { DataStore } from "@ndn/repo-api";
import pDefer from "p-defer";
import throat from "throat";

import { PyRepoClient } from "./client";

/** A DataStore implementation using ndn-python-repo. */
export class PyRepoStore implements Pick<DataStore, "close"|"insert"|"delete"> {
  /** Construct with new PyRepoClient. */
  constructor(opts: PyRepoStore.Options);

  /** Construct with existing PyRepoClient. */
  constructor(client: PyRepoClient, opts?: PyRepoStore.StoreOptions);

  constructor(arg1: PyRepoClient|PyRepoStore.Options, arg2: PyRepoStore.StoreOptions = {}) {
    let opts: PyRepoStore.StoreOptions;
    if (arg1 instanceof PyRepoClient) {
      this.client = arg1;
      this.ownsClient = false;
      opts = arg2;
    } else {
      this.client = new PyRepoClient(arg1);
      this.ownsClient = true;
      opts = arg1;
    }
    this.throttle = throat(opts.parallel ?? 4);
    this.endpoint = this.client.endpoint;
  }

  public readonly client: PyRepoClient;
  private readonly ownsClient: boolean;
  private readonly throttle: ReturnType<typeof throat>;
  private readonly endpoint: Endpoint;

  /** Close the PyRepoClient only if it is created by this store. */
  public async close(): Promise<void> {
    if (this.ownsClient) {
      this.client.close();
    }
  }

  /** Insert some Data packets. */
  public async insert(...pkts: Data[]): Promise<void> {
    await Promise.all(pkts.map((data) => {
      return this.throttle(async () => {
        const producerAnswered = pDefer();
        const producer = this.endpoint.produce(data.name, async () => {
          setTimeout(() => producerAnswered.resolve(), 100);
          return data;
        }, {
          describe: `pyrepo-insert(${data.name})`,
        });
        await new Promise((r) => setTimeout(r, 100));
        try {
          await this.client.insert(data.name);
          await Promise.race([
            producerAnswered.promise,
            new Promise((resolve, reject) => setTimeout(() => reject(new Error("no incoming Interest")), 5000)),
          ]);
        } finally {
          producer.close();
        }
      });
    }));
  }

  /** Delete some Data packets. */
  public async delete(...names: Name[]): Promise<void> {
    await Promise.all(names.map((name) => {
      return this.throttle(async () => {
        await this.client.delete(name);
      });
    }));
  }
}

export namespace PyRepoStore {
  export interface StoreOptions {
    /** Maximum number of parallel insertions. Default is 4. */
    parallel?: number;
  }

  export interface Options extends PyRepoClient.Options, StoreOptions {
  }
}
