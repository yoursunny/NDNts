import { Component, ComponentLike, Name, NameLike, TT } from "@ndn/name";

const KEY = new Component(TT.GenericNameComponent, "KEY");

export class CertificateName {
  public static from(name: Name): CertificateName {
    if (!name.at(-4).equals(KEY)) {
      throw new Error("invalid certificate name");
    }
    return new CertificateName(name.getPrefix(-4),
           ...(name.slice(-3).comps as [Component, Component, Component]));
  }

  public subjectName: Name;
  public keyId: Component;
  public issuerId: Component;
  public version: Component;

  constructor(subjectName: NameLike, keyId: ComponentLike,
              issuerId: ComponentLike, version: ComponentLike) {
    this.subjectName = new Name(subjectName);
    this.keyId = Component.from(keyId);
    this.issuerId = Component.from(issuerId);
    this.version = Component.from(version);
  }

  public toName() {
    return this.subjectName.append(KEY, this.keyId, this.issuerId, this.version);
  }
}
