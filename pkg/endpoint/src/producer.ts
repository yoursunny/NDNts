import { Forwarder, type FwFace, FwPacket } from "@ndn/fw";
import { Data, Interest, Name, type NameLike, Signer } from "@ndn/packet";
import { flatTransform } from "streaming-iterables";

import { type CommonOptions, exactOptions } from "./common";
import type { DataBuffer } from "./data-buffer";

/**
 * Producer handler function.
 * @param interest - Incoming Interest.
 * @param producer - Producer context.
 *
 * @remarks
 * The handler may be invoked concurrently up to {@link ProducerOptions.concurrency} instances.
 * The handler should return a Promise that resolves to:
 * - Data satisfying the Interest: send Data to consumer(s).
 *   - If Data is not signed, it is signed with {@link ProducerOptions.dataSigner}.
 * - Data that does not satisfy the Interest or `undefined`:
 *   - {@link ProducerOptions.dataBuffer} is unset: cause a timeout.
 *   - {@link ProducerOptions.dataBuffer} is provided: query the DataBuffer.
 */
export type ProducerHandler = (interest: Interest, producer: Producer) => Promise<Data | undefined>;

/** {@link produce} options. */
export interface ProducerOptions extends CommonOptions {
  /**
   * Whether routes registered by producer would cause `@ndn/fw` internal FIB to stop matching
   * toward shorter prefixes.
   * @defaultValue `true`
   *
   * @remarks
   * If all nexthops of a FIB entry are set to non-capture, FIB lookup may continue onto nexthops
   * on FIB entries with shorter prefixes. One use case is in dataset synchronization protocols,
   * where both local and remote sync participants want to receive each other's Interests.
   */
  routeCapture?: boolean;

  /**
   * What name to be readvertised.
   * Ignored if prefix is `undefined`.
   */
  announcement?: ProducerOptions.RouteAnnouncement;

  /**
   * How many Interests to process in parallel.
   * @defaultValue 1
   */
  concurrency?: number;

  /**
   * If specified, automatically sign Data packets that are not yet signed.
   *
   * @remarks
   * If the {@link ProducerHandler} returns a Data packet that is not signed (its SigType is
   * *Null*), it is automatically signed with this signer.
   *
   * This option does not apply to Data packets manually inserted into `.dataBuffer`. To auto-sign
   * those packet, specify {@link DataStoreBuffer.Options.dataSigner} in addition.
   */
  dataSigner?: Signer;

  /**
   * Outgoing Data buffer.
   *
   * @remarks
   * Providing an outgoing Data buffer allows the {@link ProducerHandler} to prepare multiple Data
   * packets in response to one Interest, in which one Data satisfies the current Interest and
   * additional Data satisfy upcoming Interests. This is useful for a producer that generates a
   * multi-segment response triggered by a single Interest, such as a
   * {@link https://redmine.named-data.net/projects/nfd/wiki/StatusDataset | StatusDataset}
   * producer in NFD Management protocol.
   *
   * The producer handler can prepare the Data packets and insert them to the DataBuffer. Either it
   * can return `undefined`, so that the DataBuffer is queried with the current Interest and the
   * first matching Data is sent. Or it can return a specific Data packet for satisfying the
   * current Interest.
   */
  dataBuffer?: DataBuffer;

  /**
   * Whether to add handler return value to `.dataBuffer`.
   * @defaultValue `true`
   *
   * @remarks
   * This is only relevant when `.dataBuffer` is set. If `true`, when the {@link ProducerHandler}
   * returns a Data packet, it is automatically inserted to the DataBuffer.
   */
  autoBuffer?: boolean;
}

export namespace ProducerOptions {
  /** Describe how to derive route announcement from name prefix in {@link produce}. */
  export type RouteAnnouncement = FwFace.RouteAnnouncement;

  export function exact(opts: ProducerOptions = {}): ProducerOptions {
    return exactOptions(opts, ["routeCapture", "announcement", "concurrency", "dataSigner", "dataBuffer", "autoBuffer"]);
  }
}

/** A running producer. */
export interface Producer extends Disposable {
  /**
   * Prefix specified in {@link produce} call.
   * Additional prefixes can be added via `.face.addRoute()`.
   */
  readonly prefix: Name | undefined;

  /** Logical forwarder face for this producer. */
  readonly face: FwFace;

  /** Outgoing Data buffer. */
  readonly dataBuffer?: DataBuffer;

  /**
   * Process an Interest received elsewhere.
   *
   * @remarks
   * Use case of this function:
   * 1. Producer A dynamically creates producer B upon receiving an Interest.
   * 2. Producer A can invoke this function to let producer B generate a response.
   * 3. The response should be sent by producer A.
   */
  processInterest: (interest: Interest) => Promise<Data | undefined>;

  /** Close the producer. */
  close: () => void;
}

class ProducerImpl implements Producer {
  constructor(
      public readonly prefix: Name | undefined,
      private readonly handler: ProducerHandler,
      {
        fw = Forwarder.getDefault(),
        describe = `produce(${prefix})`,
        signal,
        routeCapture = true,
        announcement,
        concurrency = 1,
        dataSigner,
        dataBuffer,
        autoBuffer = true,
      }: ProducerOptions,
  ) {
    this.signal = signal;
    this.dataSigner = dataSigner && Signer.onlyIfUnsigned(dataSigner);
    this.dataBuffer = dataBuffer;

    this.face = fw.addFace(
      {
        duplex: flatTransform(concurrency, this.faceDuplex.bind(this)),
      },
      {
        describe,
        local: true,
        routeCapture,
      },
    );
    if (prefix) {
      this.face.addRoute(prefix, announcement);
    }

    this.processInterest = this.dataBuffer ?
      this.processBuffered.bind(this, autoBuffer) :
      this.processUnbuffered;
    signal?.addEventListener("abort", this.close);
  }

  public readonly face: FwFace;
  private readonly signal?: AbortSignal;
  private readonly dataSigner?: Signer;
  public readonly dataBuffer?: DataBuffer;

  private async *faceDuplex({ l3: interest, token }: FwPacket): AsyncGenerator<FwPacket> {
    if (!(interest instanceof Interest)) {
      return;
    }

    const data = await this.processInterest(interest).catch(() => undefined);
    if (data) {
      yield FwPacket.create(data, token);
    }
  }

  public readonly processInterest: (interest: Interest) => Promise<Data | undefined>;

  private processUnbuffered = async (interest: Interest): Promise<Data | undefined> => {
    const data = await this.handler(interest, this);
    if (!(data instanceof Data)) {
      return undefined;
    }

    await this.dataSigner?.sign(data);
    if (!await data.canSatisfy(interest)) { // isCacheLookup=false because the buffer is not considered a cache
      return undefined;
    }
    return data;
  };

  private async processBuffered(autoBuffer: boolean, interest: Interest): Promise<Data | undefined> {
    let found = await this.dataBuffer!.find(interest);
    if (!found) {
      const output = await this.processUnbuffered(interest);
      if (output) {
        if (autoBuffer) {
          await this.dataBuffer!.insert(output);
        }
        return output;
      }
      found = await this.dataBuffer!.find(interest);
    }
    return found;
  }

  public readonly close = (): void => {
    this.face.close();
    this.signal?.removeEventListener("abort", this.close);
  };

  public [Symbol.dispose](): void {
    this.close();
  }
}

/**
 * Start a producer.
 * @param prefix - Prefix registration; if `undefined`, prefixes may be added later.
 * @param handler - Function to handle incoming Interest.
 */
export function produce(prefix: NameLike | undefined, handler: ProducerHandler, opts: ProducerOptions = {}): Producer {
  return new ProducerImpl(
    prefix === undefined ? undefined : Name.from(prefix),
    handler,
    opts,
  );
}
