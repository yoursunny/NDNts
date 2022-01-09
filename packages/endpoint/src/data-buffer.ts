import type { Data, Interest, Signer } from "@ndn/packet";
import assert from "minimalistic-assert";

import { signUnsignedData } from "./producer";

/** Outgoing Data buffer for producer. */
export interface DataBuffer {
  find: (interest: Interest) => Promise<Data | undefined>;
  insert: (...pkts: Data[]) => Promise<void>;
}

/** Prototype of DataStore from @ndn/repo package. */
interface DataStore {
  find: (interest: Interest) => Promise<Data | undefined>;
  insert: (opts: { expireTime?: number }, ...pkts: Data[]) => Promise<void>;
}
// We declare an interface here instead of importing DataStore, in order to reduce bundle size for
// webapps that do not use DataBuffer. The trade-off is that, applications wanting to use
// DataBuffer would have to import memdown and @ndn/repo themselves.

/**
 * DataBuffer implementation based on DataStore from @ndn/repo package.
 *
 * @example
 * new DataStoreBuffer(new DataStore(memdown()))
 */
export class DataStoreBuffer implements DataBuffer {
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
  export interface Options {
    /** Data expiration time. Default is 60000ms. 0 means infinity. */
    ttl?: number;

    /** If specified, automatically sign Data packets unless already signed. */
    dataSigner?: Signer;
  }
}
