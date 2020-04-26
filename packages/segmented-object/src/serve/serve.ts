import { Endpoint } from "@ndn/endpoint";
import { Name, NameLike } from "@ndn/packet";

import type { ChunkSource } from "./chunk-source/mod";
import { DataProducer } from "./data-producer";

/** Options to serve(). */
export type ServeOptions = DataProducer.Options & {
  /** Use specified Endpoint instead of default. */
  endpoint?: Endpoint;

  /**
   * Producer name prefix, if differs from Data prefix.
   * Specifying a shorter prefix enables name discovery.
   */
  producerPrefix?: Name;
};

export interface Server {
  readonly prefix: Name;
  close: () => void;
}

/**
 * Start serving an segmented object.
 * @param prefixInput Data prefix excluding segment number.
 * @param source where to read segment payload chunks.
 * @param opts other options.
 */
export function serve(prefixInput: NameLike, source: ChunkSource, opts: ServeOptions = {}): Server {
  const prefix = new Name(prefixInput);
  const { endpoint = new Endpoint() } = opts;
  const producer = DataProducer.create(source, prefix, opts);

  const prod = endpoint.produce(opts.producerPrefix ?? prefix,
    producer.processInterest,
    {
      concurrency: 16,
      describe: `serve(${prefix})`,
    });
  return {
    prefix,
    close() {
      producer.close();
      prod.close();
    },
  };
}
