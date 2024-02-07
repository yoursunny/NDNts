import type { Endpoint } from "@ndn/endpoint";
import type { Name } from "@ndn/packet";
import { DataStore as S } from "@ndn/repo-api";
import { delay } from "@ndn/util";
import pDefer from "p-defer";
import { consume, pipeline, transform } from "streaming-iterables";
import throat from "throat";

import { PyRepoClient } from "./client";

/**
 * A DataStore implementation using ndn-python-repo.
 *
 * @remarks
 * This DataStore is write-only. It can insert and delete data in ndn-python-repo.
 *
 * This DataStore does not have methods to read data. To read data in ndn-python-repo, send an
 * Interest to the network, and then ndn-python-repo is supposed to reply.
 */
export class PyRepoStore implements Disposable, S.Insert, S.Delete {
  /**
   * Construct with new {@link PyRepoClient}.
   *
   * @remarks
   * The internal client will be closed when this store is closed.
   */
  constructor(opts: PyRepoStore.Options);

  /**
   * Construct with existing {@link PyRepoClient}.
   *
   * @remarks
   * The passed `client` will not be closed when this store is closed.
   */
  constructor(client: PyRepoClient, opts?: PyRepoStore.StoreOptions);

  constructor(arg1: PyRepoClient | PyRepoStore.Options, arg2: PyRepoStore.StoreOptions = {}) {
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
    this.throttle = throat(opts.parallel ?? 16);
    this.endpoint = this.client.endpoint;
  }

  public readonly client: PyRepoClient;
  private readonly ownsClient: boolean;
  private readonly throttle: ReturnType<typeof throat>;
  private readonly endpoint: Endpoint;

  /** Close the {@link PyRepoClient} only if it is created by this store. */
  public [Symbol.dispose](): void {
    if (this.ownsClient) {
      this.client.close();
    }
  }

  /** Insert some Data packets. */
  public async insert(...args: S.Insert.Args<{}>): Promise<void> {
    // TODO use client.insertRange where applicable
    const { pkts } = S.Insert.parseArgs<{}>(args);
    return pipeline(
      () => pkts,
      transform(Infinity, (data) => this.throttle(async () => {
        const answered = pDefer();
        const timeout = setTimeout(() => answered.reject(new Error("no incoming Interest")), 5000);
        using producer = this.endpoint.produce(data.name, async () => {
          clearTimeout(timeout);
          answered.resolve();
          return data;
        }, {
          describe: `pyrepo-insert(${data.name})`,
          announcement: false,
        });
        void producer;

        await delay(100); // pre-command delay for prefix registration
        await this.client.insert(data.name);
        await answered.promise;
        await delay(100); // post-command delay for Data retransmissions
      })),
      consume,
    );
  }

  /** Delete some Data packets. */
  public async delete(...names: Name[]): Promise<void> {
    await Promise.all(names.map((name) => this.throttle(async () => {
      await this.client.delete(name);
    })));
  }
}

export namespace PyRepoStore {
  export interface StoreOptions {
    /**
     * Maximum number of parallel operations.
     * @defaultValue 16
     */
    parallel?: number;
  }

  export interface Options extends PyRepoClient.Options, StoreOptions {
  }
}
