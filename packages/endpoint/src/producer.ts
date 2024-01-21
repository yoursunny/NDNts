import { type Forwarder, type FwFace, FwPacket } from "@ndn/fw";
import { Data, Interest, type Name, type Signer, SigType } from "@ndn/packet";
import { flatTransform } from "streaming-iterables";

import type { DataBuffer } from "./data-buffer";

/**
 * Producer handler function.
 *
 * The handler can return a Data to respond to the Interest, or return `undefined` to cause a timeout.
 *
 * If Options.dataBuffer is provided, the handler can access the DataBuffer via producer.dataBuffer .
 * The handler can return a Data to respond to the Interest, which is also inserted to the DataBuffer
 * unless Options.autoBuffer is set to false. If the handler returns `undefined`, the Interest is used
 * to query the DataBuffer, and any matching Data may be sent.
 */
export type ProducerHandler = (interest: Interest, producer: Producer) => Promise<Data | undefined>;

export interface ProducerOptions {
  /** Description for debugging purpose. */
  describe?: string;

  /** AbortSignal that allows closing the producer via AbortController. */
  signal?: AbortSignal;

  /**
   * Whether routes registered by producer would cause @ndn/fw internal FIB to stop matching toward
   * shorter prefixes. Default is true.
   *
   * If all nexthops of a FIB entry are set to non-capture, FIB lookup may continue onto nexthops
   * on FIB entries with shorter prefixes. One use case is in @ndn/sync package, where both local
   * and remote sync participants want to receive each other's Interests.
   */
  routeCapture?: boolean;

  /**
   * What name to be readvertised.
   * Ignored if prefix is undefined.
   */
  announcement?: FwFace.RouteAnnouncement;

  /**
   * How many Interests to process in parallel.
   * @default 1
   */
  concurrency?: number;

  /**
   * If specified, automatically sign Data packets that are not yet signed.
   * This does not apply to Data packets manually inserted to the dataBuffer.
   */
  dataSigner?: Signer;

  /** Outgoing Data buffer. */
  dataBuffer?: DataBuffer;

  /**
   * Whether to add handler return value to buffer.
   * Ignored when dataBuffer is not specified.
   * @default true
   */
  autoBuffer?: boolean;
}

/** A running producer. */
export interface Producer {
  readonly prefix: Name | undefined;

  readonly face: FwFace;

  readonly dataBuffer?: DataBuffer;

  /**
   * Process an Interest received elsewhere.
   *
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
