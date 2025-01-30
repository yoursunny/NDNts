import type { ProducerOptions } from "@ndn/endpoint";
import type { Name } from "@ndn/packet";
import { BufferChunkSource, type Server, serveVersioned } from "@ndn/segmented-object";
import { assert, evict } from "@ndn/util";

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
  private readonly servers = new Set<Server>();

  public close(): void {
    for (const server of this.servers) {
      server.close();
    }
  }

  public async add(name: Name, state: PSyncCore.State, freshnessPeriod: number): Promise<Server> {
    const source = new BufferChunkSource(await this.codec.state2buffer(state));
    const server = serveVersioned(name, source, {
      freshnessPeriod,
      pOpts: this.pOpts,
    });
    this.servers.add(server);
    evict(this.limit, this.servers, (server) => server.close());
    return server;
  }
}
