import { consume, type ConsumerOptions } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Certificate, CertNaming } from "@ndn/keychain";
import { Interest, type Name, NameMap } from "@ndn/packet";

import type { CertSource } from "./types";

interface CacheEntry {
  expire: number;
  cert?: Certificate;
}

class Cache {
  private readonly table = new NameMap<CacheEntry>();
  private nextCleanup = 0;
  private readonly positiveTtl: number;
  private readonly negativeTtl: number;
  private readonly cleanupInterval: number;

  constructor({
    positiveTtl = 3600_000,
    negativeTtl = 10_000,
    cacheCleanupInterval = 300_000,
  }: CertFetcher.CacheOptions) {
    this.positiveTtl = positiveTtl;
    this.negativeTtl = negativeTtl;
    this.cleanupInterval = cacheCleanupInterval;
  }

  public lookup(name: Name): CacheEntry | undefined {
    const now = this.cleanup();
    const entry = this.table.get(name);
    if (entry && entry.expire < now) {
      this.table.delete(name);
      return undefined;
    }
    return entry;
  }

  public addPositive(cert: Certificate): void {
    const now = this.cleanup();
    const entry: CacheEntry = {
      expire: now + this.positiveTtl,
      cert,
    };
    this.table.set(cert.name, entry);
    this.table.set(CertNaming.toKeyName(cert.name), entry);
  }

  public addNegative(name: Name): void {
    const now = this.cleanup();
    this.table.set(name, {
      expire: now + this.negativeTtl,
    });
  }

  private cleanup(): number {
    const now = Date.now();
    if (this.nextCleanup < now) {
      for (const [key, { expire }] of this.table) {
        if (expire < now) {
          this.table.delete(key);
        }
      }
      this.nextCleanup = now + this.cleanupInterval;
    }
    return now;
  }
}

const cacheMap = new WeakMap<object, Cache>();

/** Fetch certificates from network. */
export class CertFetcher implements CertSource {
  constructor(opts: CertFetcher.Options) {
    const {
      owner: ownerInput,
      cOpts,
      interestLifetime,
    } = opts;

    this.cOpts = {
      describe: "trust-schema CertFetcher",
      ...cOpts,
    };
    if (interestLifetime !== undefined) {
      this.cOpts.modifyInterest = {
        lifetime: interestLifetime,
      };
    }

    const owner = ownerInput ?? cOpts?.fw ?? Forwarder.getDefault();
    let cache = cacheMap.get(owner);
    if (!cache) {
      cache = new Cache(opts);
      cacheMap.set(owner, cache);
    }
    this.cache = cache;
  }

  private readonly cOpts: ConsumerOptions;
  private readonly cache: Cache;

  /**
   * Fetch certificates from network by certificate name or key name.
   * Upon successful retrieval, yields the certificate.
   * Upon unsuccessful retrieval, ends the iterable without yielding.
   * Retrieval result is cached for a period of time.
   */
  public async *findCerts(keyLocator: Name): AsyncIterable<Certificate> {
    const cached = this.cache.lookup(keyLocator);
    if (cached) {
      if (cached.cert) {
        yield cached.cert;
      }
      return;
    }

    const interest = new Interest(keyLocator);
    if (!CertNaming.isCertName(keyLocator)) {
      interest.canBePrefix = true;
      interest.mustBeFresh = true;
    }
    let cert: Certificate;
    try {
      const data = await consume(interest, this.cOpts);
      cert = Certificate.fromData(data);
      this.cache.addPositive(cert);
    } catch {
      this.cache.addNegative(keyLocator);
      return;
    }
    yield cert;
  }
}

export namespace CertFetcher {
  export interface CacheOptions {
    /**
     * Cache lifetime for successful retrieval, in milliseconds.
     * @defaultValue 1 hour
     *
     * @remarks
     * During this period, return the same certificate instead of re-fetching.
     */
    positiveTtl?: number;

    /**
     * Cache lifetime for unsuccessful retrieval, in milliseconds.
     * @defaultValue 10 seconds
     *
     * @remarks
     * During this period, report the certificate as un-retrievable instead of re-fetching.
     */
    negativeTtl?: number;

    /**
     * Cache cleanup interval, in milliseconds.
     * @defaultValue 5 minutes
     *
     * @remarks
     * This determines how often expired cache entries are deleted.
     */
    cacheCleanupInterval?: number;
  }

  export interface Options extends CacheOptions {
    /**
     * Cache instance owner as WeakMap key.
     * @defaultValue `.cOpts.fw ?? Forwarder.getDefault()`
     *
     * @remarks
     * {@link CertFetcher}s with the same `.owner` share the same cache instance.
     * Cache options are determined when it's first created.
     */
    owner?: object;

    /**
     * Consumer options.
     *
     * @remarks
     * - `.describe` defaults to "CertFetcher".
     */
    cOpts?: ConsumerOptions;

    /**
     * InterestLifetime for certificate retrieval.
     *
     * @remarks
     * If specified, `.cOpts.modifyInterest` is overridden.
     */
    interestLifetime?: number;
  }
}
