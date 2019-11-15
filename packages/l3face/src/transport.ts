import { Decoder } from "@ndn/tlv";

/**
 * Low-level transport.
 *
 * The transport understands NDN TLV structures, but does not otherwise concern with packet format.
 */
export abstract class Transport {
  public abstract readonly rx: Transport.Rx;
  public abstract readonly tx: Transport.Tx;

  protected constructor(public readonly attributes: Transport.Attributes) {
  }

  public reopen(): Promise<Transport> {
    /* istanbul ignore next */
    return Promise.reject("reopen not supported");
  }

  public toString() {
    /* istanbul ignore next */
    return this.attributes.describe ?? this.constructor.name;
  }
}

export namespace Transport {
  export interface Attributes extends Record<string, any> {
    describe?: string;
    local?: boolean;
  }

  /** RX iterable for incoming packets. */
  export type Rx = AsyncIterable<Decoder.Tlv>;

  /**
   * TX function for outgoing packets.
   * @returns Promise that resolves when iterable is exhausted, and rejects upon error.
   */
  export type Tx = (iterable: AsyncIterable<Uint8Array>) => Promise<void>;
}
