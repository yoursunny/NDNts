import { Emitter } from "./transport-events";

/**
 * Low-level transport.
 *
 * The transport understands NDN TLV structures, but does not otherwise concern with packet format.
 */
export interface Transport extends Emitter {
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

  /** Request to close the transport. */
  close(): Promise<void>;
}
