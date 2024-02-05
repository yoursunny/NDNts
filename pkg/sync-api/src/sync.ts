import { assert } from "@ndn/util";
import type { TypedEventTarget } from "typescript-event-target";

/** A sync protocol participant. */
export interface SyncProtocol<ID = any> extends TypedEventTarget<SyncProtocol.EventMap<ID>> {
  /** Stop the protocol operation. */
  close(): void;

  /** Retrieve a node. */
  get(id: ID): SyncNode<ID> | undefined;

  /** Retrieve or create a node. */
  add(id: ID): SyncNode<ID>;
}

export namespace SyncProtocol {
  export type EventMap<ID> = {
    /** Emitted when a node is updated, i.e. has new sequence numbers. */
    update: SyncUpdate<ID>;
  };
}

/**
 * A sync protocol node.
 * @typeParam ID - Node identifier type, typically number or Name.
 *
 * @remarks
 * Each sync protocol participant may have zero or more nodes.
 */
export interface SyncNode<ID = any> {
  /** Node identifier. */
  readonly id: ID;

  /**
   * Current sequence number.
   *
   * @remarks
   * It can be increased, but cannot be decreased.
   */
  seqNum: number;

  /**
   * Remove this node from participating in the sync protocol.
   *
   * @remarks
   * This may or may not have effect, depending on the sync protocol.
   */
  remove(): void;
}

/** A received update regarding a node. */
export class SyncUpdate<ID = any> extends Event {
  /**
   * Constructor.
   * @param node - The node.
   * @param loSeqNum - Low sequence number, inclusive.
   * @param hiSeqNum - High sequence number, inclusive.
   */
  constructor(
      public readonly node: SyncNode<ID>,
      public readonly loSeqNum: number,
      public readonly hiSeqNum: number,
      eventType = "update",
  ) {
    super(eventType);
    assert(loSeqNum <= hiSeqNum);
  }

  /** Node identifier. */
  public get id(): ID {
    return this.node.id;
  }

  /** Quantity of new sequence numbers. */
  public get count(): number {
    return this.hiSeqNum - this.loSeqNum + 1;
  }

  /** Iterate over new sequence numbers. */
  public *seqNums(): Iterable<number> {
    for (let seqNum = this.loSeqNum; seqNum <= this.hiSeqNum; ++seqNum) {
      yield seqNum;
    }
  }
}
