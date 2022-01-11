import { Keyword } from "@ndn/naming-convention2";
import { Component, Name, TT } from "@ndn/packet";
import { type Decodable, type EncodableObj, Decoder, Encoder, EvDecoder, Extensible } from "@ndn/tlv";

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

export namespace Metadata {
  export interface Constructor<M extends Metadata = Metadata> extends Decodable<M> {
    new(name?: Name): M;
  }

  /** Class decorator on an extensible Metadata subclass. */
  export function extend<M extends Metadata & Extensible>(ctor: new() => M): void {
    const registry = new ctor()[Extensible.TAG];
    const evd = makeEvd<M>(ctor.name).setUnknown(registry.decodeUnknown);
    Object.defineProperty(ctor, "decodeFrom", { value(decoder: Decoder): M {
      const metadata = new ctor();
      evd.decodeValue(metadata, decoder);
      return metadata;
    } });
    Object.defineProperty(ctor.prototype, "encodeTo", { value(this: M, encoder: Encoder): void {
      encoder.prependValue(this.name, ...registry.encode(this));
    } });
  }
}
