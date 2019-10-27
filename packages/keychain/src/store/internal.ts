import { Name } from "@ndn/name";

import { Certificate } from "../cert";
import { PrivateKey, PublicKey } from "../key";
import { KeyGenerator } from "../key/internal";
import { KeyName } from "../name";

interface Store<T> {
  list(): Promise<Name[]>;
  get(name: Name): Promise<T>;
  erase(name: Name): Promise<void>;
}

export interface PrivateKeyStore extends Store<PrivateKey> {
  generate<A extends any[]>(gen: KeyGenerator<A>, name: KeyName,
                            ...args: A): Promise<[PrivateKey, PublicKey]>;
}

export interface CertificateStore extends Store<Certificate> {
  insert(cert: Certificate): Promise<void>;
}
