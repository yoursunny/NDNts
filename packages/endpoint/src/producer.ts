import { type Forwarder, type FwFace, FwPacket } from "@ndn/fw";
import { Data, Interest, type Name, type Signer, SigType } from "@ndn/packet";
import { flatTransform } from "streaming-iterables";

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

/** {@link Endpoint.produce} options. */
export interface ProducerOptions {
  /**
   * Description for debugging purpose.
   * @defaultValue "produce" + prefix.
   */
  describe?: string;

  /** AbortSignal that allows closing the producer via AbortController. */
  signal?: AbortSignal;

  /**
   * Whether routes registered by producer would cause `@ndn/fw` internal FIB to stop matching
   * toward shorter prefixes.
   * @defaultValue `true`
   *
   * @remarks
   * If all nexthops of a FIB entry are set to non-capture, FIB lookup may continue onto nexthops
   * on FIB entries with shorter prefixes. One use case is in `@ndn/sync` package, where both local
   * and remote sync participants want to receive each other's Interests.
   */
  routeCapture?: boolean;

  /**
   * What name to be readvertised.
   * Ignored if prefix is `undefined`.
   */
  announcement?: FwFace.RouteAnnouncement;

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
   * additional Data satisfy upcoming Interest. This is useful for a producer that generates a
   * multi-segment response triggered by a single Interest, such as a
   * {@link https://redmine.named-data.net/projects/nfd/wiki/StatusDataset | StatusDataset}
   * producer in NFD Management protocol.
   *
   * The producer can prepare the Data packets and insert them to the DataBuffer, and then return
   * `undefined`, so that the Interest is used to query the DataBuffer and the first matching Data
   * is sent. The producer can also return a specify Data packet to satisfy the current Interest.
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

/** A running producer. */
export interface Producer {
  /**
   * Prefix specified in {@link Endpoint.produce} call.
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
  processInterest(interest: Interest): Promise<Data | undefined>;

  /** Close the producer. */
  close(): void;
}

export class ProducerImpl implements Producer {
  constructor(
      fw: Forwarder,
      public readonly prefix: Name | undefined,
      private readonly handler: ProducerHandler,
      {
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
    this.dataSigner = dataSigner;
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
      this.processUnbuffered.bind(this);
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

  private async processUnbuffered(interest: Interest): Promise<Data | undefined> {
    const data = await this.handler(interest, this);
    if (!(data instanceof Data)) {
      return undefined;
    }

    await signUnsignedData(data, this.dataSigner);
    if (!await data.canSatisfy(interest)) { // isCacheLookup=false because the buffer is not considered a cache
      return undefined;
    }
    return data;
  }

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
}

export async function signUnsignedData(data: Data, dataSigner: Signer | undefined) {
  if (dataSigner && data.sigInfo.type === SigType.Null) {
    await dataSigner.sign(data);
  }
}
