/**
 * Map that transforms keys.
 * @typeParam K - Input key type.
 * @typeParam V - Value type.
 * @typeParam I - Indexable key type.
 * @typeParam L - Lookup key type.
 */
export class KeyMap<K, V, I, L = K> implements Iterable<[key: K, value: V]> {
  /**
   * Constructor.
   * @param keyOf - Function to transform input key to indexable key.
   */
  constructor(private readonly keyOf: (key: K | L) => I) {}

  private readonly m = new Map<I, [key: K, value: V]>();

  public get size() { return this.m.size; }

  public has(key: K | L): boolean {
    return this.m.has(this.keyOf(key));
  }

  public get(key: K | L): V | undefined {
    return this.m.get(this.keyOf(key))?.[1];
  }

  public set(key: K, value: V): this {
    this.m.set(this.keyOf(key), [key, value]);
    return this;
  }

  public delete(key: K | L): boolean {
    return this.m.delete(this.keyOf(key));
  }

  public [Symbol.iterator](): IterableIterator<[key: K, value: V]> {
    return this.m.values();
  }
}

/**
 * MultiMap that transforms keys.
 * @typeParam K - Input key type.
 * @typeParam V - Value type.
 * @typeParam I - Indexable key type.
 * @typeParam L - Lookup key type.
 */
export class KeyMultiMap<K, V, I, L = K> implements Iterable<[key: K, value: V]> {
  /**
   * Constructor.
   * @param keyOf - Function to transform input key to indexable key.
   */
  constructor(keyOf: (key: K | L) => I) {
    this.m = new KeyMap<K, Set<V>, I, L>(keyOf);
  }

  private readonly m: KeyMap<K, Set<V>, I, L>;
  private size_ = 0;

  /** Number of distinct keys. */
  public get dimension() { return this.m.size; }

  /** Number of values. */
  public get size() { return this.size_; }

  /** Count values associated with a key. */
  public count(key: K | L): number {
    return this.m.get(key)?.size ?? 0;
  }

  /** List values associated with a key. */
  public list(key: K | L): ReadonlySet<V> {
    return this.m.get(key) ?? new Set<V>();
  }

  /**
   * Add a key-value pair.
   * Values are stored in a Set, so duplicates are skipped.
   * @returns count(key) after the operation.
   */
  public add(key: K, value: V): number {
    let c = this.m.get(key);
    if (!c) {
      c = new Set<V>();
      this.m.set(key, c);
    }

    const n = c.size;
    c.add(value);
    this.size_ += c.size - n;
    return c.size;
  }

  /**
   * Remove a key-value pair.
   * No-op if key-value does not exist.
   * @returns `count(key)` after the operation.
   */
  public remove(key: K | L, value: V): number {
    const c = this.m.get(key);
    if (!c) {
      return 0;
    }

    const n = c.size;
    c.delete(value);
    this.size_ += c.size - n;
    if (c.size === 0) {
      this.m.delete(key);
    }
    return c.size;
  }

  /** Iterate over key and associated values. */
  public associations(): IterableIterator<[key: K, values: ReadonlySet<V>]> {
    return this.m[Symbol.iterator]();
  }

  /** Iterate over key-value pairs. */
  public *[Symbol.iterator](): IterableIterator<[key: K, value: V]> {
    for (const [key, values] of this.associations()) {
      for (const value of values) {
        yield [key, value];
      }
    }
  }
}

/** Container that associates a key with multiple distinct values. */
export class MultiMap<K, V> extends KeyMultiMap<K, V, K> {
  constructor() {
    super((k) => k);
  }
}

/**
 * MultiSet that transforms keys.
 * @typeParam K - Input key type.
 * @typeParam I - Indexable key type.
 * @typeParam L - Lookup key type.
 */
export class KeyMultiSet<K, I, L=K> {
  /**
   * Constructor.
   * @param keyOf - Function to transform input key to indexable key.
   */
  constructor(keyOf: (key: K | L) => I) {
    this.m = new KeyMap<K, number, I, L>(keyOf);
  }

  private readonly m: KeyMap<K, number, I, L>;
  private size_ = 0;

  /** Number of distinct keys. */
  public get dimension() { return this.m.size; }

  /** Number of values. */
  public get size() { return this.size_; }

  /** Count occurrences of a key. */
  public count(key: K | L): number {
    return this.m.get(key) ?? 0;
  }

  /**
   * Add a key.
   * @returns Number of occurrences after the operation.
   */
  public add(key: K): number {
    const n = this.count(key) + 1;
    this.m.set(key, n);
    ++this.size_;
    return n;
  }

  /**
   * Remove a key.
   * No-op if key does not exist.
   * @returns Number of occurrences after the operation.
   */
  public remove(key: K): number {
    let n = this.count(key);
    if (n === 0) {
      return n;
    }

    --this.size_;
    --n;
    if (n === 0) {
      this.m.delete(key);
    } else {
      this.m.set(key, n);
    }
    return n;
  }

  /** Iterate over key and number of occurrences. */
  public multiplicities(): IterableIterator<[key: K, count: number]> {
    return this.m[Symbol.iterator]();
  }
}
