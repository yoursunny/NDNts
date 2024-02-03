import { asDataView, assert, constrain } from "@ndn/util";

interface Entry {
  count: number;
  keySum: number;
  keyCheck: number;
}

class Hashtable {
  constructor(nEntries: number, private readonly littleEndian: boolean) {
    this.ab = new ArrayBuffer(4 * (nEntries * 3));
    this.dv = new DataView(this.ab);
  }

  private readonly ab: ArrayBuffer;
  private readonly dv: DataView;

  public get(i: number): Entry {
    return {
      count: this.dv.getInt32(4 * (i * 3 + 0), this.littleEndian),
      keySum: this.dv.getUint32(4 * (i * 3 + 1), this.littleEndian),
      keyCheck: this.dv.getUint32(4 * (i * 3 + 2), this.littleEndian),
    };
  }

  public set(i: number, { count, keySum, keyCheck }: Entry): void {
    this.dv.setInt32(4 * (i * 3 + 0), count, this.littleEndian);
    this.dv.setUint32(4 * (i * 3 + 1), keySum, this.littleEndian);
    this.dv.setUint32(4 * (i * 3 + 2), keyCheck, this.littleEndian);
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

class KeyBuffer {
  constructor(private readonly p: IBLT.PreparedParameters) {
    this.dv = asDataView(this.buf);
  }

  public key = 0;
  public readonly buf = new Uint8Array(4);
  private readonly dv: DataView;
  public checkHash = 0;

  public save(key: number): void {
    this.key = key;
    this.dv.setUint32(0, key, this.p.keyToBufferLittleEndian);
    this.checkHash = this.p.hash(this.p.checkSeed, this.buf);
  }
}

/** Invertible Bloom Lookup Table. */
export class IBLT {
  constructor(p: IBLT.Parameters | IBLT.PreparedParameters) {
    this.p = IBLT.PreparedParameters.prepare(p);
    this.ht = new Hashtable(this.p.nEntries, this.p.serializeLittleEndian);
    this.key = new KeyBuffer(this.p);
  }

  private readonly p: IBLT.PreparedParameters;
  private readonly ht: Hashtable;
  private readonly key: KeyBuffer;

  /** Insert a key. */
  public insert(key: number): void {
    this.update(1, key);
  }

  /** Erase a key. */
  public erase(key: number): void {
    this.update(-1, key);
  }

  private update(change: number, key: number): void {
    key = constrain(key, "IBLT.key", 0xFFFFFFFF);
    this.key.save(key);
    this.update2(this.ht, change, key);
  }

  private update2(ht: Hashtable, change: number, keyInput: number): void {
    const { key, buf, checkHash } = this.key;
    assert.equal(key, keyInput);
    for (let k = 0; k < this.p.nHash; ++k) {
      const h = this.p.hash(k, buf);
      const i = k * this.p.nBuckets + h % this.p.nBuckets;
      const entry = ht.get(i);
      entry.count += change;
      entry.keySum ^= key;
      entry.keyCheck ^= checkHash;
      ht.set(i, entry);
    }
  }

  /** Compute the difference between this (first) and other (second) IBLT. */
  public diff(...others: IBLT[]): IBLT.Diff {
    const hts: Hashtable[] = [
      this.ht,
      ...others.map((other) => {
        assert.equal(this.p.nEntries, other.p.nEntries);
        return other.ht;
      }),
    ];

    const peel = new Hashtable(this.p.nEntries, this.p.serializeLittleEndian);
    for (let i = 0; i < this.p.nEntries; ++i) {
      const entries = hts.map((ht) => ht.get(i));
      peel.set(i, entries.reduce((a, b) => ({
        count: a.count - b.count,
        keySum: a.keySum ^ b.keySum,
        keyCheck: a.keyCheck ^ b.keyCheck,
      })));
    }

    const positive = new Set<number>();
    const negative = new Set<number>();
    for (let more = true; more; more = false) {
      for (let i = 0; i < this.p.nEntries; ++i) {
        const { count, keySum, keyCheck } = peel.get(i);
        let set: Set<number>;
        switch (count) {
          case 1: {
            set = positive;
            break;
          }
          case -1: {
            set = negative;
            break;
          }
          default: {
            continue;
          }
        }

        this.key.save(keySum);
        if (keyCheck !== this.key.checkHash) {
          continue;
        }

        set.add(keySum);
        this.update2(peel, -count, keySum);
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
   * @remarks
   * Each entry is serialized as 12 octets:
   * - count: int32
   * - keySum: uint32
   * - keyCheck: uint32
   * IBLT.Parameters.serializeLittleEndian determines endianness.
   *
   * Return value shares the underlying memory. It must be copied when not using compression.
   */
  public serialize(): Uint8Array {
    return this.ht.serialize();
  }

  /**
   * Deserialize from a byte array.
   * @throws Error
   * Thrown if input does not match parameters.
   */
  public deserialize(v: Uint8Array): void {
    this.ht.deserialize(v);
  }

  /** Clone to another IBLT. */
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
    /** Whether to use little endian when converting uint32 key to Uint8Array. */
    keyToBufferLittleEndian: boolean;

    /** Whether to use little endian when serializing uint32 and int32 fields. */
    serializeLittleEndian: boolean;

    /** 32-bit hash function. */
    hash: HashFunction;

    /** Number of hash keys. */
    nHash: number;

    /**
     * Hash function seed for KeyCheck field.
     *
     * @remarks
     * This must be greater than nHash.
     */
    checkSeed: number;

    /**
     * Number of hashtable entries.
     *
     * @remarks
     * This must be divisible by `nHash`.
     */
    nEntries: number;
  }

  /** Normalized and validated parameters. */
  export class PreparedParameters implements Readonly<Parameters> {
    public static prepare(p: Parameters) {
      if (p instanceof PreparedParameters) {
        return p;
      }
      return new PreparedParameters(p);
    }

    private constructor({
      keyToBufferLittleEndian,
      serializeLittleEndian,
      hash,
      nHash,
      checkSeed,
      nEntries,
    }: Parameters) {
      assert(nHash >= 1);
      assert(Number.isSafeInteger(nHash));
      assert(checkSeed >= nHash);
      assert(Number.isSafeInteger(checkSeed));
      assert(nEntries >= nHash);
      assert(Number.isSafeInteger(nEntries));
      assert(nEntries % nHash === 0);

      Object.assign(this, {
        keyToBufferLittleEndian,
        serializeLittleEndian,
        hash,
        nHash,
        checkSeed,
        nEntries,
      });
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
