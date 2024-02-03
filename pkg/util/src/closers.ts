import "./polyfill_node";

export interface Closer {
  close(): void;
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
  public close = () => {
    for (let i = this.length - 1; i >= 0; --i) {
      const c: any = this[i]!;
      for (const key of ["close", Symbol.dispose, Symbol.asyncDispose] as const) {
        if (typeof c[key] === "function") {
          c[key]();
          break;
        }
      }
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
