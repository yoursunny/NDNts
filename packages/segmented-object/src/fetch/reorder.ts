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

  /** Add a new item, and return in-order items. */
  public push(index: number, obj: T): T[] {
    if (index >= this.next) {
      this.buffer.set(index, obj);
    }
    return this.pop();
  }

  private pop(): T[] {
    const result: T[] = [];
    let obj: T | undefined;
    while ((obj = this.buffer.get(this.next)) !== undefined) {
      result.push(obj);
      this.buffer.delete(this.next++);
    }
    return result;
  }
}
