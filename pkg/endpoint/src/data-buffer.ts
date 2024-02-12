import type { Data, Interest, Signer } from "@ndn/packet";
import { assert } from "@ndn/util";

import { signUnsignedData } from "./producer";

/** Outgoing Data buffer for producer. */
export interface DataBuffer {
  find: (interest: Interest) => Promise<Data | undefined>;
  insert: (...pkts: readonly Data[]) => Promise<void>;
}

interface DataStore {
  find: (interest: Interest) => Promise<Data | undefined>;
  insert: (opts: { expireTime?: number }, ...pkts: readonly Data[]) => Promise<void>;
}

/** DataBuffer implementation based on `DataStore` from `@ndn/repo` package. */
export class DataStoreBuffer implements DataBuffer {
  /* eslint-disable tsdoc/syntax -- tsdoc-missing-reference */
  /**
   * Constructor.
   * @param store - {@link \@ndn/repo!DataStore} instance.
   *
   * @example
   * ```ts
   * new DataStoreBuffer(await makeInMemoryDataStore())
   * ```
   *
   * @remarks
   * `DataStore` is declared as an interface instead of importing, in order to reduce bundle size
   * for webapps that do not use DataBuffer. The trade-off is that, applications wanting to use
   * DataBuffer would have to import `@ndn/repo` themselves.
   */
  /* eslint-enable tsdoc/syntax */
  constructor(public readonly store: DataStore, {
    ttl = 60000,
    dataSigner,
  }: DataStoreBuffer.Options = {}) {
    assert(ttl >= 0);
    this.ttl = ttl;
    this.dataSigner = dataSigner;
  }

  private readonly ttl: number;
  private readonly dataSigner?: Signer;

  public find(interest: Interest) {
    return this.store.find(interest);
  }

  public async insert(...pkts: Data[]) {
    const expireTime = this.ttl > 0 ? Date.now() + this.ttl : undefined;
    if (this.dataSigner) {
      await Promise.all(pkts.map((data) => signUnsignedData(data, this.dataSigner)));
    }
    return this.store.insert({ expireTime }, ...pkts);
  }
}
export namespace DataStoreBuffer {
  /** {@link DataStoreBuffer} constructor options. */
  export interface Options {
    /**
     * Data expiration time in milliseconds.
     * 0 means infinity.
     * @defaultValue 60000
     */
    ttl?: number;

    /**
     * If specified, automatically sign Data packets unless already signed.
     * @see {@link ProducerOptions.dataSigner}
     */
    dataSigner?: Signer;
  }
}
