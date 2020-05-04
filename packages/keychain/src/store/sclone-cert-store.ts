import { Data, Name } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";

import { Certificate } from "../mod";
import { CertStore, StoreBase } from "./store-base";

interface Item {
  certBuffer: Uint8Array;
}

/** Certificate store where backend supports structured clone. */
export class SCloneCertStore extends StoreBase<Item> implements CertStore {
  public async get(name: Name): Promise<Certificate> {
    const { certBuffer } = await this.getImpl(name);
    return Certificate.fromData(new Decoder(certBuffer).decode(Data));
  }

  public async insert(cert: Certificate): Promise<void> {
    await this.insertImpl(cert.name, {
      certBuffer: Encoder.encode(cert.data),
    });
  }
}
