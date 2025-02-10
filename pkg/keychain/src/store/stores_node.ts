import fs from "node:fs/promises";
import path from "node:path";

import { console } from "@ndn/util";

import type { CryptoAlgorithm } from "../key/mod";
import { CertStore } from "./cert-store";
import { KeyStore } from "./key-store";
import { MemoryStoreProvider, type StoreProvider } from "./store-base";

class FileStoreProvider<T> implements StoreProvider<T> {
  public readonly canSClone: boolean = false;
  private ms = new MemoryStoreProvider<T>();
  private loaded = false;
  private saveDebounce?: NodeJS.Timeout;

  constructor(private readonly filename: string) {}

  private async load() {
    if (this.loaded) {
      return;
    }
    try {
      this.ms.record = JSON.parse(await fs.readFile(this.filename, "utf8"));
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "ENOENT" || (err as SyntaxError).name === "SyntaxError") {
        this.ms.record = {};
      } else {
        throw err;
      }
    }
    this.loaded = true;
  }

  private save() {
    if (this.saveDebounce) {
      this.saveDebounce.refresh();
    } else {
      this.saveDebounce = setTimeout(this.doSave, 200);
    }
  }

  private readonly doSave = async () => {
    this.saveDebounce = undefined;
    try {
      await fs.mkdir(path.dirname(this.filename), { recursive: true });
      await fs.writeFile(this.filename, JSON.stringify(this.ms.record));
    } catch (err: unknown) {
      console.error(`FileStoreProvider(${this.filename}) write error ${err}`);
    }
  };

  public async list(): Promise<string[]> {
    await this.load();
    return this.ms.list();
  }

  public async get(key: string): Promise<T> {
    await this.load();
    return this.ms.get(key);
  }

  public async insert(key: string, value: T): Promise<void> {
    await this.load();
    this.ms.insert(key, value);
    this.save();
  }

  public async erase(key: string): Promise<void> {
    await this.load();
    this.ms.erase(key);
    this.save();
  }
}

export function openStores(locator: string, algoList: readonly CryptoAlgorithm[]): [KeyStore, CertStore] {
  return [
    new KeyStore(new FileStoreProvider(`${locator}/fdd08d47-ec4d-4112-a5ce-898338ab0399.json`), algoList),
    new CertStore(new FileStoreProvider(`${locator}/d29e6de4-d5dd-4222-b2e2-d06e4046e7f9.json`)),
  ];
}
