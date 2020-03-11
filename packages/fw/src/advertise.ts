import { Name } from "@ndn/packet";
import pRetry from "p-retry";

import { Face, FaceImpl } from "./face";
import { FibEntry } from "./fib";

const faceAdvertisements = new WeakMap<Face, WeakSet<FibEntry>>();

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const retryOptions: pRetry.Options = {
  retries: 10,
  minTimeout: 100,
  maxTimeout: 30000,
  randomize: true,
} as pRetry.Options;
// For some reason, @types/retry is invisible during literate run, so we need this 'as'.

/**
 * Prefix readvertise service.
 *
 * This is set on a FwFace if the face is a destination of prefix readvertise.
 */
export abstract class Advertise {
  protected readonly face: FaceImpl;
  private readonly advertisedFibEntries: WeakSet<FibEntry>;

  constructor(face: Face) {
    this.face = face as FaceImpl;

    let advertisedFibEntries = faceAdvertisements.get(face);
    if (!advertisedFibEntries) {
      advertisedFibEntries = new WeakSet<FibEntry>();
      faceAdvertisements.set(face, advertisedFibEntries);
    }
    this.advertisedFibEntries = advertisedFibEntries;
  }

  /** Announce a prefix to the remote peer. */
  public advertise(fibEntry: FibEntry): void {
    if (this.advertisedFibEntries.has(fibEntry)) {
      return;
    }
    this.advertisedFibEntries.add(fibEntry);

    pRetry(async () => {
      if (!this.advertisedFibEntries.has(fibEntry)) {
        return;
      }
      await this.doAdvertise(fibEntry.name);
    }, retryOptions)
      .catch(console.warn);
    // TODO better error handling
  }

  /** Withdraw a prefix announcement. */
  public withdraw(fibEntry: FibEntry): void {
    pRetry(async () => {
      if (!this.advertisedFibEntries.has(fibEntry)) {
        return;
      }
      await this.doWithdraw(fibEntry.name);
    }, retryOptions)
      .catch(console.warn)
      .finally(() => this.advertisedFibEntries.delete(fibEntry));
    // TODO better error handling
  }

  protected abstract doAdvertise(name: Name): Promise<void>;
  protected abstract doWithdraw(name: Name): Promise<void>;
}
