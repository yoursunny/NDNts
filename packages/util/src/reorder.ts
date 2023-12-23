/** Reorder items according to their index numbers. */
export class Reorder<T> {
  private next: number;
  private readonly buffer = new Map<number, T>();

  constructor(first = 0) {
    this.next = first;
  }

  /** Return number of items in buffer. */
  public get size() { return this.buffer.size; }

  /** Determine whether buffer is empty, i.e. all items emitted. */
  public get empty() { return this.buffer.size === 0; }

  /** Add a new item. */
  public push(index: number, obj: T): void {
    if (index >= this.next) {
      this.buffer.set(index, obj);
    }
  }

  /** Return and remove in-order items. */
  public shift(): T[] {
    const result: T[] = [];
    while (this.buffer.has(this.next)) {
      result.push(this.buffer.get(this.next)!);
      this.buffer.delete(this.next);
      ++this.next;
    }
    return result;
  }
}
