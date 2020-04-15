import { Forwarder, FwFace, InterestToken } from "@ndn/fw";
import { canSatisfy, Data, Interest, Name, NameLike } from "@ndn/packet";
import { flatTransform } from "streaming-iterables";

import { DataBuffer } from "./data-buffer";

/**
 * Producer handler function.
 *
 * The handler can return a Data to respond to the Interest, or return 'false' to cause a timeout.
 *
 * If Options.dataBuffer is provided, the handler can have access to the DataBuffer via
 * producer.dataBuffer . The handler can return a Data to respond to the Interest, which is also
 * inserted to the DataBuffer unless Options.autoBuffer is set to false. If the handler returns
 * 'false', the Interest is used to query the DataBuffer, and any matching Data may be sent.
 */
export type Handler = (interest: Interest, producer: Producer) => Promise<Data|false>;

export interface Options {
  /** How many Interests to process in parallel. */
  concurrency?: number;
  /** Description for debugging purpose. */
  describe?: string;
  /** Outgoing Data buffer. */
  dataBuffer?: DataBuffer;
  /** Whether to add handler return value to buffer. Default is true. */
  autoBuffer?: boolean;
}

/** A running producer. */
export interface Producer {
  readonly prefix: Name|undefined;

  readonly face: FwFace;

  readonly dataBuffer?: DataBuffer;

  /** Close the producer. */
  close(): void;
}

/** Producer functionality of Endpoint. */
export class EndpointProducer {
  declare public fw: Forwarder;
  declare public opts: Options;

  /**
   * Start a producer.
   * @param prefixInput prefix registration; if undefined, prefixes may be added later.
   * @param handler function to handle incoming Interest.
   */
  public produce(prefixInput: NameLike|undefined, handler: Handler, opts: Options = {}): Producer {
    const prefix = typeof prefixInput === "undefined" ? undefined : new Name(prefixInput);
    const {
      concurrency = 1,
      describe = `produce(${prefix})`,
      dataBuffer,
      autoBuffer = true,
    } = { ...this.opts, ...opts };
    let producer: Producer; // eslint-disable-line prefer-const

    const processInterestUnbuffered = async (interest: Interest) => {
      const output = await handler(interest, producer);
      if (output instanceof Data) {
        if (!await canSatisfy(interest, output)) {
          return undefined;
        }
        return output;
      }
      return undefined;
    };
    let processInterest = processInterestUnbuffered;
    if (dataBuffer) {
      processInterest = async (interest: Interest) => {
        let found = await dataBuffer.find(interest);
        if (!found) {
          const output = await processInterestUnbuffered(interest);
          if (output) {
            if (autoBuffer) { await dataBuffer.insert(output); }
            return output;
          }
          found = await dataBuffer.find(interest);
        }
        return found;
      };
    }

    const face = this.fw.addFace({
      transform: flatTransform(concurrency, async function*(interest: FwFace.Txable) {
        if (!(interest instanceof Interest)) {
          return;
        }
        // TODO return Nack upon rejected Promise
        const data = await processInterest(interest).catch(() => undefined);
        if (!data) {
          return;
        }
        yield InterestToken.copyProxied(interest, data);
      }),
      toString: () => describe,
    },
    {
      local: true,
    });
    if (prefix) {
      face.addRoute(prefix);
    }

    producer = {
      prefix,
      face,
      dataBuffer,
      close() { face.close(); },
    };
    return producer;
  }
}
