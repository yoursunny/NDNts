import { CancelInterest, Forwarder, FwFace, RejectInterest } from "@ndn/fw";
import { Data, Interest } from "@ndn/packet";
import pushable from "it-pushable";
import PCancelable from "p-cancelable";

export interface Options {
  interest: Interest;
}

/**
 * Progress of Data retrievel.
 *
 * This is a Promise that resolves with the retrieved Data, and rejects upon timeout.
 * Calling .cancel() cancels Data retrieval and rejects the Promise.
 */
export type Context = PCancelable<Data> & {
  interest: Interest;
};

/** Consumer functionality of Endpoint. */
export class EndpointConsumer {
  declare public fw: Forwarder;

  /** Consume a single piece of Data. */
  public consume(opts: Options): Context;

  /** Consume a single piece of Data. */
  public consume(interest: Interest, opts?: Omit<Options, "interest">): Context;

  public consume(arg1: Options|Interest, arg2?: Omit<Options, "interest">): Context {
    const { interest } = arg1 instanceof Interest ? { interest: arg1, ...arg2 } : arg1;

    const promise = new PCancelable<Data>((resolve, reject, onCancel) => {
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

    return Object.assign(promise, { interest });
  }
}
