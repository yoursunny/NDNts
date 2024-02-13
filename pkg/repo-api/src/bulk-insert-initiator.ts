import { Transport } from "@ndn/l3face";
import type { Data } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import { CustomEvent, pushable } from "@ndn/util";
import pDefer, { type DeferredPromise } from "p-defer";
import { consume } from "streaming-iterables";
import { TypedEventTarget } from "typescript-event-target";

import * as S from "./data-store";

interface Burst {
  pkts: AsyncIterable<Data>;
  defer: DeferredPromise<undefined>;
}

type EventMap = {
  /** Emitted when the transport TX side has an error. */
  error: CustomEvent<Error>;
};

/** Send packets to a bulk insertion target. */
export class BulkInsertInitiator extends TypedEventTarget<EventMap> implements S.Insert, AsyncDisposable {
  /* eslint-disable tsdoc/syntax -- tsdoc-missing-reference */
  /**
   * Constructor.
   * @param tr - Transport connected to bulk insertion target.
   * Typically, this is a subclass of {@link \@ndn/l3face!Transport}. The RX side is opened and
   * any received packets are discarded. The outgoing Data packet stream is passed to TX side.
   * If the transport has a finite MTU, any Data packets exceeding MTU are silently dropped.
   *
   * You can connect to repo-ng or ndn-python-repo by creating a TCP transport with
   * {@link \@ndn/node-transport!TcpTransport.connect}. However, it is recommended to use
   * {@link \@ndn/pyrepo!PyRepoClient} for inserting Data into ndn-python-repo.
   */
  /* eslint-enable tsdoc/syntax */
  constructor(tr: Pick<Transport, "tx">) {
    super();
    if (tr instanceof Transport) {
      consume(tr.rx).catch(() => undefined);
      this.mtu = tr.mtu;
    }
    this.transportTx = tr.tx(this.tx()).catch((err: unknown) => {
      this.dispatchTypedEvent("error", new CustomEvent("error", {
        detail: err instanceof Error ? err : new Error(`${err}`),
      }));
    });
  }

  private readonly mtu = Infinity;
  private readonly queue = pushable<Burst>();
  private readonly transportTx: Promise<void>;

  /**
   * Finish insertion and close the connection to the target.
   *
   * @remarks
   * `.insert()` cannot be called after this.
   */
  public async [Symbol.asyncDispose](): Promise<void> {
    this.queue.stop();
    await this.transportTx;
  }

  /**
   * Send packets to the target.
   * @returns Promise that resolves when the packets are scheduled for transmission.
   * It does not imply the target has received or accepted these packets.
   */
  public async insert(...args: S.Insert.Args<{}>): Promise<void> {
    const { pkts } = S.Insert.parseArgs<{}>(args);
    const defer = pDefer<undefined>();
    this.queue.push({ pkts, defer });
    return defer.promise;
  }

  private async *tx(): Transport.TxIterable {
    for await (const burst of this.queue) {
      for await (const data of burst.pkts) {
        const wire = Encoder.encode(data);
        if (wire.length > this.mtu) {
          continue;
        }
        yield wire;
      }
      burst.defer.resolve();
    }
  }
}
