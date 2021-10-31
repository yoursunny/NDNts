import { Forwarder, FwFace, FwPacket } from "@ndn/fw";
import { Data, Interest, Name, NameLike, Signer, SigType } from "@ndn/packet";
import { flatTransform } from "streaming-iterables";

import type { DataBuffer } from "./data-buffer";

/**
 * Producer handler function.
 *
 * The handler can return a Data to respond to the Interest, or return `undefined` to cause a timeout.
 *
 * If Options.dataBuffer is provided, the handler can access the DataBuffer via producer.dataBuffer .
 * The handler can return a Data to respond to the Interest, which is also inserted to the DataBuffer
 * unless Options.autoBuffer is set to false. If the handler returns `undefined`, the Interest is used
 * to query the DataBuffer, and any matching Data may be sent.
 */
export type ProducerHandler = (interest: Interest, producer: Producer) => Promise<Data | undefined>;

export interface ProducerOptions {
  /** Description for debugging purpose. */
  describe?: string;

  /** AbortSignal that allows closing the producer via AbortController. */
  signal?: AbortSignal;

  /**
   * Whether routes registered by producer would cause @ndn/fw internal FIB to stop matching toward
   * shorter prefixes. Default is true.
   *
   * If all nexthops of a FIB entry are set to non-capture, FIB lookup may continue onto nexthops
   * on FIB entries with shorter prefixes. One use case is in @ndn/sync package, where both local
   * and remote sync participants want to receive each other's Interests.
   */
  routeCapture?: boolean;

  /**
   * What name to be readvertised.
   * Ignored if prefix is undefined.
   */
  announcement?: EndpointProducer.RouteAnnouncement;

  /**
   * How many Interests to process in parallel.
   * Default is 1.
   */
  concurrency?: number;

  /**
   * If specified, automatically sign Data packets unless already signed.
   * This does not apply to Data packets manually inserted to the dataBuffer.
   */
  dataSigner?: Signer;

  /** Outgoing Data buffer. */
  dataBuffer?: DataBuffer;

  /**
   * Whether to add handler return value to buffer.
   * Default is true.
   * Ignored when dataBuffer is not specified.
   */
  autoBuffer?: boolean;
}

/** A running producer. */
export interface Producer {
  readonly prefix: Name | undefined;

  readonly face: FwFace;

  readonly dataBuffer?: DataBuffer;

  /**
   * Process an Interest received elsewhere.
   *
   * Use case of this function:
   * 1. Producer A dynamically creates producer B upon receiving an Interest.
   * 2. Producer A can invoke this function to let producer B generate a response.
   * 3. The response should be sent by producer A.
   */
  processInterest: (interest: Interest) => Promise<Data | undefined>;

  /** Close the producer. */
  close: () => void;
}

/** Producer functionality of Endpoint. */
export class EndpointProducer {
  declare public fw: Forwarder;
  declare public opts: ProducerOptions;

  /**
   * Start a producer.
   * @param prefixInput prefix registration; if undefined, prefixes may be added later.
   * @param handler function to handle incoming Interest.
   */
  public produce(prefixInput: NameLike | undefined, handler: ProducerHandler, opts: ProducerOptions = {}): Producer {
    const prefix = prefixInput === undefined ? undefined : new Name(prefixInput);
    const {
      describe = `produce(${prefix})`,
      signal,
      routeCapture = true,
      announcement,
      concurrency = 1,
      dataSigner,
      dataBuffer,
      autoBuffer = true,
    } = { ...this.opts, ...opts };
    let producer: Producer; // eslint-disable-line prefer-const

    const processInterestUnbuffered = async (interest: Interest) => {
      const data = await handler(interest, producer);
      if (!(data instanceof Data)) {
        return undefined;
      }

      await signUnsignedData(data, dataSigner);
      if (!await data.canSatisfy(interest)) {
        return undefined;
      }
      return data;
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
      duplex: flatTransform(concurrency, async function*({ l3: interest, token }: FwPacket) {
        if (!(interest instanceof Interest)) {
          return;
        }
        const data = await processInterest(interest).catch(() => undefined);
        if (!data) {
          return;
        }
        yield FwPacket.create(data, token);
      }),
    },
    {
      describe,
      local: true,
      routeCapture,
    });
    if (prefix) {
      face.addRoute(prefix, announcement);
    }

    const onAbort = () => {
      face.close();
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort);

    producer = {
      prefix,
      face,
      dataBuffer,
      processInterest,
      close: onAbort,
    };
    return producer;
  }
}

export namespace EndpointProducer {
  export type RouteAnnouncement = FwFace.RouteAnnouncement;
}

export async function signUnsignedData(data: Data, dataSigner: Signer | undefined) {
  if (dataSigner && data.sigInfo.type === SigType.Null) {
    await dataSigner.sign(data);
  }
}
