import { Forwarder } from "@ndn/fw";
import { Data, Interest, Name, NameLike } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import { filter, pipeline, tap, transform } from "streaming-iterables";

/**
 * Producer handler function.
 * @returns Data reply, or false to cause timeout.
 */
export type Handler = (interest: Interest) => Promise<Data|false>;

export interface Options {
  concurrency?: number;
}

/** A running producer. */
export interface Producer {
  readonly prefix: Name;

  /** Close the producer. */
  close(): void;
}

/** Producer functionality of Endpoint. */
export class EndpointProducer {
  declare public fw: Forwarder;
  declare public opts: Options;

  /** Produce under a prefix. */
  public produce(prefixInput: NameLike, handler: Handler, opts: Options = {}): Producer {
    const prefix = new Name(prefixInput);
    const {
      concurrency = 1,
    } = { ...this.opts, ...opts };

    const face = this.fw.addFace({
      transform(rxIterable) {
        return pipeline(
          () => rxIterable,
          filter((item): item is Interest => item instanceof Interest),
          transform(concurrency, handler),
          filter((item): item is Data => item instanceof Data),
          tap((data) => Encoder.encode(data)),
        );
      },
      toString() {
        return `produce(${prefix})`;
      },
    },
    {
      local: true,
    });
    face.addRoute(prefix);

    return {
      prefix,
      close() { face.close(); },
    };
  }
}
