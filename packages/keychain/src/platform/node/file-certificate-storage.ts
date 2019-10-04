import { Data } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import { Decoder, Encoder } from "@ndn/tlv";

import { Certificate } from "../../cert";
import { CertificateStorage } from "../storage";
import { FileStorage } from "./file-storage";

export class FileCertificateStorage extends FileStorage implements CertificateStorage {
  constructor(dir: string) {
    super(dir, "cert");
  }

  public async get(name: Name): Promise<Certificate> {
    const wire = await this.getImpl(name);
    const data = new Decoder(wire).decode(Data);
    return new Certificate(data);
  }

  public async insert(cert: Certificate): Promise<void> {
    await this.insertImpl(cert.name, Encoder.encode(cert.data));
  }
}
