import { Data, Interest } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import { Encoder } from "@ndn/tlv";
import pDefer from "p-defer";
import { filter, pipeline, tap, transform } from "streaming-iterables";

import { Face } from "./face";
import { Forwarder } from "./forwarder";
import { CancelInterest, RejectInterest } from "./reqres";

export class SimpleEndpoint {
  constructor(protected readonly fw: Forwarder = Forwarder.getDefault()) {
  }

  public consume(interest: Interest): SimpleEndpoint.Consumer {
    const finish = pDefer<Data|RejectInterest>();
    const abort = pDefer<true>();
    this.fw.addFace({
      extendedTx: true,
      rx: {
        async *[Symbol.asyncIterator]() {
          yield interest;
          if (await Promise.race([finish.promise, abort.promise]) === true) {
            yield new CancelInterest(interest);
            await finish.promise;
          }
        },
      },
      toString() {
        return `consume(${interest.name})`;
      },
      async tx(iterable) {
        for await (const pkt of iterable) {
          finish.resolve(pkt as Data|RejectInterest);
          break;
        }
      },
    } as Face.Base & Face.RxTxExtended);

    return Object.assign(
      (async () => {
        const res = await finish.promise;
        if (res instanceof Data) {
          return res;
        }
        throw new Error(`Interest rejected: ${res.reason}`);
      })(),
      { abort() { abort.resolve(true); } },
    );
  }

  public produce({ prefix, handler, concurrency = 1 }: SimpleEndpoint.ProducerOptions): SimpleEndpoint.Producer {
    const face = this.fw.addFace({
      toString() {
        return `produce(${prefix})`;
      },
      transform(rxIterable) {
        return pipeline(
          () => rxIterable,
          filter((item): item is Interest => item instanceof Interest),
          transform(concurrency, handler),
          filter((item): item is Data => item !== SimpleEndpoint.TIMEOUT),
          tap((data) => Encoder.encode(data)),
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
    abort(): void;
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
