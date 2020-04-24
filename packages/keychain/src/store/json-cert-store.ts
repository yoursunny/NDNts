import { Data, Name } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";

import { Certificate } from "../mod";
import { CertStore, StoreBase } from "./store-base";

interface Item {
  certBase64: string;
}

/** Certificate store where backend supports JSON only. */
export class JsonCertStore extends StoreBase<Item> implements CertStore {
  public async get(name: Name): Promise<Certificate> {
    const item = await this.getImpl(name);
    const wire = Buffer.from(item.certBase64, "base64") as Uint8Array;
    return new Certificate(new Decoder(wire).decode(Data));
  }

  public async insert(cert: Certificate): Promise<void> {
    const wire = Encoder.encode(cert.data);
    await this.insertImpl(cert.name, {
      certBase64: Buffer.from(wire).toString("base64"),
    });
  }
}
