import "./polyfill_node";

import type { Promisable } from "type-fest";
import type { Semaphore } from "wait-your-turn";

export interface Closer {
  close: () => void;
}
export namespace Closer {
  /** Close or dispose an object. */
  export function close(c: any): Promisable<void> {
    for (const key of ["close", Symbol.dispose, Symbol.asyncDispose] as const) {
      if (typeof c[key] === "function") {
        return c[key]();
      }
    }
  }

  /** Convert a closable object to AsyncDisposable. */
  export function asAsyncDisposable(c: Closer | Disposable | AsyncDisposable): AsyncDisposable {
    if (typeof (c as any)[Symbol.asyncDispose] === "function") {
      return c as AsyncDisposable;
    }
    return {
      async [Symbol.asyncDispose]() {
        await close(c);
      },
    };
  }
}

/** A list of objects that can be closed or disposed. */
export class Closers extends Array<Closer | Disposable | AsyncDisposable> implements Disposable {
  /**
   * Close all objects and clear the list.
   *
   * @remarks
   * All objects added to this array are closed, in the reversed order as they appear in the array.
   * This is a synchronous function, so that any AsyncDisposable objects in the array would have its
   * asyncDispose method is called but not awaited.
   * This array is cleared and can be reused.
   */
  public readonly close = () => {
    for (let i = this.length - 1; i >= 0; --i) {
      void Closer.close(this[i]);
    }
    this.splice(0, Infinity);
  };

  public [Symbol.dispose](): void {
    this.close();
  }

  /** Schedule a timeout or interval to be canceled upon close. */
  public addTimeout<T extends NodeJS.Timeout | number>(t: T): T {
    this.push({ close: () => clearTimeout(t) });
    return t;
  }

  /** Wait for close. */
  public wait(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.push({ close: () => resolve() });
    });
  }
}

/**
 * Acquire a semaphore for unlocking via Disposable.
 * @param semaphore - Semaphore or Mutex from `wait-your-turn` package.
 */
export async function lock(semaphore: Pick<Semaphore, "acquire">): Promise<Disposable> {
  const release = await semaphore.acquire();
  return {
    [Symbol.dispose](): void {
      release();
    },
  };
}
