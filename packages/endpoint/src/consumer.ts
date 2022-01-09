import { CancelInterest, type Forwarder, FwPacket } from "@ndn/fw";
import { Data, Interest, type NameLike, type Verifier } from "@ndn/packet";
import pushable from "it-pushable";

import { makeRetxGenerator, type RetxPolicy } from "./retx";

export interface ConsumerOptions {
  /** Description for debugging purpose. */
  describe?: string;

  /** AbortSignal that allows canceling the Interest via AbortController. */
  signal?: AbortSignal;

  /**
   * Modify Interest according to specified options.
   * Default is no modification.
   */
  modifyInterest?: Interest.Modify;

  /**
   * Retransmission policy.
   * Default is disabling retransmission.
   */
  retx?: RetxPolicy;

  /**
   * Data verifier.
   * Default is no verification.
   */
  verifier?: Verifier;
}

/**
 * Progress of Data retrieval.
 *
 * This is a Promise that resolves with the retrieved Data and rejects upon timeout,
 * annotated with the Interest and some counters.
 */
export interface ConsumerContext extends Promise<Data> {
  readonly interest: Interest;
  readonly nRetx: number;
}

/** Consumer functionality of Endpoint. */
export class EndpointConsumer {
  declare public fw: Forwarder;
  declare public opts: ConsumerOptions;

  /** Consume a single piece of Data. */
  public consume(interestInput: Interest | NameLike, opts: ConsumerOptions = {}): ConsumerContext {
    const interest = interestInput instanceof Interest ? interestInput : new Interest(interestInput);
    const {
      describe = `consume(${interest.name})`,
      signal,
      modifyInterest,
      retx,
      verifier,
    } = { ...this.opts, ...opts };
    Interest.makeModifyFunc(modifyInterest)(interest);

    let nRetx = -1;
    const retxGen = makeRetxGenerator(retx)(interest.lifetime)[Symbol.iterator]();

    const promise = new Promise<Data>((resolve, reject) => {
      const rx = pushable<FwPacket>();

      let timer: NodeJS.Timeout | number | undefined;
      const cancelRetx = () => {
        if (timer) { clearTimeout(timer as any); }
        timer = undefined;
      };

      const sendInterest = () => {
        cancelRetx();
        const { value, done } = retxGen.next();
        if (!done) {
          timer = setTimeout(sendInterest, value);
        }
        rx.push(FwPacket.create(interest));
        ++nRetx;
      };

      const onAbort = () => {
        cancelRetx();
        rx.push(new CancelInterest(interest));
      };
      signal?.addEventListener("abort", onAbort);

      this.fw.addFace({
        rx,
        async tx(iterable) {
          for await (const pkt of iterable) {
            if (pkt.l3 instanceof Data) {
              try {
                await verifier?.verify(pkt.l3);
              } catch (err: unknown) {
                reject(new Error(`Data verify failed: ${err} @${describe}`));
                break;
              }
              resolve(pkt.l3);
              break;
            }
            if (pkt.reject && !timer) {
              reject(new Error(`Interest rejected: ${pkt.reject} @${describe}`));
              break;
            }
          }
          cancelRetx();
          signal?.removeEventListener("abort", onAbort);
          rx.end();
        },
      },
      {
        describe,
        local: true,
      });

      sendInterest();
    });

    return Object.defineProperties(promise, {
      interest: { value: interest },
      nRetx: { get() { return nRetx; } },
    }) as ConsumerContext;
  }
}
