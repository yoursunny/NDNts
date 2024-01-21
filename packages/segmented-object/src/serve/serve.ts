import { Endpoint } from "@ndn/endpoint";
import { type Data, type Interest, Name, type NameLike } from "@ndn/packet";

import type { ChunkSource } from "./chunk-source/mod";
import { DataProducer } from "./data-producer";

/** Producer that serves a segmented object. */
export interface Server {
  /** Data prefix excluding segment number. */
  readonly prefix: Name;

  /**
   * Process an Interest.
   *
   * The producer handler is already attached to the Endpoint and will react to incoming Interests.
   * It's usually unnecessary to call this function manually.
   */
  processInterest(interest: Interest): Promise<Data | undefined>;

  /** Stop the producer. */
  close(): void;
}

/**
 * Start serving a segmented object.
 * @param prefixInput Data prefix excluding segment number.
 * @param source where to read segment payload chunks.
 * @param opts other options.
 *
 * This function does not automatically add a version component to the name prefix.
 * If a version component is desired, use serveVersioned() function instead.
 */
export function serve(prefixInput: NameLike, source: ChunkSource, opts: serve.Options = {}): Server {
  const prefix = Name.from(prefixInput);
  const { endpoint = new Endpoint() } = opts;
  const dp = DataProducer.create(source, prefix, opts);
  const ep = endpoint.produce(opts.producerPrefix ?? prefix,
    dp.processInterest,
    {
      concurrency: 16,
      describe: opts.describe ?? `serve(${prefix})`,
      announcement: opts.announcement,
    });
  return {
    prefix,
    processInterest: ep.processInterest,
    close() {
      dp.close();
      ep.close();
    },
  };
}

export namespace serve {
  export type Options = DataProducer.Options & {
    /** Use specified Endpoint instead of default. */
    endpoint?: Endpoint;

    /** FwFace description. */
    describe?: string;

    /**
     * Producer name prefix, if differs from Data prefix.
     * Specifying a shorter prefix enables name discovery.
     */
    producerPrefix?: Name;

    /**
     * Prefix announcement.
     * Default is same as producer name prefix or Data prefix.
     * False disables announcement.
     */
    announcement?: Endpoint.RouteAnnouncement;
  };
}
