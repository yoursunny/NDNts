import SimpleSignal from "simplesignal";

/**
 * Low-level transport.
 *
 * The transport understands NDN TLV structures, but does not otherwise concern with packet format.
 */
export interface Transport {
  /**
   * RX stream for incoming packets.
   *
   * Readable side of this stream operates in object mode. Each object is a Decoder.Tlv.
   */
  readonly rx: NodeJS.ReadableStream;

  /**
   * TX stream for outgoing packets.
   *
   * Writable side of this stream operates in object mode. Each object is an Uint8Array.
   */
  readonly tx: NodeJS.WritableStream;

  /** Signal when the transport is closed, possibly due to error. */
  readonly onEnd: Omit<SimpleSignal<Transport.EndCallback>, "dispatch">;

  /** Request to close the transport. */
  close(): Promise<void>;
}

export namespace Transport {
  export type EndCallback = (error?: Error) => any;
}
