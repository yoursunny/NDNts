import { produce, ProducerOptions } from "@ndn/endpoint";
import type { Name } from "@ndn/packet";
import { DataStore as S } from "@ndn/repo-api";
import { Closers, delay } from "@ndn/util";
import pDefer from "p-defer";
import { collect } from "streaming-iterables";

import { PyRepoClient } from "./client";

/**
 * A DataStore implementation using ndn-python-repo.
 *
 * @remarks
 * This DataStore is write-only. It can insert and delete data in ndn-python-repo.
 *
 * This DataStore does not have methods to read data. To read data in ndn-python-repo, send an
 * Interest to the network, and then ndn-python-repo itself can reply.
 * If you really need a readable DataStore, refer to {@link @ndn/repo-api!ReadFromNetwork}.
 */
export class PyRepoStore implements Disposable, S.Insert, S.Delete {
  /** Construct with internal {@link PyRepoClient}. */
  constructor(opts: PyRepoStore.Options);

  /**
   * Construct with existing {@link PyRepoClient}.
   *
   * @remarks
   * The passed `client` will not be disposed when this store is disposed.
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

    this.insertPOpts = ProducerOptions.exact(this.client.cpOpts);
    this.preCommandDelay = opts.preCommandDelay ?? 100;
    this.incomingInterestTimeout = opts.incomingInterestTimeout ?? 5000;
    this.postRetrievalDelay = opts.postRetrievalDelay ?? 100;
  }

  public readonly client: PyRepoClient;
  private readonly ownsClient: boolean;
  private readonly insertPOpts: ProducerOptions;
  private readonly preCommandDelay: number;
  private readonly incomingInterestTimeout: number;
  private readonly postRetrievalDelay: number;

  public [Symbol.dispose](): void {
    if (this.ownsClient) {
      this.client[Symbol.dispose]();
    }
  }

  /** Insert some Data packets. */
  public async insert(...args: S.Insert.Args<{}>): Promise<void> {
    const pkts = await collect(S.Insert.parseArgs<{}>(args).pkts);

    const retrieved = new Set<number>();
    const answered = pDefer<void>();
    const timeout = setTimeout(
      () => answered.reject(new Error("no incoming Interest")),
      this.incomingInterestTimeout,
    );
    const producers = pkts.map((data, i) => produce(data.name, async () => {
      retrieved.add(i);
      if (retrieved.size === pkts.length) {
        clearTimeout(timeout);
        answered.resolve();
      }
      return data;
    }, {
      ...this.insertPOpts,
      describe: `pyrepo-insert(${this.client.repoPrefix},${data.name})`,
    }));
    using closers = new Closers();
    closers.push(...producers);

    await delay(this.preCommandDelay);
    await this.client.insert(pkts.map(({ name }) => ({ name })));
    await answered.promise;
    await delay(this.postRetrievalDelay);
  }

  /** Delete some Data packets. */
  public async delete(...names: Name[]): Promise<void> {
    await this.client.delete(names.map((name) => ({ name })));
  }
}

export namespace PyRepoStore {
  export interface StoreOptions {
    /**
     * How long to allow for prefix announcement before sending command, in milliseconds.
     * @defaultValue 100
     */
    preCommandDelay?: number;

    /**
     * How long to wait for incoming Interest during insertion, in milliseconds.
     * @defaultValue 5000
     */
    incomingInterestTimeout?: number;

    /**
     * How long to allow for retransmissions after finishing command, in milliseconds.
     * @defaultValue 100
     */
    postRetrievalDelay?: number;
  }

  export interface Options extends PyRepoClient.Options, StoreOptions {
  }
}
