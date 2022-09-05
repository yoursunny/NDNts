import { type ConsumerOptions, type RetxPolicy, Endpoint } from "@ndn/endpoint";
import { Certificate, CertNaming } from "@ndn/keychain";
import { type Name, Interest, NameMap } from "@ndn/packet";

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
  }: CacheOptions) {
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

interface CacheOptions {
  /** Cache lifetime for successful retrieval. Default is 1 hour. */
  positiveTtl?: number;
  /** Cache lifetime for unsuccessful retrieval. Default is 10 seconds. */
  negativeTtl?: number;
  /** Cache cleanup interval. Default is 5 minutes. */
  cacheCleanupInterval?: number;
}

const endpointCache = new WeakMap<Endpoint, Cache>();

/** Fetch certificates from network. */
export class CertFetcher implements CertSource {
  constructor(opts: CertFetcher.Options) {
    const {
      endpoint = new Endpoint(),
      interestLifetime,
      retx = 2,
    } = opts;
    this.endpoint = endpoint;
    this.consumerOpts = {
      describe: "trust-schema CertFetcher",
      retx,
    };
    if (interestLifetime) {
      this.consumerOpts.modifyInterest = {
        lifetime: interestLifetime,
      };
    }

    let cache = endpointCache.get(endpoint);
    if (!cache) {
      cache = new Cache(opts);
      endpointCache.set(endpoint, cache);
    }
    this.cache = cache;
  }

  private readonly endpoint: Endpoint;
  private readonly consumerOpts: ConsumerOptions;
  private readonly cache: Cache;

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
      const data = await this.endpoint.consume(interest, this.consumerOpts);
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
  export interface Options extends CacheOptions {
    /**
     * Endpoint for certificate retrieval.
     *
     * CertFetchers on the same Endpoint share the same cache instance.
     * Cache options are determined when it's first created.
     */
    endpoint?: Endpoint;

    /** InterestLifetime for certificate retrieval. */
    interestLifetime?: number;

    /** RetxPolicy for certificate retrieval. */
    retx?: RetxPolicy;
  }
}
