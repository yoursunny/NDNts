import { Keyword } from "@ndn/naming-convention2";
import { Component, Name, TT } from "@ndn/packet";
import { Decodable, Decoder, EncodableObj, Encoder, EvDecoder, Extensible, ExtensionRegistry } from "@ndn/tlv";

/** 32=metadata component. */
export const MetadataKeyword: Component = Keyword.create("metadata");

function makeEvd<M extends Metadata>(title: string) {
  return new EvDecoder<M>(title)
    .add(TT.Name, (t, { value }) => t.name = new Name(value), { required: true })
    .setIsCritical(() => false);
}

const EVD = makeEvd<Metadata>("Metadata");

/** RDR metadata packet content. */
export class Metadata implements EncodableObj {
  /**
   * Constructor.
   * @param name versioned name.
   */
  constructor(public name = new Name()) {}

  public static decodeFrom(decoder: Decoder): Metadata {
    const metadata = new Metadata();
    EVD.decodeValue(metadata, decoder);
    return metadata;
  }

  public encodeTo(encoder: Encoder): void {
    encoder.prependValue(this.name);
  }
}

interface ExtensibleMetadata extends Metadata, Extensible {}

export namespace Metadata {
  export interface Constructor<M extends Metadata = Metadata> extends Decodable<M> {
    new(name?: Name): M;
  }

  /** Make an extensible Metadata subclass. */
  export function makeExtensible(title: string): [Constructor<ExtensibleMetadata>, ExtensionRegistry<ExtensibleMetadata>] {
    const registry = new ExtensionRegistry<ExtensibleMetadata>();
    const evd = makeEvd<ExtensibleMetadata>(title).setUnknown(registry.decodeUnknown);

    const obj = { [title]: class extends Metadata implements ExtensibleMetadata {
      public readonly [Extensible.TAG] = registry;

      public static override decodeFrom(decoder: Decoder): ExtensibleMetadata {
        const metadata = new obj[title]!();
        evd.decodeValue(metadata, decoder);
        return metadata;
      }

      public override encodeTo(encoder: Encoder): void {
        encoder.prependValue(this.name, ...registry.encode(this));
      }
    } };
    return [obj[title]!, registry];
  }
}
