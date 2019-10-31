// Incomplete typing for https://github.com/jonschlinkert/data-store
declare module "data-store" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  class Store {
    constructor(options: { path: string });
    set(key: string, value: unknown): this;
    get(key: string): unknown|undefined;
    del(key: string): this;
    readonly data: Record<string, unknown>;
  }
}
