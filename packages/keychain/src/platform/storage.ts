import { Name } from "@ndn/name";

import { Certificate } from "../cert";
import { PrivateKey } from "../key";

interface Storage<T> {
  list(): Promise<Name[]>;
  get(name: Name): Promise<T>;
  insert(item: T): Promise<void>;
  erase(name: Name): Promise<void>;
}

export type PrivateKeyStorage = Storage<PrivateKey>;

export type CertificateStorage = Storage<Certificate>;
