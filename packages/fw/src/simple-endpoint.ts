import { Data, Interest } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import pDefer from "p-defer";
import { filter, map, pipeline, transform } from "streaming-iterables";

import { Encoder } from "@ndn/tlv";
import { Forwarder } from "./forwarder";
import { CancelInterest, RejectInterest } from "./reqres";

export class SimpleEndpoint {
  constructor(private readonly fw: Forwarder = Forwarder.getDefault()) {
  }

  public consume(interest: Interest): SimpleEndpoint.Consumer {
    const finish = pDefer<Data|RejectInterest>();
    const cancel = pDefer<true>();
    this.fw.addFace({
      rxtx: {
        rx: {
          async *[Symbol.asyncIterator]() {
            yield interest;
            if (await Promise.race([finish.promise, cancel.promise]) === true) {
              yield new CancelInterest(interest);
              await finish.promise;
            }
          },
        },
        async tx(iterable) {
          for await (const pkt of iterable) {
            finish.resolve(pkt as Data|RejectInterest);
            break;
          }
        },
      },
    });

    return Object.assign(
      (async () => {
        const res = await finish.promise;
        if (res instanceof Data) {
          return res;
        }
        throw new Error(`Interest rejected: ${res.reject}`);
      })(),
      { cancel() { cancel.resolve(true); } },
    );
  }

  public produce({ prefix, handler, concurrency = 1 }: SimpleEndpoint.ProducerOptions): SimpleEndpoint.Producer {
    const face = this.fw.addFace({
      rxtx: (iterable) => {
        return pipeline(
          () => iterable as AsyncIterable<Interest>,
          filter((item) => item instanceof Interest),
          transform(concurrency, handler),
          filter((item) => item !== SimpleEndpoint.TIMEOUT),
          map((item) => {
            const data = item as Data;
            Encoder.encode(data);
            return data as Data;
          }),
        );
      },
    });
    face.addRoute(prefix);
    return {
      close() { face.close(); },
    };
  }
}

export namespace SimpleEndpoint {
  export const TIMEOUT = Symbol("SimpleEndpoint.TIMEOUT");

  export type Consumer = Promise<Data> & {
    cancel(): void;
  };

  export type ProducerHandler = (interest: Interest) => Promise<Data|typeof TIMEOUT>;

  export interface ProducerOptions {
    prefix: Name;
    handler: ProducerHandler;
    concurrency?: number;
  }

  export interface Producer {
    close(): void;
  }
}
