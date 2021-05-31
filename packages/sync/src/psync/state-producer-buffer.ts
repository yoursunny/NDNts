import type { Endpoint } from "@ndn/endpoint";
import type { Name, Signer } from "@ndn/packet";
import { BufferChunkSource, Server, serveVersioned } from "@ndn/segmented-object";
import assert from "minimalistic-assert";

import type { PSyncCodec } from "./codec";
import { PSyncCore } from "./core";

export class PSyncStateProducerBuffer {
  constructor(
      private readonly endpoint: Endpoint,
      private readonly describe: string,
      private readonly codec: PSyncCodec,
      private readonly signer: Signer | undefined,
      private readonly limit: number,
  ) {
    assert(limit >= 1);
  }

  private readonly servers: Server[] = [];

  public close(): void {
    this.evict(0);
  }

  public add(name: Name, state: PSyncCore.State, freshnessPeriod: number): Server {
    const source = new BufferChunkSource(this.codec.state2buffer(state));
    const server = serveVersioned(name, source, {
      segmentNumConvention: this.codec.segmentNumConvention,
      versionConvention: this.codec.versionConvention,
      freshnessPeriod,
      signer: this.signer,
      endpoint: this.endpoint,
      describe: `${this.describe}[pb]`,
      announcement: false,
    });
    this.servers.push(server);
    this.evict();
    return server;
  }

  private evict(n = this.limit): void {
    while (this.servers.length > n) {
      const server = this.servers.shift();
      server!.close();
    }
  }
}
