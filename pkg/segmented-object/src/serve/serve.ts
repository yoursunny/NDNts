import { produce, type ProducerOptions } from "@ndn/endpoint";
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
   * The producer handler is already attached to the logical forwarder and will respond to incoming
   * Interests. It's usually unnecessary to call this function manually.
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
  const {
    producerPrefix = prefix,
    pOpts: pOptsInput,
  } = opts;
  const pOpts: ProducerOptions = {
    describe: `serve(${prefix})`,
    concurrency: 16,
    ...pOptsInput,
  };

  const dp = DataProducer.create(source, prefix, { signer: pOpts.dataSigner, ...opts });
  const ep = produce(producerPrefix, dp.processInterest, pOpts);
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
     * Producer name prefix.
     * @defaultValue Data prefix.
     *
     * @remarks
     * Specifying a shorter prefix enables name discovery.
     */
    producerPrefix?: Name;

    /**
     * Producer options.
     *
     * @remarks
     * - `.describe` defaults to "serve" + Data prefix.
     * - `.concurrency` defaults to 16.
     * - `.announcement` defaults to `producerPrefix`.
     * - {@link DataProducer.Options.signer} defaults to `.dataSigner`.
     */
    pOpts?: ProducerOptions;
  }
}
