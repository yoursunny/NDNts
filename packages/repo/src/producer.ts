import { Endpoint, Producer as EpProducer } from "@ndn/endpoint";
import { Data, Interest } from "@ndn/packet";

import { DataStore } from "./data-store";
import { PrefixRegStrip } from "./prefix-reg/mod";
import type { PrefixRegContext, PrefixRegController } from "./prefix-reg/types";

/** Make packets in DataStore available for retrieval. */
export class Producer {
  public static create(store: DataStore, {
    endpoint = new Endpoint(),
    describe = "repo",
    fallback = () => Promise.resolve(false),
    reg = PrefixRegStrip(PrefixRegStrip.stripNonGeneric),
  }: Producer.Options = {}) {
    return new Producer(store, endpoint, describe, fallback, reg);
  }

  private readonly prod: EpProducer;
  private readonly reg: PrefixRegContext;

  private constructor(
      private readonly store: DataStore,
      endpoint: Endpoint,
      describe: string,
      private readonly fallback: Producer.FallbackHandler,
      reg: PrefixRegController) {
    this.prod = endpoint.produce(undefined, this.processInterest, { describe });
    this.fallback = fallback;
    this.reg = reg(store, this.prod.face);
  }

  public close() {
    this.reg.close();
    this.prod.close();
  }

  private processInterest = async (interest: Interest): Promise<Data|false> => {
    const found = await this.store.find(interest);
    return found ?? this.fallback(interest, this, this.store);
  };
}

export namespace Producer {
  export interface Options {
    endpoint?: Endpoint;
    describe?: string;
    fallback?: FallbackHandler;
    reg?: PrefixRegController;
  }

  export type FallbackHandler = (interest: Interest, producer: Producer, store: DataStore) => Promise<Data|false>;
}
