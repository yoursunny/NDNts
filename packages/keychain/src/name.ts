import { Timestamp } from "@ndn/naming-convention2";
import { Component, ComponentLike, Name, NameLike, TT } from "@ndn/packet";

const KEY = new Component(TT.GenericNameComponent, "KEY");

class KeyNameBase {
  public readonly subjectName: Name;
  public readonly keyId: Component;

  constructor(subjectName: NameLike, keyId: ComponentLike) {
    this.subjectName = new Name(subjectName);
    this.keyId = Component.from(keyId);
  }

  protected toKeyName(): Name {
    return this.subjectName.append(KEY, this.keyId);
  }
}

/** Key name in NDN Certificate Format v2. */
export class KeyName extends KeyNameBase {
  /**
   * Create a KeyName from Name, URI, or KeyName.
   * If input is not a KeyName, it's interpreted as subjectName.
   */
  public static create(input: NameLike|KeyName): KeyName {
    if (input instanceof KeyName) {
      return input;
    }
    const name = new Name(input);
    try { return KeyName.from(name); } catch {}
    const timestamp = Timestamp.create(new Date());
    return new KeyName(name, timestamp);
  }

  /** Parse key name. */
  public static from(name: Name): KeyName {
    if (!name.at(-2).equals(KEY)) {
      throw new Error("invalid key name");
    }
    return new KeyName(name.getPrefix(-2), name.get(-1)!);
  }

  /** Retrieve complete name. */
  public get name(): Name {
    return this.toKeyName();
  }
}

/** Certificate name in NDN Certificate Format v2. */
export class CertificateName extends KeyNameBase {
  /** Parse certificate name. */
  public static from(name: Name): CertificateName {
    if (!name.at(-4).equals(KEY)) {
      throw new Error("invalid certificate name");
    }
    return new CertificateName(name.getPrefix(-4),
      ...(name.slice(-3).comps as [Component, Component, Component]));
  }

  public readonly issuerId: Component;
  public readonly version: Component;

  constructor(subjectName: NameLike, keyId: ComponentLike,
      issuerId: ComponentLike, version: ComponentLike) {
    super(subjectName, keyId);
    this.issuerId = Component.from(issuerId);
    this.version = Component.from(version);
  }

  /** Retrieve complete name. */
  public get name(): Name {
    return this.subjectName.append(KEY, this.keyId, this.issuerId, this.version);
  }

  /** Derive key name as KeyName. */
  public get keyName(): KeyName {
    return new KeyName(this.subjectName, this.keyId);
  }

  /** Derive key name as Name. */
  public get key(): Name {
    return this.toKeyName();
  }
}
