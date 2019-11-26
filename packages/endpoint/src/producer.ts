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
  prefix: NameLike;
  handler: Handler;
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

  /** Produce under a prefix. */
  public produce(opts: Options): Producer;

  /** Produce under a prefix. */
  public produce(prefix: NameLike, handler: Handler, opts?: Omit<Options, "prefix"|"handler">): Producer;

  public produce(arg1: Options|NameLike, arg2?: Handler, arg3?: Omit<Options, "prefix"|"handler">): Producer {
    const {
      prefix: prefixInput,
      handler,
      concurrency = 1,
    } = !arg2 ? arg1 as Options : { prefix: arg1 as NameLike, handler: arg2, ...arg3 };
    const prefix = new Name(prefixInput);

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
