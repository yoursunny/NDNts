import { Data } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import { Decoder, Encoder } from "@ndn/tlv";

import { Certificate } from "..";
import { CertStore, StoreBase } from "./store-base";

interface Item {
  certBuffer: Uint8Array;
}

export class SCloneCertStore extends StoreBase<Item> implements CertStore {
  public async get(name: Name): Promise<Certificate> {
    const { certBuffer } = await this.getImpl(name);
    return new Certificate(new Decoder(certBuffer).decode(Data));
  }

  public async insert(cert: Certificate): Promise<void> {
    await this.insertImpl(cert.name, {
      certBuffer: Encoder.encode(cert.data),
    });
  }
}
