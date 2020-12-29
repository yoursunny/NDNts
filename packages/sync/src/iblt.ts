import assert from "minimalistic-assert";

interface Entry {
  count: number;
  keySum: number;
  keyCheck: number;
}

class Hashtable {
  constructor(nEntries: number) {
    this.ab = new ArrayBuffer(4 * (nEntries * 3));
    this.dv = new DataView(this.ab);
  }

  private readonly ab: ArrayBuffer;
  private readonly dv: DataView;

  public get(i: number): Entry {
    return {
      count: this.dv.getInt32(4 * (i * 3 + 0)),
      keySum: this.dv.getUint32(4 * (i * 3 + 1)),
      keyCheck: this.dv.getUint32(4 * (i * 3 + 2)),
    };
  }

  public set(i: number, { count, keySum, keyCheck }: Entry): void {
    this.dv.setInt32(4 * (i * 3 + 0), count);
    this.dv.setUint32(4 * (i * 3 + 1), keySum);
    this.dv.setUint32(4 * (i * 3 + 2), keyCheck);
  }

  public serialize(): Uint8Array {
    return new Uint8Array(this.ab);
  }

  public deserialize(v: Uint8Array): void {
    if (v.byteLength !== this.ab.byteLength) {
      throw new Error("parameter mismatch");
    }
    new Uint8Array(this.ab).set(v);
  }
}

/** Invertible Bloom Lookup Table. */
export class IBLT {
  constructor(p: IBLT.Parameters|IBLT.PreparedParameters) {
    this.p = IBLT.PreparedParameters.prepare(p);
    this.ht = new Hashtable(this.p.nEntries);
  }

  private readonly p: IBLT.PreparedParameters;
  private readonly ht: Hashtable;

  /** Insert a key. */
  public insert(key: number): void {
    this.update(1, key);
  }

  /** Erase a key. */
  public erase(key: number): void {
    this.update(-1, key);
  }

  private checkHash(input: Uint8Array): number {
    return this.p.hash(this.p.checkSeed, input);
  }

  private update(change: number, key: number): void {
    assert(key >= 0);
    assert(key <= 0xFFFFFFFF);
    assert(Math.floor(key) === key);
    const keyB = this.p.uint32ToBuffer(key);
    this.update2(this.ht, change, key, keyB, this.checkHash(keyB));
  }

  private update2(ht: Hashtable, change: number, key: number, keyB: Uint8Array, checkHash: number): void {
    for (let k = 0; k < this.p.nHash; ++k) {
      const h = this.p.hash(k, keyB);
      const i = k * this.p.nBuckets + h % this.p.nBuckets;
      const entry = ht.get(i);
      entry.count += change;
      entry.keySum ^= key;
      entry.keyCheck ^= checkHash;
      ht.set(i, entry);
    }
  }

  /** Compute the difference between this (first) and other (second) IBLT. */
  public diff(other: IBLT): IBLT.Diff {
    assert(this.p.nEntries === other.p.nEntries);
    const peel = new Hashtable(this.p.nEntries);
    for (let i = 0; i < this.p.nEntries; ++i) {
      const a = this.ht.get(i);
      const b = other.ht.get(i);
      peel.set(i, {
        count: a.count - b.count,
        keySum: a.keySum ^ b.keySum,
        keyCheck: a.keyCheck ^ b.keyCheck,
      });
    }

    const positive = new Set<number>();
    const negative = new Set<number>();
    for (let more = true; more; more = false) {
      for (let i = 0; i < this.p.nEntries; ++i) {
        const { count, keySum, keyCheck } = peel.get(i);
        let set: Set<number>;
        switch (count) {
          case 1:
            set = positive;
            break;
          case -1:
            set = negative;
            break;
          default:
            continue;
        }

        const keyB = this.p.uint32ToBuffer(keySum);
        const checkHash = this.checkHash(keyB);
        if (keyCheck !== checkHash) {
          continue;
        }

        set.add(keySum);
        this.update2(peel, -count, keySum, keyB, checkHash);
        more = true;
      }
    }

    let success = true;
    for (let i = 0; i < this.p.nEntries; ++i) {
      const { count, keySum, keyCheck } = peel.get(i);
      if (count !== 0 || keySum !== 0 || keyCheck !== 0) {
        success = false;
        break;
      }
    }

    return { success, positive, negative, total: positive.size + negative.size };
  }

  /**
   * Serialize the hashtable to a byte array.
   *
   * Each entry is serialized as 12 octets:
   * - count: int32
   * - keySum: uint32
   * - keyCheck: uint32
   * These numbers are big endian.
   *
   * Return value shares the underlying memory. It must be copied when not using compression.
   */
  public serialize(): Uint8Array {
    return this.ht.serialize();
  }

  /**
   * Deserialize from a byte array.
   * @throws input does not match parameters.
   */
  public deserialize(v: Uint8Array): void {
    this.ht.deserialize(v);
  }

  /**
   * Clone to another IBLT.
   */
  public clone(): IBLT {
    const copy = new IBLT(this.p);
    copy.ht.deserialize(this.ht.serialize());
    return copy;
  }
}

export namespace IBLT {
  export type HashFunction = (seed: number, input: Uint8Array) => number;

  /** IBLT parameters. */
  export interface Parameters {
    /** A function to convert uint32 key number to Uint8Array. */
    uint32ToBuffer: (n: number) => Uint8Array;

    /** 32-bit hash function. */
    hash: HashFunction;

    /** Number of hash keys. */
    nHash: number;

    /**
     * Hash function seed for KeyCheck field.
     * This must be greater than nHash.
     */
    checkSeed: number;

    /**
     * Number of hashtable entries.
     * This must be divisible by `nHash`.
     */
    nEntries: number;
  }

  export class PreparedParameters implements Readonly<Parameters> {
    public static prepare(p: Parameters) {
      if (p instanceof PreparedParameters) {
        return p;
      }
      return new PreparedParameters(p);
    }

    private constructor({
      uint32ToBuffer,
      hash,
      nHash,
      checkSeed,
      nEntries,
    }: Parameters) {
      assert(nHash >= 1);
      assert(Math.floor(nHash) === nHash);
      assert(checkSeed >= nHash);
      assert(Math.floor(checkSeed) === checkSeed);
      assert(nEntries >= nHash);
      assert(Math.floor(nEntries) === nEntries);
      assert(nEntries % nHash === 0);

      const self = this as Parameters;
      self.uint32ToBuffer = uint32ToBuffer;
      self.hash = hash;
      self.nHash = nHash;
      self.checkSeed = checkSeed;
      self.nEntries = nEntries;
      this.nBuckets = nEntries / nHash;
    }

    public readonly nBuckets: number;
  }
  export interface PreparedParameters extends Readonly<Parameters> {}

  /** Difference between two IBLTs. */
  export interface Diff {
    /** Whether all keys have been extracted. */
    success: boolean;
    /** Keys present in the first IBLT but absent in the second IBLT. */
    positive: Set<number>;
    /** Keys absent in the first IBLT but present in the second IBLT. */
    negative: Set<number>;
    /** Total number of keys in positive and negative sets. */
    total: number;
  }
}
