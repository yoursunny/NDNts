export interface Closer {
  close: () => void;
}

/** A list of objects that can be closed or destroyed. */
export class Closers extends Array {
  /** Close all objects in reverse order and clear the list. */
  public close = () => {
    for (let i = this.length - 1; i >= 0; --i) {
      this[i]!.close();
    }
    this.splice(0, Infinity);
  };

  /** Schedule a timeout or interval to be canceled via .close(). */
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
