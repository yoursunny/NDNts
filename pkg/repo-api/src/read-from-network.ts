import { consume, type ConsumerOptions } from "@ndn/endpoint";
import { type Data, Interest, type Name } from "@ndn/packet";

import type * as S from "./data-store";

/** Implement DataStore read-side interfaces by sending Interests to the network. */
export class ReadFromNetwork implements S.Get, S.Find {
  constructor(private readonly cOpts?: ConsumerOptions) {}

  public get(name: Name): Promise<Data | undefined> {
    return this.find(new Interest(name));
  }

  public async find(interest: Interest): Promise<Data | undefined> {
    try {
      return await consume(interest, this.cOpts);
    } catch {
      return undefined;
    }
  }

  /**
   * Extend a write-only DataStore with read methods.
   * @param inner - Inner DataStore that does not support reading.
   * @returns Readable DataStore.
   */
  public mix<T extends {}>(inner: T): T & S.Get & S.Find {
    const self = this; // eslint-disable-line unicorn/no-this-assignment, @typescript-eslint/no-this-alias
    return new Proxy<any>(inner, {
      get(target, prop) {
        void target;
        switch (prop) {
          case "get":
          case "find": {
            return (self as any)[prop];
          }
        }
        return (inner as any)[prop];
      },
    });
  }
}
