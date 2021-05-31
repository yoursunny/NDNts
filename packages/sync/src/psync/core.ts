import type { Name } from "@ndn/packet";
import { toHex } from "@ndn/tlv";
import assert from "minimalistic-assert";

import { IBLT } from "../iblt";
import type { SyncNode } from "../types";

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

  public readonly nodes = new Map<string, PSyncNode>(); // prefixHex => node
  public readonly keys = new Map<number, PSyncNode>(); // key => node
  public readonly iblt: IBLT;

  public get(prefix: Name): PSyncNode | undefined {
    return this.nodes.get(toHex(prefix.value));
  }

  public add(prefix: Name): PSyncNode {
    const prefixHex = toHex(prefix.value);
    let node = this.nodes.get(prefixHex);
    if (!node) {
      node = new PSyncNode(this, prefix, prefixHex);
      this.nodes.set(prefixHex, node);
    }
    return node;
  }

  public list(filter: (node: PSyncNode) => boolean): PSyncCore.State {
    const state: PSyncCore.State = [];
    for (const node of this.nodes.values()) {
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
      private readonly prefixHex: string,
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
   * @param v new sequence number.
   * @param triggerEvent whether to trigger onIncreaseSeqNum callback.
   */
  public setSeqNum(v: number, triggerEvent = true): void {
    assert(Math.floor(v) === v);
    assert(v <= Number.MAX_SAFE_INTEGER);
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
    this.c.nodes.delete(this.prefixHex);
  }

  /** Recompute `this.k` after changing sequence number. */
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
