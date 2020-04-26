import { Name } from "@ndn/packet";
import pRetry from "p-retry";

import { Face, FaceImpl } from "./face";

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
  private readonly advertised = new Set<string>();

  constructor(face: Face) {
    this.face = face as FaceImpl;
  }

  /** Announce a prefix to the remote peer. */
  public advertise(name: Name, nameHex: string): void {
    if (this.advertised.has(nameHex)) {
      return;
    }
    this.advertised.add(nameHex);

    pRetry(async () => {
      if (!this.advertised.has(nameHex)) {
        return;
      }
      await this.doAdvertise(name);
    }, retryOptions)
      .catch(console.warn);
    // TODO better error handling
  }

  /** Withdraw a prefix announcement. */
  public withdraw(name: Name, nameHex: string): void {
    pRetry(async () => {
      if (!this.advertised.has(nameHex)) {
        return;
      }
      await this.doWithdraw(name);
    }, retryOptions)
      .catch(console.warn)
      .finally(() => this.advertised.delete(nameHex));
    // TODO better error handling
  }

  protected abstract doAdvertise(name: Name): Promise<void>;
  protected abstract doWithdraw(name: Name): Promise<void>;
}
