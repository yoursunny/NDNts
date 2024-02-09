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
   * @remarks
   * The producer handler is already attached to the Endpoint and will react to incoming Interests.
   * It's usually unnecessary to call this function manually.
   */
  processInterest: (interest: Interest) => Promise<Data | undefined>;

  /** Stop the producer. */
  close: () => void;
}

/**
 * Start serving a segmented object.
 * @param prefix - Data prefix excluding segment number.
 * @param source - Where to read segment payload chunks.
 * @param opts - Other options.
 *
 * @remarks
 * This function does not automatically add a version component to the name prefix.
 * If a version component is desired, use {@link serveVersioned} function instead.
 */
export function serve(prefix: NameLike, source: ChunkSource, opts: serve.Options = {}): Server {
  prefix = Name.from(prefix);
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
  export interface Options extends DataProducer.Options {
    /**
     * Endpoint for communication.
     * @defaultValue
     * Endpoint on default logical forwarder.
     */
    endpoint?: Endpoint;

    /** FwFace description. */
    describe?: string;

    /**
     * Producer name prefix, if it differs from Data prefix.
     *
     * @remarks
     * Specifying a shorter prefix enables name discovery.
     */
    producerPrefix?: Name;

    /**
     * Prefix announcement, or `false` to disable announcement.
     * @defaultValue
     * Announce the same name as producer name prefix or Data prefix.
     */
    announcement?: Endpoint.RouteAnnouncement;
  }
}
