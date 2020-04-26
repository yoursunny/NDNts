import { Data, Interest } from "@ndn/packet";
import assert from "minimalistic-assert";

/** Outgoing Data buffer for producer. */
export interface DataBuffer {
  find: (interest: Interest) => Promise<Data|undefined>;
  insert: (...pkts: Data[]) => Promise<void>;
}

/** Prototype of DataStore from @ndn/repo package. */
interface DataStore {
  find: (interest: Interest) => Promise<Data|undefined>;
  insert: (opts: { expireTime?: number }, ...pkts: Data[]) => Promise<void>;
}
// We declare an interface here instead of importing DataStore, in order to reduce bundle size for
// webapps that do not use DataBuffer. The trade-off is that, applications that want to use
// DataBuffer would have to import memdown and @ndn/repo themselves.

/**
 * DataBuffer implementation based on DataStore from @ndn/repo package.
 *
 * @example
 * new DataStoreBuffer(new DataStore(memdown()))
 */
export class DataStoreBuffer implements DataBuffer {
  constructor(public readonly store: DataStore, private readonly ttl = 60000) {
    assert(ttl >= 0);
  }

  public find(interest: Interest) {
    return this.store.find(interest);
  }

  public insert(...pkts: Data[]) {
    // TODO sign Data with trust schema
    const expireTime = this.ttl > 0 ? Date.now() + this.ttl : undefined;
    return this.store.insert({ expireTime }, ...pkts);
  }
}
