import { Name } from "@ndn/name";
import throat from "throat";

interface JsonObjectStore {
  load(): Promise<object>;
  store(obj: object): Promise<void>;
}

class InMemoryObjectStore {
  private obj: object = {};
  public async load(): Promise<object> { return this.obj; }
  public async store(obj: object): Promise<void> { this.obj = obj; }
}

export abstract class JsonStoreBase<T> {
  private throttle = throat(1);

  constructor(private readonly os: JsonObjectStore = new InMemoryObjectStore()) {
  }

  public list(): Promise<Name[]> {
    return this.throttle(async () => {
      const items = await this.getItems();
      return Object.keys(items).map((uri) => new Name(uri));
    });
  }

  public erase(name: Name): Promise<void> {
    return this.throttle(async () => {
      const items = await this.getItems();
      delete items[name.toString()];
      await this.putItems(items);
    });
  }

  protected getImpl(name: Name): Promise<T> {
    return this.throttle(async () => {
      const items = await this.getItems();
      const item: T|undefined = items[name.toString()];
      if (typeof item === "undefined") {
        throw new Error(`${name} does not exist in storage`);
      }
      return item;
    });
  }

  protected insertImpl(name: Name, item: T): Promise<void> {
    return this.throttle(async () => {
      const items = await this.getItems();
      items[name.toString()] = item;
      await this.putItems(items);
    });
  }

  private async getItems(): Promise<Record<string, T>> {
    return await this.os.load() as Record<string, T>;
  }

  private async putItems(items: Record<string, T>): Promise<void> {
    await this.os.store(items);
  }
}
