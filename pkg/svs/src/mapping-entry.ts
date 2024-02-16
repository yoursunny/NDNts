import { GenericNumber, Timestamp } from "@ndn/naming-convention2";
import { Component, Name, TT as l3TT } from "@ndn/packet";
import { type Decodable, type Decoder, type Encodable, type EncodableObj, type Encoder, EvDecoder, Extensible, ExtensionRegistry } from "@ndn/tlv";

import { TT } from "./an";

function makeEvd<M extends MappingEntry>(title: string) {
  return new EvDecoder<M>(title)
    .add(TT.SeqNo, (t, { nni }) => t.seqNum = nni, { order: 1, required: true })
    .add(l3TT.Name, (t, { value }) => t.name = new Name(value), { order: 2, required: true });
}

const EVD = makeEvd<MappingEntry>("MappingEntry");

/** SVS-PS MappingEntry element. */
export class MappingEntry implements EncodableObj {
  public seqNum = 0;
  public name = new Name();

  public static decodeFrom(decoder: Decoder): MappingEntry {
    return EVD.decodeValue(new MappingEntry(), decoder);
  }

  public encodeTo(encoder: Encoder): void {
    encoder.prependTlv(TT.MappingEntry,
      [TT.SeqNo, GenericNumber.create(this.seqNum).value],
      this.name,
      ...this.encodeValueExt(),
    );
  }

  protected encodeValueExt(): Encodable[] {
    return [];
  }
}

export namespace MappingEntry {
  export interface Constructor<M extends MappingEntry = MappingEntry> extends Decodable<M> {
    new(): M;
  }

  /** Class decorator on an extensible MappingEntry subclass. */
  export function extend<M extends MappingEntry & Extensible>(
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
    Object.defineProperty(ctor.prototype, "encodeValueExt", {
      value(this: M): Encodable[] {
        return registry.encode(this);
      },
    });
  }
}

const StructFieldTimestampComponent = {
  encode(v: Date) {
    return Timestamp.create(v);
  },
  decode({ vd }: Decoder.Tlv) {
    const comp = vd.decode(Component);
    return comp.is(Timestamp) ? new Date(comp.as(Timestamp)) : new Date();
  },
};

const timedExtensions = new ExtensionRegistry();
timedExtensions.register(Timestamp.type, StructFieldTimestampComponent);

/** SVS-PS MappingEntry with Timestamp element. */
@MappingEntry.extend
export class TimedMappingEntry extends MappingEntry implements Extensible {
  constructor() {
    super();
    this.timestamp = new Date();
  }

  public readonly [Extensible.TAG] = timedExtensions;
  public declare timestamp: Date;
}
Extensible.defineGettersSetters(TimedMappingEntry, {
  timestamp: Timestamp.type,
});
