import type { Endpoint } from "@ndn/endpoint";
import type { Name, Verifier } from "@ndn/packet";
import { discoverVersion, fetch } from "@ndn/segmented-object";
import AbortController from "abort-controller";

import type { PSyncCodec } from "./codec";
import { PSyncCore } from "./core";

interface Result {
  versioned: Name;
  state: PSyncCore.State;
}

export class PSyncStateFetcher {
  constructor(
      private readonly endpoint: Endpoint,
      private readonly describe: string,
      private readonly codec: PSyncCodec,
      private readonly syncInterestLifetime: number,
      private readonly verifier: Verifier|undefined,
  ) {}

  public async fetch(name: Name, { signal }: AbortController, describeSuffix = "c"): Promise<Result> {
    const versioned = await discoverVersion(name, {
      endpoint: this.endpoint,
      describe: `${this.describe}[${describeSuffix}v]`,
      versionConvention: this.codec.versionConvention,
      segmentNumConvention: this.codec.segmentNumConvention,
      expectedSuffixLen: 2 + this.codec.nUselessCompsAfterIblt,
      modifyInterest: { lifetime: this.syncInterestLifetime },
      retxLimit: 0,
      signal,
      verifier: this.verifier,
    });
    const payload = await fetch(versioned, {
      endpoint: this.endpoint,
      describe: `${this.describe}[${describeSuffix}f]`,
      segmentNumConvention: this.codec.segmentNumConvention,
      modifyInterest: { lifetime: this.syncInterestLifetime },
      retxLimit: 0,
      signal,
      verifier: this.verifier,
    });
    const state = this.codec.buffer2state(payload);
    return { versioned, state };
  }
}
