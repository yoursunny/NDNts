import { type Name, NameMap } from "@ndn/packet";
import type { SyncNode } from "@ndn/sync-api";
import { assert } from "@ndn/util";

import { IBLT } from "../iblt";

export class PSyncCore {
  constructor(p: PSyncCore.Parameters) {
    const {
      iblt: ibltParams,
      threshold,
      joinPrefixSeqNum,
    } = p;
    this.threshold = threshold;
    this.joinPrefixSeqNum = joinPrefixSeqNum;

    this.ibltParams = IBLT.PreparedParameters.prepare(ibltParams);
    this.iblt = new IBLT(this.ibltParams);
  }

  public readonly ibltParams: IBLT.PreparedParameters;
  public readonly threshold: number;
  public readonly joinPrefixSeqNum: (ps: PSyncCore.PrefixSeqNum) => PSyncCore.PrefixSeqNumEncoded;

  public readonly nodes = new NameMap<PSyncNode>();
  public readonly keys = new Map<number, PSyncNode>(); // key => node
  public readonly iblt: IBLT;

  public get(prefix: Name): PSyncNode | undefined {
    return this.nodes.get(prefix);
  }

  public add(prefix: Name): PSyncNode {
    let node = this.nodes.get(prefix);
    if (!node) {
      node = new PSyncNode(this, prefix);
      this.nodes.set(prefix, node);
    }
    return node;
  }

  public list(filter: (node: PSyncNode) => boolean): PSyncCore.State {
    const state: PSyncCore.State = [];
    for (const [, node] of this.nodes) {
      if (filter(node)) {
        state.push(node);
      }
    }
    return state;
  }

  public onIncreaseSeqNum?: (node: PSyncNode, prevSeqNum: number, prevKey: number) => void;
}

export namespace PSyncCore {
  export interface PrefixSeqNum {
    prefix: Name;
    seqNum: number;
  }

  export type State = PrefixSeqNum[];

  export interface PrefixSeqNumEncoded {
    readonly value: Uint8Array;
    readonly hash: number;
  }

  export interface Parameters {
    iblt: IBLT.Parameters;

    /** If IBLT diff has at least this number of entries, respond with SyncData right away. */
    threshold: number;

    /** Encode prefix and sequence number to byte array. */
    joinPrefixSeqNum: (ps: PrefixSeqNum) => PrefixSeqNumEncoded;
  }
}

export class PSyncNode implements SyncNode<Name>, PSyncCore.PrefixSeqNum {
  constructor(
      private readonly c: PSyncCore,
      public readonly id: Name,
  ) {
    this.updateKey();
  }

  public get prefix() {
    return this.id;
  }

  public get key() {
    return this.k;
  }

  private seq = 0;
  private k!: number;

  public get seqNum() {
    return this.seq;
  }

  public set seqNum(v: number) {
    this.setSeqNum(v);
  }

  /**
   * Change sequence number, for internal use.
   * @param v - New sequence number.
   * @param triggerEvent - Whether to trigger `.onIncreaseSeqNum` callback.
   */
  public setSeqNum(v: number, triggerEvent = true): void {
    assert(Number.isSafeInteger(v));
    if (v <= this.seq) {
      if (v < this.seq) {
        throw new Error("cannot decrease sequence number");
      }
      return;
    }

    const { seq: prevSeqNum, k: prevKey } = this;
    this.detachKey();

    this.seq = v;
    this.updateKey();

    assert(!this.c.keys.has(this.k)); // algorithm cannot handle hash collision
    this.c.keys.set(this.k, this);
    this.c.iblt.insert(this.k);

    if (triggerEvent) {
      this.c.onIncreaseSeqNum?.(this, prevSeqNum, prevKey);
    }
  }

  public remove() {
    this.detachKey();
    this.c.nodes.delete(this.prefix);
  }

  /** Recompute `.k` after changing sequence number. */
  private updateKey() {
    ({ hash: this.k } = this.c.joinPrefixSeqNum(this));
  }

  private detachKey() {
    if (this.seq > 0 && this.c.keys.get(this.k) === this) {
      this.c.keys.delete(this.k);
      this.c.iblt.erase(this.k);
    }
  }
}
