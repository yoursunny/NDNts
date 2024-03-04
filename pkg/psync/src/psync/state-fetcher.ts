import type { Endpoint } from "@ndn/endpoint";
import type { Name, Verifier } from "@ndn/packet";
import { discoverVersion, fetch } from "@ndn/segmented-object";

import type { PSyncCodec } from "./codec";
import type { PSyncCore } from "./core";

interface Result {
  versioned: Name;
  state: PSyncCore.State;
}

export class StateFetcher {
  constructor(
      private readonly endpoint: Endpoint,
      private readonly describe: string,
      private readonly codec: PSyncCodec,
      private readonly syncInterestLifetime: number,
      private readonly verifier: Verifier | undefined,
  ) {}

  public async fetch(name: Name, { signal }: AbortController, describeSuffix = "c"): Promise<Result> {
    const versioned = await discoverVersion(name, {
      cOpts: {
        ...this.endpoint.cOpts,
        describe: `${this.describe}[${describeSuffix}v]`,
        modifyInterest: { lifetime: this.syncInterestLifetime },
        retx: 0,
        signal,
        verifier: this.verifier,
      },
      // PSync C++ library prior to 62f0800a61f49c7dd698e142e046831dbc88c5b9 would insert a useless
      // component, making a 3-component suffix; otherwise, it's a 2-component suffix
      expectedSuffixLen: [2, 3],
    });
    const payload = await fetch(versioned, {
      cOpts: this.endpoint.cOpts,
      describe: `${this.describe}[${describeSuffix}f]`,
      modifyInterest: { lifetime: this.syncInterestLifetime },
      retxLimit: 0,
      signal,
      verifier: this.verifier,
    });
    const state = this.codec.buffer2state(payload);
    return { versioned, state };
  }
}
