import { CancelInterest, Forwarder, FwPacket } from "@ndn/fw";
import { Data, Interest, type NameLike, type Verifier } from "@ndn/packet";
import { pushable } from "@ndn/util";

import { type CommonOptions, exactOptions } from "./common";
import { makeRetxGenerator, type RetxPolicy } from "./retx";

/** {@link consume} options. */
export interface ConsumerOptions extends CommonOptions {
  /**
   * Modify Interest according to specified options.
   * @defaultValue
   * `undefined`, no modification.
   */
  modifyInterest?: Interest.Modify;

  /**
   * Retransmission policy.
   * @defaultValue
   * `undefined`, no retransmission.
   */
  retx?: RetxPolicy;

  /**
   * Data verifier.
   * @defaultValue
   * `undefined`, no verification.
   */
  verifier?: Verifier;
}
export namespace ConsumerOptions {
  export function exact(opts: ConsumerOptions = {}): ConsumerOptions {
    return exactOptions(opts, ["modifyInterest", "retx", "verifier"]);
  }
}

/**
 * Progress of Data retrieval.
 *
 * @remarks
 * This is a Promise that resolves with the retrieved Data and rejects upon timeout,
 * annotated with the Interest and some counters.
 */
export interface ConsumerContext extends Promise<Data> {
  /** Interest packet, after any modifications. */
  readonly interest: Interest;

  /**
   * Number of retransmissions sent so far.
   *
   * @remarks
   * The initial Interest does not count as a retransmission.
   */
  readonly nRetx: number;

  /**
   * Duration (milliseconds) between last Interest transmission and Data arrival.
   *
   * @remarks
   * This is a valid RTT measurement if {@link nRetx} is zero.
   */
  readonly rtt: number | undefined;
}

function makeConsumer(
    interest: Interest,
    {
      fw = Forwarder.getDefault(),
      describe = `consume(${interest.name})`,
      signal,
      modifyInterest,
      retx,
      verifier,
    }: ConsumerOptions,
): ConsumerContext {
  Interest.makeModifyFunc(modifyInterest)(interest);

  let txTime = 0;
  let rtt: number | undefined;
  let nRetx = -1;
  const retxGen = makeRetxGenerator(retx)(interest.lifetime)[Symbol.iterator]();

  const promise = new Promise<Data>((resolve, reject) => {
    const rx = pushable<FwPacket>();

    let timer: NodeJS.Timeout | number | undefined;
    const cancelRetx = () => {
      clearTimeout(timer);
      timer = undefined;
    };

    const sendInterest = () => {
      cancelRetx();
      const { value, done } = retxGen.next();
      if (!done) {
        timer = setTimeout(sendInterest, value);
      }
      rx.push(FwPacket.create(interest));
      txTime = performance.now();
      ++nRetx;
    };

    const onAbort = () => {
      cancelRetx();
      rx.push(new CancelInterest(interest));
    };
    signal?.addEventListener("abort", onAbort);

    fw.addFace(
      {
        rx,
        async tx(iterable) {
          for await (const pkt of iterable) {
            if (pkt.l3 instanceof Data) {
              rtt = performance.now() - txTime;
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
          rx.stop();
        },
      },
      {
        describe,
        local: true,
      },
    );

    sendInterest();
  });

  return Object.defineProperties(promise, {
    interest: { value: interest },
    nRetx: { get() { return nRetx; } },
    rtt: { get() { return rtt; } },
  }) as ConsumerContext;
}

/**
 * Retrieve a single piece of Data.
 * @param interest - Interest or Interest name.
 */
export function consume(interest: Interest | NameLike, opts: ConsumerOptions = {}): ConsumerContext {
  return makeConsumer(
    interest instanceof Interest ? interest : new Interest(interest),
    opts,
  );
}
