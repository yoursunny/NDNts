import { Keyword } from "@ndn/naming-convention2";
import { type Component, Name, TT } from "@ndn/packet";
import { type Decodable, type Decoder, type EncodableObj, type Encoder, EvDecoder, Extensible } from "@ndn/tlv";

/** `32=metadata` component. */
export const MetadataKeyword: Component = Keyword.create("metadata");

function makeEvd<M extends Metadata>(title: string) {
  return new EvDecoder<M>(title)
    .add(TT.Name, (t, { value }) => t.name = new Name(value), { required: true })
    .setIsCritical(EvDecoder.neverCritical);
}

const EVD = makeEvd<Metadata>("Metadata");

/** Metadata packet content. */
export class Metadata implements EncodableObj {
  /**
   * Constructor.
   * @param name - Versioned name.
   */
  constructor(public name = new Name()) {}

  public static decodeFrom(decoder: Decoder): Metadata {
    return EVD.decodeValue(new Metadata(), decoder);
  }

  public encodeTo(encoder: Encoder): void {
    encoder.prependValue(this.name);
  }
}

export namespace Metadata {
  export interface Constructor<M extends Metadata = Metadata> extends Decodable<M> {
    new(name?: Name): M;
  }

  /** Class decorator on an extensible {@link Metadata} subclass. */
  export function extend<M extends Metadata & Extensible>(
      ctor: new() => M,
      ctx?: ClassDecoratorContext,
  ): void {
    void ctx; // cannot use due to https://github.com/vitest-dev/vitest/issues/3140
    const registry = new ctor()[Extensible.TAG];
    const evd = makeEvd<M>(ctor.name).setUnknown(registry.decodeUnknown);
    Object.defineProperty(ctor, "decodeFrom", {
      value(decoder: Decoder): M {
        return evd.decodeValue(new ctor(), decoder);
      },
    });
    Object.defineProperty(ctor.prototype, "encodeTo", {
      value(this: M, encoder: Encoder): void {
        encoder.prependValue(this.name, ...registry.encode(this));
      },
    });
  }
}
