import { Data, Interest, Name } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import pushable from "it-pushable";
import PCancelable from "p-cancelable";
import { filter, pipeline, tap, transform } from "streaming-iterables";

import { CancelInterest, Forwarder, FwFace, RejectInterest } from "./mod";

export class SimpleEndpoint {
  constructor(protected readonly fw: Forwarder = Forwarder.getDefault()) {
  }

  public consume(interest: Interest): SimpleEndpoint.Consumer {
    return new PCancelable((resolve, reject, onCancel) => {
      const rx = pushable<FwFace.Rxable>();
      this.fw.addFace({
        extendedTx: true,
        rx,
        async tx(iterable) {
          for await (const pkt of iterable) {
            rx.end();
            if (pkt instanceof Data) {
              resolve(pkt);
            } else {
              reject(new Error(`Interest rejected: ${(pkt as RejectInterest).reason} @${this}`));
            }
            break;
          }
        },
        toString: () => `consume(${interest.name})`,
      } as FwFace.Base & FwFace.RxTxExtended,
      {
        local: true,
      });

      rx.push(interest);
      onCancel(() => rx.push(new CancelInterest(interest)));
      onCancel.shouldReject = false;
    });
  }

  public produce({ prefix, handler, concurrency = 1 }: SimpleEndpoint.ProducerOptions): SimpleEndpoint.Producer {
    const face = this.fw.addFace({
      transform(rxIterable) {
        return pipeline(
          () => rxIterable,
          filter((item): item is Interest => item instanceof Interest),
          transform(concurrency, handler),
          filter((item): item is Data => item !== SimpleEndpoint.TIMEOUT),
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

export namespace SimpleEndpoint {
  export const TIMEOUT = Symbol("SimpleEndpoint.TIMEOUT");

  export type Consumer = PCancelable<Data>;

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
