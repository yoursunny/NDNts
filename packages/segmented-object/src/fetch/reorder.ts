export class Reorder<T> {
  private next: number;
  private buffer = new Map<number, T>();

  constructor(first = 0) {
    this.next = first;
  }

  public get empty() { return this.buffer.size === 0; }

  public push(index: number, obj: T): T[] {
    if (index >= this.next) {
      this.buffer.set(index, obj);
    }
    return this.pop();
  }

  private pop(): T[] {
    const result = [] as T[];
    while (true) {
      const obj = this.buffer.get(this.next);
      if (obj) {
        result.push(obj);
        this.buffer.delete(this.next++);
      } else {
        break;
      }
    }
    return result;
  }
}
