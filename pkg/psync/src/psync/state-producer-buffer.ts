import type { ProducerOptions } from "@ndn/endpoint";
import type { Name } from "@ndn/packet";
import { BufferChunkSource, type Server, serveVersioned } from "@ndn/segmented-object";
import { assert } from "@ndn/util";

import type { PSyncCodec } from "./codec";
import type { PSyncCore } from "./core";

export class StateProducerBuffer {
  constructor(
      describe: string,
      private readonly codec: PSyncCodec,
      private readonly limit: number,
      pOpts: ProducerOptions,
  ) {
    assert(limit >= 1);
    this.pOpts = {
      ...pOpts,
      describe: `${describe}[pb]`,
      announcement: false,
    };
  }

  private readonly pOpts: ProducerOptions;
  private readonly servers: Server[] = [];

  public close(): void {
    this.evict(0);
  }

  public add(name: Name, state: PSyncCore.State, freshnessPeriod: number): Server {
    const source = new BufferChunkSource(this.codec.state2buffer(state));
    const server = serveVersioned(name, source, {
      freshnessPeriod,
      pOpts: this.pOpts,
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
