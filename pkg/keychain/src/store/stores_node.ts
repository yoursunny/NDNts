import fs from "node:fs";
import { dirname } from "node:path";

import { console } from "@ndn/util";

import type { CryptoAlgorithm } from "../key/mod";
import { CertStore } from "./cert-store";
import { KeyStore } from "./key-store";
import { MemoryStoreProvider, type StoreProvider } from "./store-base";

class FileStoreProvider<T> extends MemoryStoreProvider<T> implements StoreProvider<T> {
  public override readonly canSClone: boolean = false;
  private loaded = false;
  private saveDebounce?: NodeJS.Timeout;

  constructor(private readonly path: string) {
    super();
  }

  private load() {
    if (this.loaded) {
      return;
    }
    try {
      this.record = JSON.parse(fs.readFileSync(this.path, "utf8"));
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "ENOENT" || (err as SyntaxError).name === "SyntaxError") {
        this.record = {};
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

  private readonly doSave = () => {
    try {
      fs.mkdirSync(dirname(this.path), { recursive: true });
      fs.writeFileSync(this.path, JSON.stringify(this.record));
    } catch (err: unknown) {
      console.error(`FileStoreProvider(${this.path}) write error ${err}`);
    } finally {
      this.saveDebounce = undefined;
    }
  };

  public override list(): string[] {
    this.load();
    return super.list();
  }

  public override get(key: string): T {
    this.load();
    return super.get(key);
  }

  public override insert(key: string, value: T): void {
    this.load();
    super.insert(key, value);
    this.save();
  }

  public override erase(key: string): void {
    this.load();
    super.erase(key);
    this.save();
  }
}

export function openStores(locator: string, algoList: readonly CryptoAlgorithm[]): [KeyStore, CertStore] {
  return [
    new KeyStore(new FileStoreProvider(`${locator}/fdd08d47-ec4d-4112-a5ce-898338ab0399.json`), algoList),
    new CertStore(new FileStoreProvider(`${locator}/d29e6de4-d5dd-4222-b2e2-d06e4046e7f9.json`)),
  ];
}
