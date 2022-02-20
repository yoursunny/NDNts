export interface Closer {
  close: () => void;
}

/** A list of objects that can be closed or destroyed. */
export class Closers<V extends Closer = Closer> extends Array<V> {
  /** Close all objects in reverse order and clear the list. */
  public close = () => {
    for (let i = this.length - 1; i >= 0; --i) {
      this[i]!.close();
    }
    this.splice(0, Infinity);
  };

  /**
   * Schedule a timeout or interval to be canceled via .close().
   * This method is only available if this collection is of basic Closer objects.
   */
  public addTimeout: Closer extends V ? (<T extends NodeJS.Timeout | number>(t: T) => T) : unknown =
    ((t: any) => (this as any).push({ close: () => clearTimeout(t) })) as any;
}
