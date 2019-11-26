import { CancelInterest, Forwarder, FwFace, RejectInterest } from "@ndn/fw";
import { Data, Interest } from "@ndn/packet";
import pushable from "it-pushable";
import PCancelable from "p-cancelable";

export interface ConsumerOptions {
  interest: Interest;
}

export type ConsumerContext = PCancelable<Data>;

export class EndpointConsumer {
  declare public fw: Forwarder;

  public consume({ interest }: ConsumerOptions): ConsumerContext {
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
}
