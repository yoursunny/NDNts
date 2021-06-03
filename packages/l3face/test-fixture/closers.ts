/** A list of objects that can be closed or destroyed. */
export class Closers extends Array<Closer> {
  /** Close all objects and clear the list. */
  public close = () => {
    for (const obj of this) {
      obj.close();
    }
    this.splice(0, Infinity);
  };
}

export interface Closer {
  close: () => void;
}
