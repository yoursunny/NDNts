import { Data } from "@ndn/l3pkt";

import { ContentTypeKEY } from "./an";
import { CertificateName } from "./certificate-name";
import { ValidityPeriod } from "./validity-period";

function makeEmptyCertificateData(): Data {
  const data = new Data("/KEY/%00/%00/%FD%00", Data.ContentType(ContentTypeKEY),
                        Data.FreshnessPeriod(3600000));
  ValidityPeriod.set(data.sigInfo, new ValidityPeriod());
  return data;
}

/** NDN Certificate v2. */
export class Certificate {
  public get name() { return this.name_; }
  public set name(v) { this.name_ = v; this.data.name = v.toName(); }

  public get validityPeriod() { return ValidityPeriod.get(this.data.sigInfo)!; }
  public set validityPeriod(v) { ValidityPeriod.set(this.data.sigInfo, v); }

  /** Public key in SubjectPublicKeyInfo binary format. */
  public get publicKey() { return this.data.content; }
  public set publicKey(v) { this.data.content = v; }

  /** Data packet. Do not modify. */
  public readonly data: Data;

  private name_: CertificateName;

  constructor(data?: Data) {
    this.data = data || makeEmptyCertificateData();
    this.name_ = CertificateName.from(this.data.name);
    if (this.data.contentType !== ContentTypeKEY) {
      throw new Error("ContentType must be KEY");
    }
    if (!ValidityPeriod.get(this.data.sigInfo)) {
      throw new Error("ValidityPeriod is missing");
    }
  }
}
