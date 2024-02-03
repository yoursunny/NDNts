import type { Decoder } from "@ndn/tlv";

const DEFAULT_MTU = 1200;

/**
 * Low-level transport.
 *
 * @remarks
 * The transport understands NDN TLV structures, but does not otherwise concern with packet format.
 */
export abstract class Transport {
  /**
   * Constructor.
   * @param attributes - Attributes of the transport.
   */
  protected constructor(public readonly attributes: Transport.Attributes) {}

  /**
   * Return the transport MTU.
   *
   * @remarks
   * The transport should be able to send TLV structure of up to this size.
   * If not overridden, return a conservative number.
   *
   * Note that this does not restrict incoming packet size.
   */
  public get mtu() { return DEFAULT_MTU; }

  /** Iterable of incoming packets received through the transport. */
  public abstract readonly rx: Transport.RxIterable;

  /**
   * Function to accept outgoing packet stream.
   * @param iterable - Iterable of outgoing packets sent through the transport.
   * Size of each packet cannot exceed `.mtu`.
   * @returns Promise that resolves when iterable is exhausted or rejects upon error.
   */
  public abstract tx(iterable: Transport.TxIterable): Promise<void>;

  /* eslint-disable tsdoc/syntax -- tsdoc-missing-reference */
  /**
   * Reopen the transport after it has failed.
   * @returns The same transport or a new transport after it has been reconnected.
   *
   * @throws {@link \@ndn/l3face!Transport.ReopenNotSupportedError}
   * Thrown to indicate the transport does not support reopening.
   */
  /* eslint-enable tsdoc/syntax */
  // @link needs to be qualified with package name, otherwise TypeDoc will fail to resolve link
  // when this method is inherited into subclass without being overridden or without own TSDoc.
  public reopen(): Promise<Transport> {
    return Promise.reject(new Transport.ReopenNotSupportedError());
  }

  public toString() {
    /* c8 ignore next */
    return this.attributes.describe ?? this.constructor.name;
  }
}

export namespace Transport {
  export interface Attributes extends Record<string, unknown> {
    /**
     * Textual description.
     * @defaultValue
     * Automatically generated from constructor name.
     */
    describe?: string;

    /**
     * Whether the transport connects to a destination on the local machine.
     * @defaultValue `false`
     */
    local?: boolean;

    /**
     * Whether the transport can possibly talk to multiple peers.
     * @defaultValue `false`
     */
    multicast?: boolean;

    [k: string]: unknown;
  }

  /** RX packet stream. */
  export type RxIterable = AsyncIterable<Decoder.Tlv>;

  /** TX packet stream. */
  export type TxIterable = AsyncIterable<Uint8Array>;

  /**
   * Error thrown by {@link Transport.reopen} to indicate that reopen operation is not supported.
   * No further `.reopen()` should be attempted.
   */
  export class ReopenNotSupportedError extends Error {
    constructor() {
      super("reopen not supported");
    }
  }
}
