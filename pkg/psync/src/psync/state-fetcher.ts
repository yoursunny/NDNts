import type { ConsumerOptions } from "@ndn/endpoint";
import type { Name } from "@ndn/packet";
import { discoverVersion, fetch } from "@ndn/segmented-object";

import type { PSyncCodec } from "./codec";
import type { PSyncCore } from "./core";

interface Result {
  versioned: Name;
  state: PSyncCore.State;
}

export class StateFetcher {
  constructor(
      private readonly describe: string,
      private readonly codec: PSyncCodec,
      syncInterestLifetime: number,
      cOpts: ConsumerOptions,
  ) {
    this.discoverVersionOpts = {
      ...cOpts,
      modifyInterest: { lifetime: syncInterestLifetime },
      retx: 0,
    };
    this.fetchOpts = {
      cOpts,
      modifyInterest: { lifetime: syncInterestLifetime },
      retxLimit: 0,
    };
  }

  private readonly discoverVersionOpts: ConsumerOptions;
  private readonly fetchOpts: fetch.Options;

  public async fetch(name: Name, { signal }: AbortController, describeSuffix = "c"): Promise<Result> {
    const versioned = await discoverVersion(name, {
      cOpts: {
        ...this.discoverVersionOpts,
        describe: `${this.describe}[${describeSuffix}v]`,
        signal,
      },
      // PSync C++ library prior to 62f0800a61f49c7dd698e142e046831dbc88c5b9 would insert a useless
      // component, making a 3-component suffix; otherwise, it's a 2-component suffix
      expectedSuffixLen: [2, 3],
    });
    const payload = await fetch(versioned, {
      ...this.fetchOpts,
      describe: `${this.describe}[${describeSuffix}f]`,
      signal,
    });
    const state = this.codec.buffer2state(payload);
    return { versioned, state };
  }
}
