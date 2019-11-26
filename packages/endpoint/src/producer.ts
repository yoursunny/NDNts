import { Forwarder } from "@ndn/fw";
import { Data, Interest, Name } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import { filter, pipeline, tap, transform } from "streaming-iterables";

export type ProducerHandler = (interest: Interest) => Promise<Data|false>;

export interface ProducerOptions {
  prefix: Name;
  handler: ProducerHandler;
  concurrency?: number;
}

export interface Producer {
  close(): void;
}

export class EndpointProducer {
  declare public fw: Forwarder;

  public produce({ prefix, handler, concurrency = 1 }: ProducerOptions): Producer {
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
      close() { face.close(); },
    };
  }
}
