import type { Name } from "@ndn/packet";
import assert from "minimalistic-assert";
import type TypedEmitter from "typed-emitter";

/** A sync protocol participant. */
export interface SyncProtocol<ID = any> extends TypedEmitter<SyncProtocol.Events<ID>> {
  /** Stop the protocol operation. */
  close(): void;

  /** Retrieve a node. */
  get(id: ID): SyncNode<ID>|undefined;

  /** Retrieve or create a node. */
  add(id: ID): SyncNode<ID>;
}

export namespace SyncProtocol {
  export interface Events<ID> {
    /** Emitted when a node is updated, i.e. has new sequence numbers. */
    update: (update: SyncUpdate<ID>) => void;
  }
}

/**
 * A sync protocol node.
 *
 * Each sync protocol participant may have zero or more nodes.
 */
export interface SyncNode<ID = any> {
  /**
   * Node identifier.
   * This is typically a number or a Name.
   */
  readonly id: ID;

  /**
   * Current sequence number.
   * It can be increased, but cannot be decreased.
   */
  seqNum: number;

  /**
   * Remove this node from participating in the sync protocol.
   * This may or may not have effect, depending on the sync protocol.
   */
  remove(): void;
}

/** A received update regarding a node. */
export class SyncUpdate<ID = any> {
  /**
   * Constructor.
   * @param node the node.
   * @param loSeqNum low sequence number, inclusive.
   * @param hiSeqNum high sequence number, inclusive.
   */
  constructor(
      public readonly node: SyncNode<ID>,
      public readonly loSeqNum: number,
      public readonly hiSeqNum: number,
  ) {
    assert(loSeqNum <= hiSeqNum);
  }

  /** Node identifier. */
  public get id(): ID {
    return this.node.id;
  }

  /** Number of new sequence numbers. */
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

export interface Subscriber<Topic = Name, Update = any, SubscribeInfo = Topic> {
  subscribe: (topic: SubscribeInfo) => Subscription<Topic, Update>;
}

/**
 * A subscription on a topic.
 * Listen to the 'update' event to receive updates on incoming publications matching the topic.
 */
export interface Subscription<Topic = Name, Update = SyncUpdate<Topic>> extends TypedEmitter<Subscription.Events<Update>> {
  /** The topic. */
  readonly topic: Topic;

  /** Unsubscribe. */
  remove(): void;
}

export namespace Subscription {
  export interface Events<Update> {
    /** Emitted when a subscription update is received. */
    update: (update: Update) => void;
  }
}
